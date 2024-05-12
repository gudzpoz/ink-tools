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

/**
 * `storyCustomContentClass` 里可能出现的值。
 */
export type InkStoryCustomContentClassType =
  | 'InsertClueFromGenericLocalContent'
  | 'NextHeadingStyleContent';

/**
 * `userInfo.action` 里可能出现的值。
 */
export type InkActionType =
  | 'AbandonJourney'
  | 'ChangeArrivalTime'
  | 'ChangeAudioScape'
  | 'ChangeDestination'
  | 'ChangeJourneyLength'
  | 'ChangeTransportGraphic'
  | 'ChangeTransportTitle'
  | 'CrossDateLine'
  | 'DecreaseJourneyLengthBy'
  | 'DisableAllTravel'
  | 'DisableLocalBank'
  | 'ExtendJourneyLengthBy'
  | 'ForceArrival'
  | 'GiveAchievement'
  | 'Incident'
  | 'LoseASuitcase'
  | 'LoseAllSuitcases'
  | 'LoseDaysInCity'
  | 'LostFogg'
  | 'SetClue'
  | 'ShowClockUI'
  | 'StartBankTimer'
  | 'Teleport';

/**
 * 从 `auto-types.ts` 里手动汇总的除数组元素外的可翻译字段名称。
 *
 * 但是，一般用 `UNTRANSLATABLE_FIELD_KEYS` 判断会更好一些。
 * 也可以双重保险。
 */
export const TRANSLATABLE_FIELD_KEYS: string[] = [
  /** 选项部分 */
  'option',
  /** userInfo 部分 */
  'retelling',
  'speaker',
  'text',
  'title',
  /** dictionary 部分 */
  'speakerName',
];
/**
 * 从 `auto-types.ts` 里手动汇总的不可翻译字段的名称。
 * 数字代表深度。
 *
 * 另外，所有以 `__bb` 开头的字段都是不可翻译的。
 * 这个应该可以通过处理 `params` 字段来判断。
 */
export const UNTRANSLATABLE_FIELD_KEYS: Record<string, 0 | 1> = {
  /** action */
  action: 0,
  /** 变量相关 */
  get: 0,
  set: 1, // set: ["varName", value]
  /** 函数相关 */
  buildingBlock: 0,
  func: 0,
  params: 1, // params: ["paramName", value] or params: { __bbXXX: value }
  return: 0,
  /** userInfo 相关 */
  journey: 0,
  city: 0,
  at: 0,
  to: 0,
  name: 0,
  copyingJourney: 0,
  /** 跳转相关 */
  divert: 0,
  linkPath: 0,
  /** dictionary 相关 */
  storyCustomContentClass: 0,
  styleName: 0,
  /** InkRootNode */
  initial: 0,
};

export type InkExpr = Type_set[number] | Type_doFuncs[number] | Type_returnNode;

export type JSONPath = (string | number)[];

export interface TypedInkBlockWithKeys<T extends string, V extends (InkBlock | InkExpr)> {
  type: T;
  value: V;
  /**
   * 极致的类型体操……
   *
   * 可能还不算就是了。
   */
  join: (
    path: JSONPath,
    key1: keyof V,
    key2?: keyof V[keyof V],
    key3?: keyof V[keyof V][keyof V[keyof V]],
  ) => JSONPath;
}

export type TypedCycleNode =
  | TypedInkBlockWithKeys<'cycle', Type_cycleNode>
  | TypedInkBlockWithKeys<'sequence', Type_sequenceNode>;

export type TypedInkBlock =
  | TypedInkBlockWithKeys<'value', string | number | boolean>
  | TypedInkBlockWithKeys<'get', { get: Type_get }>
  | TypedInkBlockWithKeys<'set', { set: Type_set }>
  | TypedInkBlockWithKeys<'func', Type_funcWithParams>
  | TypedInkBlockWithKeys<'action', Type_actionTag>
  | TypedInkBlockWithKeys<'building', Type_buildingBlockWithParams>
  | TypedInkBlockWithKeys<'condition', Type_conditionThen>
  | TypedInkBlockWithKeys<'custom', Type_customDictionary>
  | TypedInkBlockWithKeys<'divert', Type_divertNode>
  | TypedInkBlockWithKeys<'do', Type_doFuncsNode>
  | TypedInkBlockWithKeys<'option', Type_optionLink>
  | TypedInkBlockWithKeys<'return', Type_returnNode>
  | TypedCycleNode;

const join = ((path: JSONPath, key1: unknown, key2?: unknown, key3?: unknown): JSONPath => {
  const newPath = [...path, key1] as JSONPath;
  if (key2 !== undefined) {
    newPath.push(key2 as never);
    if (key3 !== undefined) {
      newPath.push(key3 as never);
    }
  }
  return newPath;
});

export function annotateInkBlockType(node: InkBlock | InkExpr): TypedInkBlock {
  if (typeof node !== 'object') {
    return {
      type: 'value',
      value: node,
      join,
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
    position: (node as { position?: JSONPath }).position,
    join,
  } as TypedInkBlock;
}
