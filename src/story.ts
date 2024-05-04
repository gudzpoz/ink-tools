import type {
  Type_funcWithParams,
  Type_sequence,
} from './auto-types';
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
} from './types';
import PoorOldInkSerializer from './decompiler';

type InkVariableType = string | number | boolean;

type JSONPath = (string | number)[];

export type Options = {
  text: string,
  link: string,
  inline: boolean,
  condition: boolean,
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

  private outputBuffer: string[];

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
    this.outputBuffer = [];
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
    this.outputBuffer = [];
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

  private getReadCount(name: string): number {
    const [absKnot, absStitch] = this.getAbsKnotStitch(name);
    return this.environment.history[absKnot]?.[absStitch ?? ''] ?? 0;
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
        this.outputBuffer.push(typed.value as string);
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

  private collectOutputBuffer() {
    if (this.outputBuffer.length === 0) {
      return null;
    }
    const output = this.outputBuffer.join('');
    this.outputBuffer = [];
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

  /**
   * 这边是主要故事内容。
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
      return (last === 'cycle' || last === 'sequence')
        ? ` <span class="end">${last}</span>` : null;
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
        return typed.value as string;
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
        const cond = condition ? 'true' : 'false';
        return `${this.collectOutputBuffer() ?? ''}
<span class="condition"><span class="${cond}">${
  escapeHtml(this.decompiler.serializeExpr(typed.value.condition))
}</span><span class="result ${cond} ${
  typed.value.otherwise ? 'has_otherwise' : ''
}">=${escapeHtml(JSON.stringify(condition))}</span></span>`;
      }
      case 'building': {
        const output = await this.evaluateExpr(typed.value);
        return `<span class="call">${escapeHtml(typed.value.buildingBlock)}()</span>
        <br>${this.collectOutputBuffer() ?? ''}${output as string}`;
      }
      case 'do': {
        await this.evaluateExpr(typed.value.doFuncs);
        return `<span class="expr">${escapeHtml(this.decompiler.serializeDoFuncsNode(typed.value))}</span>
        <br>${this.collectOutputBuffer() ?? ''}`;
      }
      case 'divert': {
        await this.divertTo(typed.value.divert);
        return `<span class="divert">-&gt; ${escapeHtml(typed.value.divert)}</span>`;
      }
      case 'cycle':
      case 'sequence': {
        const [contents, cycleI] = this.getCycleDetails(typed);
        const key = typed.type;
        (ip[ip.length - 1] as number) -= 1;
        ip.push(key, cycleI, 0);
        return `<span class="start">${typed.type}(${cycleI + 1}/${contents.length})</span> `;
      }
      case 'option': {
        const option = typed.value;
        const options: Options = [{
          text: option.option,
          link: option.linkPath,
          inline: option.inlineOption ?? false,
          condition: true,
        }];
        if (option.condition) {
          const condition = await this.evaluateExpr(option.condition);
          options[0].condition = !!condition;
          options[0].text = `${this.collectOutputBuffer() ?? ''}
<span class="condition"><span class="${condition ? 'true' : 'false'}">${
  escapeHtml(this.decompiler.serializeExpr(option.condition))
}</span><span class="result">=${JSON.stringify(condition)}</span></span>
${options[0].text}`;
        }
        const peek = await this.getCurrent();
        if (!peek) {
          return options;
        }
        const nextType = annotateInkBlockType(peek).type;
        if (nextType === 'option' || nextType === 'condition') {
          try {
            const moreOptions = await this.getUntilNext();
            if (Array.isArray(moreOptions)) {
              options.push(...moreOptions);
            }
          } catch (e) {
            if (!this.expectError(e, 'ended')) {
              throw e;
            }
          }
        }
        return options;
      }
      default:
        return `<br><br>${JSON.stringify(typed.value)}`;
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
    const [absKnot, absStitch] = this.getAbsKnotStitch(divert);
    if (!this.environment.history[absKnot]) {
      this.environment.history[absKnot] = {};
    }
    if (!this.environment.history[absKnot][absStitch ?? '']) {
      this.environment.history[absKnot][absStitch ?? ''] = 0;
    }
    this.environment.history[absKnot][absStitch ?? ''] += 1;
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
      }];
    }
    return text;
  }
}
