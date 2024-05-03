import type {
  Type_funcWithParams,
  Type_sequence,
} from '../auto-types';
import {
  TypedCycleNode,
  annotateInkBlockType,
  type InkBlock,
  type InkBuildingBlockExpr,
  type InkChunkNode,
  type InkChunkWithStitches,
  type InkExpr,
  type InkFuncType,
  type InkRootNode,
} from '../types';

type InkVariableType = string | number | boolean;

type JSONPath = (string | number)[];

export type Options = {
  text: string,
  link: string,
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

export class InkStoryRunner {
  environment: InkEnvironment;

  private chunkCache: Record<string, InkChunkNode>;

  private returnStack: InkReturnValue[];

  private outputBuffer: string[];

  constructor(public root: InkRootNode) {
    this.chunkCache = {};
    this.returnStack = [];
    this.outputBuffer = [];
    this.environment = this.newEnvironment();
  }

  newEnvironment(): InkEnvironment {
    return {
      variables: Object.fromEntries(Object.entries(this.root.variables)),
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
    await this.divertTo(`:${initial ?? this.root.initial}`);
  }

  private async getChunk(name: string): Promise<InkChunkNode> {
    if (this.chunkCache[name]) {
      return this.chunkCache[name];
    }

    const chunkUrl = new URL(`../../data/chunks/${name}.json`, import.meta.url)
      .href;
    const chunk = await fetch(chunkUrl).then((r) => r.json());
    this.chunkCache[name] = chunk;
    return chunk;
  }

  private expectError(e: unknown, message: 'return' | 'ended' | 'divert_in_function') {
    if (e instanceof Error && e.message === message) {
      return true;
    }
    return false;
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
        throw new Error('return');
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
        const body = this.root.buildingBlocks[buildingBlock];
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
        throw new Error('divert_in_function');
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
      this.chunkCache as any,
    );
  }

  private async getNext(): Promise<string | Options | null> {
    const ip = this.getIp();
    const current = await this.getCurrent();
    // IP 自动推进到下一各元素
    if (typeof ip[ip.length - 1] !== 'number') {
      throw new Error('Invalid IP');
    }
    if (!current) {
      do {
        while (typeof ip.pop() === 'number') {
          // until goes a level up
        }
        if (ip.length === 0 || typeof ip[ip.length - 1] !== 'number') {
          throw new Error('ended');
        }
        (ip[ip.length - 1] as number) += 1;
      // eslint-disable-next-line no-await-in-loop
      } while (!(await this.getCurrent()));
      return null;
    }
    (ip[ip.length - 1] as number) += 1;

    const typed = annotateInkBlockType(current);
    switch (typed.type) {
      case 'value': {
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
        return this.collectOutputBuffer();
      }
      case 'building': {
        const output = await this.evaluateExpr(typed.value);
        return `${this.collectOutputBuffer() ?? ''}${output as string}`;
      }
      case 'do': {
        await this.evaluateExpr(typed.value.doFuncs);
        return this.collectOutputBuffer();
      }
      case 'divert': {
        await this.divertTo(typed.value.divert);
        return null;
      }
      case 'cycle':
      case 'sequence': {
        const [, cycleI] = this.getCycleDetails(typed);
        const key = typed.type;
        (ip[ip.length - 1] as number) -= 1;
        ip.push(key, cycleI, 0);
        return null;
      }
      case 'option': {
        let prefix = '';
        const option = typed.value;
        const options: Options = [{
          text: prefix + option.option,
          link: option.linkPath,
        }];
        if (option.condition) {
          const condition = await this.evaluateExpr(option.condition);
          prefix = this.collectOutputBuffer() ?? '';
          if (!condition) {
            options.pop();
          }
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
      throw new Error('ended');
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
        return await this.next();
      }
      return text;
    } catch (e) {
      if (!this.expectError(e, 'divert_in_function')) {
        console.log(e);
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
      }];
    }
    return text;
  }
}
