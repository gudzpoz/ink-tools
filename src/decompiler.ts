import {
  Type_actionTag,
  Type_buildingBlockWithParams,
  Type_conditionThen,
  Type_customDictionary,
  Type_cycleNode,
  Type_divertNode,
  Type_doFuncsNode,
  Type_funcWithParams,
  Type_get,
  Type_optionLink,
  Type_returnNode,
  Type_sequenceNode,
  Type_set,
} from './auto-types';
import { InkBlock, InkChunkNode, InkChunkWithStitches, InkFuncType, InkRootNode } from './types';

/**
 * 把 Ink JSON 文件反序列化为 Ink 文本。
 *
 * 基本上就是按照类型信息来就好。
 *
 * 虽然想弄成无状态的，但是记录缩进太麻烦了。
 */
class PoorOldInkSerializer {
  root: InkRootNode;
  indentation: number;
  argStack: Set<string>[];

  constructor(root: InkRootNode) {
    this.root = root;
    this.indentation = 0;
    this.argStack = [];
  }

  reset() {
    this.indentation = 0;
  }

  serializeActionTag(tag: Type_actionTag) {
    return `${this.nl()}#${tag.action} // ${
      tag.userInfo ? JSON.stringify(tag.userInfo) : ''
    }`;
  }

  nl() {
    return '\n' + '    '.repeat(this.indentation);
  }

  checkIfIsArg(name: string) {
    if (name.startsWith('__bb')) {
      if (this.argStack.length > 0) {
        this.argStack[this.argStack.length - 1].add(name);
      }
    }
    return name;
  }

  fixDivertFormat(divert: string) {
    if (divert.startsWith(':')) {
      divert = divert.slice(1);
    }
    divert = divert.replaceAll(':', '.');
    return divert;
  }

  serializeExpr(expr: Type_set[number]): string {
    if (typeof expr !== 'object') {
      if (typeof expr === 'string') {
        this.checkIfIsArg(expr);
        return expr;
      }
      return JSON.stringify(expr);
    }
    if ((expr as { get: Type_get }).get !== undefined) {
      let { get } = expr as { get: Type_get };
      while (typeof get === 'object') {
        get = get.get;
      }
      return this.checkIfIsArg(get);
    }
    if ((expr as Type_buildingBlockWithParams).buildingBlock !== undefined) {
      const { buildingBlock, params } = expr as Type_buildingBlockWithParams;
      let paramList = Array.isArray(params)
        ? params
        : Object.entries(params)
            .filter((p) => p[1]).sort((a, b) => a[0].localeCompare(b[0]))
            .map(([, value]) => value!);
      return `${buildingBlock}(${paramList.map((p) => this.serializeExpr(p)).join(', ')})`;
    }
    const { func, params } = expr as Type_funcWithParams;
    const op: InkFuncType = func as any;
    const paramList = (params as Type_set).map((p) => this.serializeExpr(p));
    const [param1, param2] = paramList;
    paramList.forEach((s) => this.checkIfIsArg(s as string));
    switch (op) {
      case 'FlagIsSet':
      case 'HasRead':
        return `${this.fixDivertFormat(param1)}`;
      case 'FlagIsNotSet':
      case 'HasNotRead':
        return `not ${this.fixDivertFormat(param1)}`;
      case 'Not':
        return `not ${this.serializeExpr(param1)}`;
      case 'Log10':
        // TODO: 啥啥啥？
        return `${this.serializeExpr(param1)}`;
      // Increment 和 Decrement 都不会用作其它表达式的输入
      case 'Increment':
        return `${param1} += 1`;
      case 'Decrement':
        return `${param1} -= 1`;
      // 其它的似乎都是双参数（见 80days.enum.json）
      default: {
        const mapping: Record<typeof op, string> = {
          Add: '+',
          And: '&&',
          Divide: '/',
          Equals: '==',
          GreaterThan: '>',
          GreaterThanOrEqualTo: '>=',
          LessThan: '<',
          LessThanOrEqualTo: '<=',
          Mod: '%',
          Multiply: '*',
          NotEquals: '!=',
          Or: '||',
          Subtract: '-',
        };
        return `(${this.serializeExpr(param1)} ${mapping[op]} ${param2})`;
      }
    }
  }

  serializeDoFuncsNode(node: Type_doFuncsNode) {
    return node.doFuncs
      .map((func) => {
        if ((func as { set: Type_set }).set) {
          const set = (func as { set: Type_set }).set.map((s) => this.serializeExpr(s));
          return `~ ${set[0]} = ${set[1]}`;
        }
        return `~ ${this.serializeExpr(
          func as Type_funcWithParams | Type_buildingBlockWithParams
        )}`;
      })
      .join(this.nl());
  }

  serializeBlocks(blocks: InkBlock[]) {
    this.indentation += 1;
    const s = blocks.map((block) => this.serializeInkBlock(block)).join(' ');
    this.indentation -= 1;
    return s;
  }

  serializeInkBlock(block: InkBlock): string {
    if (typeof block === 'string') {
      return block.replaceAll('<br>', this.nl());
    }

    if ((block as Type_actionTag).action !== undefined) {
      return this.serializeActionTag(block as Type_actionTag);
    }

    if ((block as Type_doFuncsNode).doFuncs !== undefined) {
      return this.nl() + this.serializeDoFuncsNode(block as Type_doFuncsNode) + this.nl();
    }

    if ((block as Type_returnNode).return !== undefined) {
      return `${this.nl()}~ return ${this.serializeExpr(
        (block as Type_returnNode).return
      )}${this.nl()}`;
    }

    if ((block as Type_customDictionary).dictionary !== undefined) {
      const { dictionary, storyCustomContentClass } =
        block as Type_customDictionary;
      return `${this.nl()}# ${storyCustomContentClass}: ${JSON.stringify(dictionary)}`;
    }

    if ((block as Type_buildingBlockWithParams).buildingBlock !== undefined) {
      return `${this.nl()}~ ${this.serializeExpr(block as Type_buildingBlockWithParams)}${this.nl()}`;
    }

    if ((block as Type_optionLink).option !== undefined) {
      const { option, linkPath, condition, inlineOption } = block as Type_optionLink;
      const postfix = inlineOption ? ' # inline' : '';
      const marker = `+ `;
      const cond = condition ? `{${this.serializeExpr(condition)}} ` : '';
      return `${this.nl()}${marker}${cond}${option}${postfix}${this.nl()}  -> ${this.fixDivertFormat(linkPath)}`;
    }

    if ((block as Type_conditionThen).condition !== undefined) {
      const { condition, then, otherwise } = block as Type_conditionThen;
      let s = `{${this.nl()}  - ${this.serializeExpr(condition)}:${this.nl()}${
        this.serializeBlocks(then)
      }`;
      if (otherwise) {
        s += `${this.nl()}  - else:${this.nl()}${this.serializeBlocks(otherwise)}`;
      }
      s += `${this.nl()}}`;
      return s;
    }

    if ((block as Type_cycleNode).cycle !== undefined
      || (block as Type_sequenceNode).sequence !== undefined) {
      const isCycle = (block as Type_cycleNode).cycle;
      const key = isCycle ? 'cycle' : 'stopping';
      const nested: InkBlock[][] = isCycle ? (block as Type_cycleNode).cycle : (block as Type_sequenceNode).sequence;
      return `{ ${key}:${this.nl()}  - ${
        nested.map((blocks) => this.serializeBlocks(blocks)).join(`${this.nl()}  - `)
      }${this.nl()}}`;
    }

    if ((block as Type_divertNode).divert !== undefined) {
      const { divert } = block as Type_divertNode;
      return `-> ${this.fixDivertFormat(divert)}`
    }

    throw new Error(`Unknown block type: ${Object.keys(block)}`);
  }

  serializeBuildingBlock(name: string, content: InkBlock[]) {
    this.argStack.push(new Set());
    this.indentation -= 1;
    const serialization = this.serializeBlocks(content);
    const args = this.argStack.pop() ?? [];
    this.indentation += 1;
    return `=== function ${name} (${
      [...args].sort().filter((arg) => arg.startsWith(`__bb${name}`)).join(', ')
    }) ===${this.nl()}${serialization}`
  }

  decompileMeta() {
    const { root } = this;
    return {
      content: `
INCLUDE variables.ink
INCLUDE buildingBlocks.ink
INCLUDE indexed-content.ink
`,
      files: {
        'variables.ink': Object.entries(root.variables)
          .map(([name, value]) => `VAR ${name} = ${JSON.stringify(value)}`)
          .join('\n'),
        'indexed-content.ink': Object.entries(root['indexed-content'].ranges)
          .map(
            ([name], i) =>
              `INCLUDE content/${String(i + 1).padStart(4)}-${name}.ink`
          )
          .join('\n'),
        'buildingBlocks.ink': Object.entries(root.buildingBlocks)
          .map(([name, value]) => this.serializeBuildingBlock(name, value))
          .join('\n'),
      },
    };
  }

  decompile(name: string, file: InkChunkNode) {
    if (!Array.isArray(file) && Object.keys(file).length === 0) {
      // Notorious ENDFLOW
      return `=== ${name} ===`;
    }

    if (Array.isArray(file)) {
      return `=== ${name} ===${this.nl()}${this.serializeBlocks(file)}`;
    }

    const content = file as InkChunkWithStitches;
    return `=== ${name} ===${this.nl()}${this.nl()}${
      Object.entries(content.stitches).map(
        ([stitch, blocks]) => `= ${stitch}${this.nl()}${this.serializeBlocks(blocks.content)}`
      ).join(this.nl())
    }`;
  }
}

export default PoorOldInkSerializer;
