import type {
  Type_funcWithParams,
  Type_sequence,
  Type_set,
} from '../auto-types';
import {
  annotateInkBlockType,
  type InkBlock,
  type InkBuildingBlockExpr,
  type InkChunkNode,
  type InkChunkWithStitches,
  type InkExpr,
  type InkFuncType,
  type InkRootNode,
  type TypedCycleNode,
} from '../types';
import PoorOldInkSerializer from '../decompiler';

type InkVariableType = string | number | boolean;

type JSONPath = (string | number)[];

export type Options = {
  text: string,
  link: string,
  inline: boolean,
  condition: boolean,
  default: boolean,
}[];

type InkCallStack = JSONPath[];

interface InkEnvironment {
  variables: { [key: string]: InkVariableType };
  history: Record<string, Record<string, number>>;
  callStack: InkCallStack;
  cycleCounts: Map<object, number>;
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

/**
 * 因为 JS 里的 Promise 并没有 back-pressure 的概念，所以只能再用一层函数来包装。
 *
 * @param promises 顺序执行的函数
 */
async function evaluateSequentially(promises: (() => Promise<unknown>)[]): Promise<void> {
  for (let i = 0; i < promises.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await promises[i]();
  }
}

function shallowCopy<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj)) as T;
}

type Message = 'return' | 'ended' | 'divert_in_function';

export class InkStoryRunner {
  environment: InkEnvironment;

  private chunkCaches: {
    original: Record<string, InkChunkNode>;
    external: Record<string, InkChunkNode>;
  };

  private returnStack: InkReturnValue[];

  /**
   * 一般我们直接返回输出就可以了。
   * 但有些时候（例如函数求值时），输出基本是个副作用，就需要输出到这边来。
   * 函数求值完之后直接输出并清空。
   *
   * Debug 信息也放在这边。
   */
  private dumbBuffer: {
    type: 'output' | 'debug',
    value: string,
  }[];

  private decompiler: PoorOldInkSerializer;

  useExternal: boolean;

  logPaths: boolean;

  constructor(root: InkRootNode) {
    this.useExternal = true;
    this.logPaths = false;
    this.chunkCaches = {
      original: {
        '': root,
      },
      external: {
        '': JSON.parse(JSON.stringify(root)),
      },
    };
    this.returnStack = [];
    this.dumbBuffer = [];
    this.decompiler = new PoorOldInkSerializer(root);
    this.environment = this.newEnvironment();
  }

  save(): InkEnvironment {
    return {
      variables: shallowCopy(this.environment.variables),
      history: Object.fromEntries(Object.entries(this.environment.history)
        .map(([k, v]) => [k, shallowCopy(v)])),
      callStack: [[...this.getIp()]],
      cycleCounts: new Map(this.environment.cycleCounts),
    };
  }

  copyIp(): JSONPath {
    return [...this.getIp()];
  }

  async load(environment: InkEnvironment) {
    this.environment = environment;
    await this.getCurrent();
  }

  getVariables() {
    return this.environment.variables;
  }

  private getRoot(): InkRootNode {
    return (this.useExternal ? this.chunkCaches.external[''] : this.chunkCaches.original['']) as InkRootNode;
  }

  newEnvironment(): InkEnvironment {
    return {
      variables: Object.fromEntries(Object.entries(this.getRoot().variables)),
      history: {},
      callStack: [],
      cycleCounts: new Map(),
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

  async copyChunk(name: string) {
    return JSON.parse(await this.getChunkText(name));
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

    const text = await this.getChunkText(name);
    this.chunkCaches.original[name] = JSON.parse(text);
    const chunk = JSON.parse(text) as InkChunkNode;
    this.loadExternalChunk(name, chunk);
    return this.getChunk(name);
  }

  loadExternalChunk(name: string, json: InkChunkNode) {
    this.chunkCaches.external[name] = json;
  }

  private expectError(e: unknown, message: Message) {
    if (e instanceof Error && e.message === message) {
      return true;
    }
    return false;
  }

  private throwError(message: Message): never {
    throw new Error(message);
  }

  private getVar(name: string) {
    return this.environment.variables[name];
  }

  private setVar(name: string, value: boolean | string | number) {
    this.environment.variables[name] = value;
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
    expr: InkExpr | InkExpr[],
  ): Promise<string | number | boolean> {
    if (typeof expr !== 'object') {
      return expr;
    }
    if (Array.isArray(expr)) {
      await evaluateSequentially(
        expr.map((e) => () => this.evaluateExpr(e)),
      );
      return '';
    }
    const typed = annotateInkBlockType(expr);
    switch (typed.type) {
      case 'get': {
        return this.getVar((await this.evaluateExpr(typed.value.get)) as string);
      }
      case 'set': {
        const [nameExpr, valueExpr] = typed.value.set;
        const name = await this.evaluateExpr(nameExpr);
        const value = await this.evaluateExpr(valueExpr);
        this.setVar(name as string, value);
        return '';
      }
      case 'return': {
        const result = await this.evaluateExpr(typed.value.return);
        const eax = this.returnStack[this.returnStack.length - 1];
        eax.returned = true;
        eax.value = result;
        return this.throwError('return');
      }
      case 'func': {
        return this.evaluateFuncExpr(typed.value);
      }
      case 'building': {
        const { buildingBlock } = typed.value;
        const params = await Promise.all(
          Object.entries(typed.value.params).map(async ([name, e]) => [
            name,
            await this.evaluateExpr(e ?? ''),
          ]),
        );
        const body = this.getRoot().buildingBlocks[buildingBlock];
        this.returnStack.push({
          returned: false,
          value: '',
          name: buildingBlock,
        });
        params.forEach(([name, value]) => this.setVar(name as string, value));
        try {
          await this.evaluateBuildingBlocks(body);
        } catch (e) {
          if (!this.expectError(e, 'return')) {
            this.returnStack.pop();
            throw e;
          }
        }
        return this.returnStack.pop()!.value;
      }
      default:
        throw new Error(`Unknown expr type: ${typed.type} (${Object.keys(expr)})`);
    }
  }

  private async evaluateBuildingBlocks(
    blocks: InkBuildingBlockExpr | InkBuildingBlockExpr[],
  ): Promise<InkVariableType> {
    if (Array.isArray(blocks)) {
      await evaluateSequentially(
        blocks.map((b) => () => this.evaluateBuildingBlocks(b)),
      );
      return '';
    }

    const typed = annotateInkBlockType(blocks);
    switch (typed.type) {
      case 'value': {
        this.output('output', typed.value as string);
        if (this.logPaths) {
          console.log(`@ ${this.returnStack[this.returnStack.length - 1].name}:`, typed.value);
        }
        return typed.value;
      }
      case 'building':
      case 'return': {
        return this.evaluateExpr(typed.value);
      }
      case 'condition': {
        const condition = await this.evaluateExpr(typed.value.condition);
        if (condition) {
          return this.evaluateBuildingBlocks(typed.value.then as InkBuildingBlockExpr[]);
        }
        if (typed.value.otherwise) {
          return this.evaluateBuildingBlocks(typed.value.otherwise as InkBuildingBlockExpr[]);
        }
        return '';
      }
      case 'do': {
        return this.evaluateExpr(typed.value.doFuncs);
      }
      case 'cycle':
      case 'sequence': {
        const [contents, cycleI] = this.getCycleDetails(typed);
        return this.evaluateBuildingBlocks(contents[cycleI] as InkBuildingBlockExpr[]);
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
        throw new Error(`Unknown node: ${typed.type} (${Object.keys(blocks)})`);
    }
  }

  private getCycleDetails(block: TypedCycleNode): [Type_sequence, number] {
    const contents = block.type === 'cycle' ? block.value.cycle : block.value.sequence;
    const count = this.environment.cycleCounts.get(block) ?? 0;
    this.environment.cycleCounts.set(block, count + 1);
    return [
      contents,
      block.type === 'cycle' ? count % (contents.length) : Math.min(contents.length - 1, count),
    ];
  }

  private async evaluateFuncExpr(
    funcExpr: Type_funcWithParams,
  ): Promise<string | number | boolean> {
    const [p1, p2] = await Promise.all(
      funcExpr.params.map((p) => this.evaluateExpr(p)),
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
        return Math.floor((p1 as number) / (p2 as number));
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
        return Math.log10(p1 as number);
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

  output(type: 'output' | 'debug', value: string) {
    this.dumbBuffer.push({ type, value });
  }

  private collectOutputBuffer() {
    if (!this.dumbBuffer.some((e) => e.type === 'output' && e.value !== '')) {
      return null;
    }
    const output = this.dumbBuffer.map((o) => o.value).join('');
    this.dumbBuffer = [];
    return output;
  }

  private async getCurrent(): Promise<InkBlock | undefined> {
    const ip = this.getIp();
    await this.getChunk(ip[0] as string);
    return ip.reduce(
      (node, key) => node?.[key],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.useExternal ? this.chunkCaches.external : this.chunkCaches.original) as any,
    );
  }

  private outputDebugCondition(
    condition: InkVariableType,
    expr: Type_set[number],
    elseClass: string,
  ) {
    const cond = condition ? 'true' : 'false';
    this.output('debug', `<span class="condition"><span class="${cond}">${
      escapeHtml(this.decompiler.serializeExpr(expr))
    }</span><span class="result ${cond} ${
      elseClass
    }">=${escapeHtml(JSON.stringify(condition))}</span></span>`);
  }

  /**
   * 这边是主要故事内容。
   *
   * 有可能会 throw 一个 ended 的错误，用来指示故事结束。
   * 不希望结束的 catch 一下即可。
   */
  private async getNext(): Promise<string | Options | null> {
    const ip = this.getIp();
    const current = await this.getCurrent();
    // IP 自动推进到下一各元素
    if (typeof ip[ip.length - 1] !== 'number') {
      throw new Error('Invalid IP');
    }
    if (!current) {
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
        this.output('debug', ` <span class="end">${last}</span>`);
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
        this.output('output', typed.value as string);
        return this.collectOutputBuffer() ?? '';
      }
      case 'condition': {
        const condition = await this.evaluateExpr(typed.value.condition);
        if (condition) {
          (ip[ip.length - 1] as number) -= 1;
          ip.push('then', 0);
        } else if (typed.value.otherwise) {
          (ip[ip.length - 1] as number) -= 1;
          ip.push('otherwise', 0);
        }
        this.outputDebugCondition(
          condition,
          typed.value.condition,
          typed.value.otherwise ? 'has_otherwise' : '',
        );
        return null;
      }
      case 'building': {
        const name = escapeHtml(typed.value.buildingBlock);
        this.output('debug', `<span class="call">${name}(${
          Object.entries(typed.value.params)
            .map(([, v]) => `${this.decompiler.serializeExpr(v ?? 'undefined')}`)
            .join(', ')
        })</span> `);
        const output = await this.evaluateExpr(typed.value);
        this.output('output', `${output}`);
        this.output('debug', `<span class="return">${name}</span>`);
        return this.collectOutputBuffer();
      }
      case 'do': {
        await this.evaluateExpr(typed.value.doFuncs);
        this.output(
          'debug',
          `<span class="expr">${escapeHtml(this.decompiler.serializeDoFuncsNode(typed.value))}</span>
          <br>`,
        );
        return this.collectOutputBuffer();
      }
      case 'divert': {
        await this.divertTo(typed.value.divert);
        this.output('debug', `<span class="divert">-&gt; ${escapeHtml(typed.value.divert)}</span>`);
        return null;
      }
      case 'cycle':
      case 'sequence': {
        const [contents, cycleI] = this.getCycleDetails(typed);
        const key = typed.type;
        (ip[ip.length - 1] as number) -= 1;
        ip.push(key, cycleI, 0);
        this.output('debug', `<span class="start">${typed.type}<span class="count">(${cycleI + 1}/${contents.length})</span></span> `);
        return null;
      }
      case 'option': {
        const option = typed.value;
        const options: Options = [{
          text: '',
          link: option.linkPath,
          inline: option.inlineOption ?? false,
          condition: true,
          default: false,
        }];
        if (option.condition) {
          const condition = await this.evaluateExpr(option.condition);
          options[0].condition = !!condition;
          this.outputDebugCondition(
            condition,
            option.condition,
            '',
          );
        }
        this.output('output', option.option);
        options[0].text = this.collectOutputBuffer() ?? '';
        // 开始 options 时已经没必要注意恢复现场了，因为之后必定会 divert。
        const next = await this.getUntilNext();
        if (!next) {
          return options;
        }
        if (Array.isArray(next)) {
          options.push(...next);
        } else {
          // 这个时候输出的值是默认选项，在递归完之后再处理。
          this.output('output', next);
        }
        // 递归完了，如果 options 全部不可选的话输出默认选项。
        if (options.every((o) => !o.condition)) {
          options.push({
            text: this.collectOutputBuffer() ?? '',
            link: '',
            inline: options[0].inline,
            condition: false,
            default: true,
          });
        }
        return options;
      }
      default:
        this.output('output', `<br><br>${JSON.stringify(typed.value)}`);
        return this.collectOutputBuffer() ?? '';
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
    console.log(` -> ${divert}`);
    const ip = this.getIp();
    this.setReadCount(divert, this.getReadCount(divert) + 1);
    const [absKnot, absStitch] = this.getAbsKnotStitch(divert);
    const chunk = await this.getChunk(absKnot);
    if (Array.isArray(chunk)) {
      ip.splice(1);
      ip[0] = absKnot;
      ip.push(0);
    } else if (Object.keys(chunk).length === 0) {
      this.throwError('ended');
    } else {
      const knot = chunk as InkChunkWithStitches;
      const stitch = absStitch ?? knot.initial;
      ip.splice(1);
      ip[0] = absKnot;
      ip.push('stitches', stitch, 'content', 0);
    }
  }

  private getIp() {
    return this.environment.callStack[this.environment.callStack.length - 1];
  }

  /**
   * @returns 返回 null 时必定是故事已经结束了
   */
  private async getUntilNext(): Promise<string | Options | null> {
    await this.init();
    try {
      const text = await this.getNext();
      if (!text) {
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

  async next(): Promise<string | Options | null> {
    const text = await this.getUntilNext();
    if (Array.isArray(text) && text.length === 0) {
      return [{
        text: '>>> No option offered. Please report this bug. <<<',
        link: this.getIp()[0] as string,
        inline: false,
        condition: false,
        default: false,
      }];
    }
    return text;
  }
}
