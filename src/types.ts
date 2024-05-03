// auto-types.ts 由 unpack.ts 生成
import {
  Type_actionTag, Type_buildingBlockWithParams, Type_conditionThen,
  Type_customDictionary, Type_cycleNode, Type_divertNode,
  Type_doFuncs,
  Type_doFuncsNode, Type_funcWithParams, Type_get, Type_optionLink, Type_returnNode,
  Type_sequenceNode, Type_set, Type_then,
} from './auto-types';

export type InkBlock = Type_then[number];

export type InkBuildingBlockExpr = Exclude<InkBlock, Type_optionLink | Type_divertNode>;

/**
 * `80days.txt` 的根节点类型信息。
 */
export type InkRootNode = {
  /**
   * 全局变量默认值。
   */
  variables: Record<string, boolean | number>;
  /**
   * 看起来是一大堆全局函数定义。
   */
  buildingBlocks: Record<string, InkBuildingBlockExpr[]>;
  /**
   * 不知道为什么是 'storycrashed'，但总之似乎是故事入口名称。
   */
  initial: string;
  /**
   * 对应 `80days.inkcontent.txt` 里内容的索引。
   */
  'indexed-content': {
    filename: string;
    /**
     * 格式是 `Record<章节名, 空格分开的两个数字>`，其中两个数字分别代表开始字节和长度。
     */
    ranges: Record<string, string>;
  };
};

export type InkChunkWithStitches = {
  initial: string;
  stitches: Record<string, { content: InkBlock[] }>;
};

/**
 * `80days.inkcontent.txt` 里内容的节点类型信息。
 *
 * 似乎有两种文件，一种根节点是数组，另外的有 stitches。
 * 另外，ENDFLOW 文件两种都不符合，内容就是 `{}` 而已。
 */
export type InkChunkNode =
  | InkChunkWithStitches
  | InkBlock[]
  | Record<never, never>;

/**
 * 这个是 `Type_func` 类型的所有可能取值。
 */
export type InkFuncType =
  | 'Add'
  | 'And'
  | 'Decrement'
  | 'Divide'
  | 'Equals'
  | 'FlagIsNotSet'
  | 'FlagIsSet'
  | 'GreaterThan'
  | 'GreaterThanOrEqualTo'
  | 'HasNotRead'
  | 'HasRead'
  | 'Increment'
  | 'LessThan'
  | 'LessThanOrEqualTo'
  | 'Log10'
  | 'Mod'
  | 'Multiply'
  | 'Not'
  | 'NotEquals'
  | 'Or'
  | 'Subtract';

export type InkExpr = Type_set[number] | Type_doFuncs[number] | Type_returnNode;

export type TypedCycleNode = {
  type: 'cycle',
  value: Type_cycleNode,
} | {
  type: 'sequence',
  value: Type_sequenceNode,
};

export type TypedInkBlock = {
  type: 'value',
  value: string | number | boolean,
} | {
  type: 'set',
  value: { set: Type_set },
} | {
  type: 'get',
  value: { get: Type_get },
} | {
  type: 'func',
  value: Type_funcWithParams,
} | {
  type: 'action',
  value: Type_actionTag,
} | {
  type: 'building',
  value: Type_buildingBlockWithParams,
} | {
  type: 'condition',
  value: Type_conditionThen,
} | {
  type: 'custom',
  value: Type_customDictionary,
} | {
  type: 'divert',
  value: Type_divertNode,
} | {
  type: 'do',
  value: Type_doFuncsNode,
} | {
  type: 'option',
  value: Type_optionLink,
} | {
  type: 'return',
  value: Type_returnNode,
} | TypedCycleNode;

export function annotateInkBlockType(node: InkBlock | InkExpr): TypedInkBlock {
  if (typeof node !== 'object') {
    return {
      type: 'value',
      value: node,
    };
  }
  const typeMapping: Record<string, TypedInkBlock['type']> = {
    get: 'get',
    set: 'set',
    func: 'func',

    action: 'action',
    buildingBlock: 'building',
    then: 'condition',
    dictionary: 'custom',
    cycle: 'cycle',
    divert: 'divert',
    doFuncs: 'do',
    option: 'option',
    return: 'return',
    sequence: 'sequence',
  };
  const types = Object.entries(typeMapping)
    .filter(([uniqueProperty]) => (node as Record<string, unknown>)[uniqueProperty] !== undefined)
    .map(([, type]) => type);
  if (types.length !== 1) {
    throw new Error(`Unhandled node: ${JSON.stringify(node)}`);
  }
  return {
    type: types[0],
    value: node,
  } as unknown as TypedInkBlock;
}
