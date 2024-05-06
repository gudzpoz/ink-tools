import type {
  Type_funcWithParams,
  Type_sequence,
  Type_set,
} from '../auto-types';
import {
  TypedInkBlockWithKeys,
  annotateInkBlockType,
  type InkBlock,
  type InkChunkNode,
  type InkChunkWithStitches,
  type InkFuncType,
  type InkRootNode,
  type JSONPath,
  type TypedCycleNode,
} from '../types';
import PoorOldInkSerializer from '../decompiler';
import { evaluateSequentially } from './utils';

export type InkVariableType = string | number | boolean;

export type DebugInfo = {
  info: string,
  usedVariables?: string[],
  usedFunctions?: string[],
  usedKnots?: string[],
};

export type Options = {
  text: string,
  link: string,
  inline: boolean,
  condition: boolean,
  debug: (string | DebugInfo)[],
}[];

export type StoryLine = string | DebugInfo | Options;

type InkCallStack = JSONPath[];

interface InkEnvironment {
  variables: { [key: string]: InkVariableType };
  history: Record<string, Record<string, number>>;
  callStack: InkCallStack;
  cycleCounts: Record<string, number>;
}

interface InkReturnValue {
  returned: boolean;
  value: InkVariableType;
  name: string;
}

function escapeHtml(html: string): string {
  const text = document.createTextNode(html);
  const p = document.createElement('p');
  p.appendChild(text);
  return p.innerHTML;
}

export function isParameterName(name: string): boolean {
  return name.startsWith('__bb');
}

function shallowCopy<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj)) as T;
}

type ConditionTrack = {
  variables: Set<string>,
  functions: Set<string>,
  knots: Set<string>,
};

type Message = 'return' | 'ended' | 'divert_in_function';

export type RunnerListener = (
  event: {
    type: 'variable',
    name: string,
    value: InkVariableType,
  } | {
    type: 'read_count',
    knot: string,
    stitch?: string,
  },
) => void;

export class InkStoryRunner {
  environment: InkEnvironment;

  private chunkCaches: {
    original: Record<string, InkChunkNode>;
    external: Record<string, InkChunkNode>;
  };

  private returnStack: InkReturnValue[];

  private conditionTrackStack: ConditionTrack[];

  private debugExprIp: JSONPath;

  private collectingOptions: boolean;

  /**
   * 一般我们直接返回输出就可以了。
   * 但有些时候（例如函数求值时），输出基本是个副作用，就需要输出到这边来。
   * 函数求值完之后直接输出并清空。
   *
   * Debug 信息也放在这边。
   * `string` 是正经输出，数组是 Options，其它是 debug 信息。
   */
  private dumbBuffer: (string | DebugInfo)[];

  private decompiler: PoorOldInkSerializer;

  useExternal: boolean;

  logPaths: boolean;

  listener?: RunnerListener;

  constructor(root: InkRootNode) {
    this.useExternal = true;
    this.logPaths = false;
    this.chunkCaches = {
      original: {
        '': root,
      },
      external: {
        '': JSON.parse(JSON.stringify(root)) as InkRootNode,
      },
    };
    this.debugExprIp = [];
    this.collectingOptions = false;
    this.returnStack = [];
    this.conditionTrackStack = [];
    this.dumbBuffer = [];
    this.decompiler = new PoorOldInkSerializer(root, () => 1);
    this.environment = this.newEnvironment();
  }

  save(): InkEnvironment {
    return {
      variables: shallowCopy(this.environment.variables),
      history: Object.fromEntries(Object.entries(this.environment.history)
        .map(([k, v]) => [k, shallowCopy(v)])),
      callStack: [this.copyIp()],
      cycleCounts: { ...this.environment.cycleCounts },
    };
  }

  copyIp(): JSONPath {
    return [...this.getIp()];
  }

  async load(environment: InkEnvironment) {
    this.environment = environment;
    await this.getCurrent();
  }

  private getRoot(): InkRootNode {
    return (this.useExternal ? this.chunkCaches.external[''] : this.chunkCaches.original['']) as InkRootNode;
  }

  newEnvironment(): InkEnvironment {
    return {
      variables: Object.fromEntries(Object.entries(this.getRoot().variables)),
      history: {},
      callStack: [],
      cycleCounts: {},
    };
  }

  async init(initial?: string) {
    if (!initial && this.environment.callStack.length > 0) {
      return;
    }
    this.dumbBuffer = [];
    this.returnStack = [];
    this.environment = this.newEnvironment();
    this.environment.callStack = [[]];
    await this.divertTo(`:${initial ?? this.getRoot().initial}`);
  }

  async copyChunk(name: string): Promise<InkBlock | InkRootNode> {
    return JSON.parse(await this.getChunkText(name)) as InkBlock | InkRootNode;
  }

  async getChunkText(name: string): Promise<string> {
    if (name === '') {
      return JSON.stringify(this.getRoot());
    }
    const chunkUrl = new URL(`../../data/chunks/${name}.json`, import.meta.url).href;
    const text = await fetch(chunkUrl).then((r) => r.text());
    return text;
  }

  private async getChunk(name: string): Promise<InkChunkNode> {
    const root = this.useExternal ? this.chunkCaches.external : this.chunkCaches.original;
    if (root[name]) {
      return root[name];
    }

    this.chunkCaches.original[name] = await this.copyChunk(name);
    const chunk = await this.copyChunk(name);
    this.loadExternalChunk(name, chunk);
    return this.getChunk(name);
  }

  loadExternalChunk(name: string, json: InkChunkNode) {
    this.chunkCaches.external[name] = json;
  }

  private expectError(e: unknown, message: Message) {
    if (typeof e === 'string' && e === message) {
      return true;
    }
    return false;
  }

  private throwError(message: Message): never {
    // 性能优化，Error 需要 stack trace 会耗很多性能。
    throw message as unknown;
  }

  getVariableNames() {
    return Object.keys(this.environment.variables);
  }

  private track(key: keyof ConditionTrack, value: string) {
    if (this.conditionTrackStack.length > 0) {
      this.conditionTrackStack[this.conditionTrackStack.length - 1][key].add(value);
    }
  }

  getVar(name: string) {
    if (!isParameterName(name)) {
      this.track('variables', name);
    }
    return this.environment.variables[name];
  }

  setVar(name: string, value: boolean | string | number) {
    if (this.listener && !isParameterName(name)) {
      this.listener({
        type: 'variable',
        name,
        value,
      });
    }
    if (value === undefined) {
      delete this.environment.variables[name];
    } else {
      this.environment.variables[name] = value;
    }
  }

  private getAbsKnotStitch(divert: string): [string, string | undefined] {
    const [stitch, absKnot, absStitch] = divert.split(':');
    if (stitch !== '') {
      return this.getAbsKnotStitch(`:${this.getIp()[0]}:${stitch}`);
    }
    return [absKnot, absStitch];
  }

  getReadCount(name: string): number {
    const [absKnot, absStitch] = this.getAbsKnotStitch(name);
    this.track('knots', `:${absKnot}${absStitch ? `:${absStitch}` : ''}`);
    return this.environment.history[absKnot]?.[absStitch ?? ''] ?? 0;
  }

  setReadCount(name: string, count: number) {
    const [absKnot, absStitch] = this.getAbsKnotStitch(name);
    if (!this.environment.history[absKnot]) {
      this.environment.history[absKnot] = {};
    }
    this.environment.history[absKnot][absStitch ?? ''] = count;
  }

  /**
   * @param expr 表达式
   */
  private async evaluateExpr(
    path: JSONPath,
  ): Promise<string | number | boolean> {
    this.debugExprIp = path;
    const expr: InkBlock | InkBlock[] | undefined = await this.getCurrent(path);
    if (expr === undefined) {
      return '';
    }
    if (typeof expr !== 'object') {
      return expr;
    }
    if (Array.isArray(expr)) {
      await evaluateSequentially(
        expr.map((_, i) => () => this.evaluateExpr([...path, i])),
      );
      return '';
    }
    const typed = annotateInkBlockType(expr);
    switch (typed.type) {
      case 'get': {
        return this.getVar((await this.evaluateExpr(typed.join(path, 'get'))) as string);
      }
      case 'set': {
        const name = await this.evaluateExpr(typed.join(path, 'set', 0));
        const value = await this.evaluateExpr(typed.join(path, 'set', 1));
        this.setVar(name as string, value);
        return '';
      }
      case 'return': {
        const result = await this.evaluateExpr(typed.join(path, 'return'));
        const eax = this.returnStack[this.returnStack.length - 1];
        eax.returned = true;
        eax.value = result;
        return this.throwError('return');
      }
      case 'func': {
        return this.evaluateFuncExpr(path, typed);
      }
      case 'building': {
        const { buildingBlock } = typed.value;
        this.track('functions', buildingBlock);
        const params = await evaluateSequentially(
          Object.keys(typed.value.params).map((name) => async () => [
            name,
            await this.evaluateExpr(typed.join(path, 'params', name as never)),
          ]),
        );
        this.returnStack.push({
          returned: false,
          value: '',
          name: buildingBlock,
        });
        const callerSaved = params.map(([name]) => [name, this.getVar(name as string)]);
        params.forEach(([name, value]) => this.setVar(name as string, value));
        try {
          await this.evaluateBuildingBlocks(['', 'buildingBlocks', buildingBlock]);
        } catch (e) {
          if (!this.expectError(e, 'return')) {
            this.returnStack.pop();
            throw e;
          }
        }
        callerSaved.forEach(([name, value]) => this.setVar(name as string, value));
        return this.returnStack.pop()!.value;
      }
      default:
        throw new Error(`Unknown expr type: ${typed.type} (${Object.keys(expr).join(', ')})`);
    }
  }

  private async evaluateBuildingBlocks(
    path: JSONPath,
  ): Promise<InkVariableType> {
    const blocks = await this.getCurrent(path);
    if (!blocks) {
      return '';
    }
    if (Array.isArray(blocks)) {
      await evaluateSequentially(
        blocks.map((_, i) => () => this.evaluateBuildingBlocks([...path, i])),
      );
      return '';
    }

    const typed = annotateInkBlockType(blocks);
    switch (typed.type) {
      case 'value': {
        this.output(typed.value as string);
        if (this.logPaths) {
          console.log(`@ ${this.returnStack[this.returnStack.length - 1].name}:`, typed.value);
        }
        return typed.value;
      }
      case 'building':
      case 'return': {
        return this.evaluateExpr(path);
      }
      case 'condition': {
        const condition = await this.evaluateExpr(typed.join(path, 'condition'));
        if (condition) {
          return this.evaluateBuildingBlocks(typed.join(path, 'then'));
        }
        if (typed.value.otherwise) {
          return this.evaluateBuildingBlocks(typed.join(path, 'otherwise'));
        }
        return '';
      }
      case 'do': {
        return this.evaluateExpr(typed.join(path, 'doFuncs'));
      }
      case 'cycle':
      case 'sequence': {
        const [, cycleI] = this.getCycleDetails(typed, path);
        return this.evaluateBuildingBlocks(typed.join(path, typed.type as never, cycleI));
      }
      case 'action':
      case 'custom': {
        return `<br><br>${JSON.stringify(typed.value)}`;
      }
      case 'divert': {
        // 函数里面出现了 divert，不知道怎么处理。总之就清空 stack 然后跳转吧……
        this.environment.callStack = [[]];
        await this.divertTo(typed.value.divert);
        return this.throwError('divert_in_function');
      }
      default:
        throw new Error(`Unknown node: ${typed.type} (${Object.keys(blocks).join(', ')})`);
    }
  }

  private getCycleDetails(block: TypedCycleNode, path: JSONPath): [Type_sequence, number] {
    const contents = block.type === 'cycle' ? block.value.cycle : block.value.sequence;
    const key = path.join('.');
    const count = this.environment.cycleCounts[key] ?? 0;
    this.environment.cycleCounts[key] = count + 1;
    return [
      contents,
      block.type === 'cycle' ? count % (contents.length) : Math.min(contents.length - 1, count),
    ];
  }

  private async evaluateFuncExpr(
    path: JSONPath,
    typed: TypedInkBlockWithKeys<'func', Type_funcWithParams>,
  ): Promise<string | number | boolean> {
    const funcExpr = await this.getCurrent(path) as Type_funcWithParams | undefined;
    if (!funcExpr) {
      return '';
    }
    const [p1, p2] = await evaluateSequentially(
      funcExpr.params.map((_, i) => () => this.evaluateExpr(typed.join(path, 'params', i))),
    );
    // 不知道 Ink 是不是动态类型的，所以下面全是 == 和 !=。
    switch (funcExpr.func as InkFuncType) {
      case 'Add':
        return (p1 as number) + (p2 as number);
      case 'And':
        return p1 && p2;
      case 'Decrement':
        this.setVar(p1 as string, (this.getVar(p1 as string) as number) - 1);
        return '';
      case 'Divide':
        // Ink 的数字应该只有整数。
        return (p1 as number - (p1 as number % (p2 as number))) / (p2 as number);
      case 'Equals':
        // eslint-disable-next-line eqeqeq
        return p1 == p2;
      case 'FlagIsNotSet':
        return !this.getVar(p1 as string);
      case 'FlagIsSet':
        return !!this.getVar(p1 as string);
      case 'GreaterThan':
        return (p1 as number) > (p2 as number);
      case 'GreaterThanOrEqualTo':
        return (p1 as number) >= (p2 as number);
      case 'HasNotRead':
        // eslint-disable-next-line eqeqeq
        return this.getReadCount(p1 as string) == 0;
      case 'HasRead':
        return this.getReadCount(p1 as string) > 0;
      case 'Increment':
        this.setVar(p1 as string, (this.getVar(p1 as string) as number) + 1);
        return '';
      case 'LessThan':
        return (p1 as number) < (p2 as number);
      case 'LessThanOrEqualTo':
        return (p1 as number) <= (p2 as number);
      case 'Log10':
        return Math.floor(Math.log10(p1 as number));
      case 'Mod':
        return (p1 as number) % (p2 as number);
      case 'Multiply':
        return (p1 as number) * (p2 as number);
      case 'Not':
        return !p1;
      case 'NotEquals':
        // eslint-disable-next-line eqeqeq
        return (p1 as number) != (p2 as number);
      case 'Or':
        return p1 || p2;
      case 'Subtract':
        return (p1 as number) - (p2 as number);
      default:
        throw new Error(`Unknown operator: ${funcExpr.func}`);
    }
  }

  private output(value: string) {
    this.dumbBuffer.push(value);
  }

  private debug(
    info: string,
    usedVariables?: Set<string>,
    usedFunctions?: Set<string>,
    usedKnots?: Set<string>,
  ) {
    this.dumbBuffer.push({
      info,
      usedVariables: usedVariables && [...usedVariables],
      usedFunctions: usedFunctions && [...usedFunctions],
      usedKnots: usedKnots && [...usedKnots],
    });
  }

  private collectOutputBuffer(force?: boolean): (string | DebugInfo)[] {
    if (!force && !this.dumbBuffer.some(
      (e) => (typeof e === 'string' && e !== ''),
    )) {
      return [];
    }
    const output = this.dumbBuffer;
    this.dumbBuffer = [];
    return output;
  }

  private async getCurrent(path?: JSONPath): Promise<InkBlock | undefined> {
    const ip = path ?? this.getIp();
    await this.getChunk(ip[0] as string);
    return ip.reduce(
      (node, key) => (node as Record<string, unknown>)?.[key],
      (this.useExternal ? this.chunkCaches.external : this.chunkCaches.original) as unknown,
    ) as InkBlock | undefined;
  }

  private async evaluateCondition(
    path: JSONPath,
    expr: Type_set[number],
    elseClass: string,
  ): Promise<boolean> {
    this.conditionTrackStack.push({ variables: new Set(), functions: new Set(), knots: new Set() });
    const condition = await this.evaluateExpr(path);
    const { variables, functions, knots } = this.conditionTrackStack.pop()!;
    const cond = condition ? 'true' : 'false';
    this.debug(
      `<span class="condition"><span class="${cond}">${
        escapeHtml(this.decompiler.serializeExpr(expr, []).toString())
      }</span><span class="result ${cond} ${
        elseClass
      }">=${escapeHtml(JSON.stringify(condition))}</span></span>`,
      variables,
      functions,
      knots,
    );
    return !!condition;
  }

  /**
   * 这边是主要故事内容。
   *
   * 有可能会 throw 一个 ended 的错误，用来指示故事结束。
   * 不希望结束的 catch 一下即可。
   */
  private async getNext(): Promise<StoryLine[] | null> {
    const ip = this.getIp();
    const path = this.copyIp();
    const current = await this.getCurrent();
    // IP 自动推进到下一各元素
    if (typeof ip[ip.length - 1] !== 'number') {
      throw new Error('Invalid IP');
    }
    if (current === undefined) {
      let last: string | number = '';
      do {
        last = ip.pop()!;
        // until goes a level up
      } while (typeof last === 'number');
      if (ip.length === 0 || typeof ip[ip.length - 1] !== 'number') {
        return this.throwError('ended');
      }
      (ip[ip.length - 1] as number) += 1;
      if (last === 'cycle' || last === 'sequence') {
        this.debug(` <span class="end">${last}</span>`);
      }
      return null;
    }
    (ip[ip.length - 1] as number) += 1;

    const typed = annotateInkBlockType(current);
    switch (typed.type) {
      case 'value': {
        if (this.logPaths) {
          (ip[ip.length - 1] as number) -= 1;
          console.log(`@ ${ip.join('.')}:`, typed.value);
          (ip[ip.length - 1] as number) += 1;
        }
        this.output(typed.value as string);
        return this.collectOutputBuffer();
      }
      case 'condition': {
        const condition = await this.evaluateCondition(
          typed.join(path, 'condition'),
          typed.value.condition,
          typed.value.otherwise ? 'has_otherwise' : '',
        );
        if (condition) {
          (ip[ip.length - 1] as number) -= 1;
          ip.push('then', 0);
        } else if (typed.value.otherwise) {
          (ip[ip.length - 1] as number) -= 1;
          ip.push('otherwise', 0);
        }
        return null;
      }
      case 'building': {
        const name = escapeHtml(typed.value.buildingBlock);
        this.debug(`<span class="call">${name}(${
          Object.entries(typed.value.params)
            .map(([, v]) => `${this.decompiler.serializeExpr(v ?? 'undefined', []).toString()}`)
            .join(', ')
        })</span> `);
        const output = await this.evaluateExpr(path);
        this.output(`${output}`);
        this.debug(`<span class="return">${name}</span>`);
        return this.collectOutputBuffer();
      }
      case 'do': {
        await this.evaluateExpr(typed.join(path, 'doFuncs'));
        this.debug(
          `<span class="expr">${escapeHtml(this.decompiler.serializeDoFuncsNode(typed.value, path).toString())}</span>
          <br>`,
        );
        return this.collectOutputBuffer();
      }
      case 'divert': {
        await this.divertTo(typed.value.divert);
        this.debug(`<span class="divert">-&gt; ${escapeHtml(typed.value.divert)}</span>`);
        return null;
      }
      case 'cycle':
      case 'sequence': {
        const [contents, cycleI] = this.getCycleDetails(typed, path);
        const key = typed.type;
        (ip[ip.length - 1] as number) -= 1;
        ip.push(key, cycleI, 0);
        this.debug(`<span class="start">${
          typed.type
        }<span class="count">(${cycleI + 1}/${contents.length})</span></span> `);
        return null;
      }
      case 'option': {
        const option = typed.value;
        const thisOption = {
          text: option.option,
          link: option.linkPath,
          inline: option.inlineOption ?? false,
          condition: true,
          default: false,
          debug: [],
        };
        const options: Options = [thisOption];
        const output: StoryLine[] = [];
        // 第一个选项的时候先把之前没有输出的都一股脑输出出去。
        // 如果是之后跟的选项那么把输出放在选项内的 debug 里。
        const isProcessingFirstOption = !this.collectingOptions;
        if (isProcessingFirstOption) {
          output.push(...this.collectOutputBuffer(true));
          this.collectingOptions = true;
        }
        output.push(options);

        if (option.condition) {
          const condition = await this.evaluateCondition(
            typed.join(path, 'condition'),
            option.condition,
            '',
          );
          options[0].condition = !!condition;
        }
        // 这里的 collectOutputBuffer 都需要加 force=true。
        options[0].debug = this.collectOutputBuffer(true);
        // 开始 options 时已经没必要注意恢复现场了，因为之后必定会 divert。
        const next = await this.getUntilNext();
        if (!next) {
          // 已经收集了到故事结束为止的选项，这里递归调用开始返回。
          return output;
        }
        const last = next[0];
        if (Array.isArray(last)) {
          // 如果是选项则加到候选列表中。
          options.push(...last);
          // 除了最外层的第一个选项其它都应该只返回单个选项。
          if (next.length !== 1) {
            throw new Error('Expecting a single `Options`');
          }
        } else {
          // 如果不是选项，则这个时候输出的值是默认选项，在递归完之后再处理。
          if (next.some((e) => Array.isArray(e))) {
            throw new Error('Expecting no option when visiting a default option');
          }
          this.dumbBuffer.push(
            ...(next as (string | DebugInfo)[]),
          );
        }
        if (isProcessingFirstOption) {
          // 恢复现场。
          this.collectingOptions = false;
          // 递归完了，如果 options 全部不可选的话输出默认选项。
          if (options.every((o) => !o.condition)) {
            output.push(...this.collectOutputBuffer());
          } else {
            // 否则的话把这期间的输出丢弃。
            // TODO: 其实还是有点问题，例如默认选项的一个元素是带有副作用的函数调用的话那就麻烦了……
            this.collectOutputBuffer(true);
          }
        }
        return output;
      }
      default:
        this.output(`<br><br>${JSON.stringify(typed.value)}`);
        return this.collectOutputBuffer();
    }
  }

  async selectOption(options: Options, index: number) {
    const option = options[index];
    if (!option) {
      throw new Error('Invalid option index');
    }
    await this.divertTo(option.link);
  }

  async divertTo(divert: string) {
    if (this.logPaths) {
      console.log(` -> ${divert}`);
    }
    const ip = this.getIp();
    this.setReadCount(divert, this.getReadCount(divert) + 1);
    const [absKnot, absStitch] = this.getAbsKnotStitch(divert);
    if (this.listener) {
      this.listener({
        type: 'read_count',
        knot: absKnot,
        stitch: absStitch,
      });
    }
    const chunk = await this.getChunk(absKnot);
    if (Array.isArray(chunk)) {
      ip.splice(1);
      ip[0] = absKnot;
      ip.push(0);
    } else if (Object.keys(chunk).length === 0) {
      this.throwError('ended');
    } else {
      const knot = chunk as InkChunkWithStitches;
      if (!absStitch) {
        await this.divertTo(`:${absKnot}:${knot.initial}`);
        return;
      }
      ip.splice(1);
      ip[0] = absKnot;
      ip.push('stitches', absStitch, 'content', 0);
    }
  }

  private getIp() {
    return this.environment.callStack[this.environment.callStack.length - 1];
  }

  /**
   * @returns 返回 null 时必定是故事已经结束了
   */
  private async getUntilNext(): Promise<StoryLine[] | null> {
    await this.init();
    try {
      const text = await this.getNext();
      if (!text || text.length === 0) {
        return await this.getUntilNext();
      }
      return text;
    } catch (e) {
      if (!this.expectError(e, 'divert_in_function')) {
        if (!this.expectError(e, 'ended')) {
          console.log(e);
        }
        return null;
      }
      return await this.getUntilNext();
    }
  }

  async next(): Promise<StoryLine[] | null> {
    const output = await this.getUntilNext();
    return output?.map((o) => {
      if (Array.isArray(o) && o.length === 0) {
        return [{
          text: '>>> No option offered. Please report this bug. <<<',
          link: this.getIp()[0] as string,
          inline: false,
          condition: false,
          debug: [],
        }] as Options;
      }
      return o;
    }) ?? null;
  }
}
