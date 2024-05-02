// auto-types.ts 由 unpack.ts 生成
import { Type_params, Type_then } from './auto-types';

export type InkBlock = Type_then[number];

export type InkRootNode = {
  variables: Record<string, boolean | number>, // 全局变量默认值
  buildingBlocks: Record<string, InkBlock[]>, // 看起来是全局函数定义
  initial: string,  // 不知道为什么是 'storycrashed',，但总之是故事入口名称
  'indexed-content': {
    filename: string,
    /**
     * 格式是 `Record<章节名, 空格分开的两个数字>`，其中两个数字分别代表开始字节和长度。
     */
    ranges: Record<string, string>,
  },
};

export type InkChunkNode = {
  initial: string,
  stitches: Record<string, { content: InkBlock[] }>,
}
