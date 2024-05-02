// auto-types.ts 由 unpack.ts 生成
import { Type_then } from './auto-types';

export type InkBlock = Type_then[number];

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
  buildingBlocks: Record<string, InkBlock[]>;
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
  | {};

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
