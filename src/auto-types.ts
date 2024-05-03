/* eslint-disable @typescript-eslint/naming-convention */
// 下面的类型信息原本是由 `unpack.ts` 生成的，生成的类型信息是能够通过 TypeScript 校验的。
// 但是为了更精确一些，这里手动改了类型信息。请之后慎重改动。

/**
 * `buildingBlock` 是自定义的函数。
 */
export type Type_buildingBlockWithParams = {
  buildingBlock: Type_buildingBlock;
  params: Type_paramsForbuildingBlocks;
};

/**
 * `func` 是引擎内置的例如 `Equals, HasRead` 等函数。
 */
export type Type_funcWithParams = {
  func: Type_func;
  params: Type_paramsForFuncs;
};

export type Type_somethingWithParams =
  | Type_buildingBlockWithParams
  | Type_funcWithParams;

/**
 * 普通的条件。
 */
export type Type_conditionThen = {
  condition: Type_condition;
  then: Type_then;
  /**
   * 程序提取的类型定义和 `Type_then` 一模一样，手动合并了。
   */
  otherwise?: Type_then;
};

/**
 * 选项。
 */
export type Type_optionLink = {
  /**
   * [可翻译]
   */
  option: Type_option;
  linkPath: Type_linkPath;
  condition?: Type_condition;
  /**
   * 看群里的代码似乎是 Ink 里 `<>` 的意思。
   */
  inlineOption?: Type_inlineOption;
};

/**
 * 大概是 `~ expr` 这些节点？
 */
export type Type_doFuncsNode = {
  doFuncs: Type_doFuncs;
};

/**
 * `~ return (...)`
 */
export type Type_returnNode = {
  return: Type_return;
};

/**
 * ```
 * { cycle:
 *   - A
 *   - B
 * }
 * ```
 */
export type Type_cycleNode = {
  cycle: Type_cycle;
};

/**
 * ```
 * { stopping:
 *   - A
 *   - B
 * }
 * ```
 */
export type Type_sequenceNode = {
  sequence: Type_sequence;
};

/**
 * `-> knot`
 */
export type Type_divertNode = {
  divert: Type_divert;
};

/**
 * 基本上可以覆盖所有数组类型的节点。
 *
 * 但值得注意的是 buildingBlock 函数的定义里不能出现 divert 和 option。
 * 没能找到用泛型表达出来的方法，注意一下即可。
 */
export type Type_then = (
  | string /** [可翻译] */
  | Type_actionTag
  | Type_buildingBlockWithParams
  | Type_conditionThen
  | Type_customDictionary
  | Type_cycleNode
  | Type_divertNode
  | Type_doFuncsNode
  | Type_optionLink
  | Type_returnNode
  | Type_sequenceNode
)[];

/**
 * 感觉 `Type_userInfo` 和 `Type_action` 都是和 tag 相关的。
 * 后者是 tag 名称，前者附加额外信息。
 *
 * 总之感觉不需要太在意。
 */
export type Type_actionTag = {
  action: Type_action;
  userInfo?: Type_userInfo;
};

/**
 * 见 `Type_userInfo` 的猜想。
 */
export type Type_action = string;

/**
 * 见 `Type_userInfo` 的猜想。
 */
export type Type_userInfo =
  | {
    now: Type_now;
  }
  | {
    city?: Type_city;
    generateSpeaker?: Type_generateSpeaker;
    journey?: Type_journey;
    /**
     * [可翻译]
     */
    retelling?: Type_retelling;
    /**
     * [可翻译]
     */
    speaker?: Type_speaker;
    /**
     * [可翻译]
     */
    text: Type_text;
  }
  | {
    by: Type_by;
  }
  | {
    copyingJourney?: Type_copyingJourney;
    duration?: Type_duration;
    to: Type_to;
  }
  | {
    number: Type_number;
  }
  | {
    at: Type_at;
  }
  | {
    name: Type_name;
  }
  | {
    /**
     * [可翻译]
     */
    title: Type_title;
  }
  | {
    disable: Type_disable;
  };

export type Type_now = boolean;

export type Type_doFuncs = (
  | {
    set: Type_set;
  }
  | Type_somethingWithParams
)[];

/**
 * 离谱，为什么会有 `set: { get: Type_get }` 这种操作呢？
 * 是因为这个其实大概是 Ink 的 ref 语法，实际传递过去的参数是参数名称字符串，
 * 需要通过一个 get 函数来获取参数值。
 *
 * 同样，看 Type_get。
 */
export type Type_set = (
  | string
  | boolean
  | number
  | Type_somethingWithParams
  | {
    get: Type_get;
  }
)[];

export type Type_return = Type_set[number];

export type Type_func = string;

export type Type_paramsForFuncs = (
  | number
  | boolean
  | string
  | {
    get: Type_get;
  }
  | Type_somethingWithParams
)[];

export type Type_paramsForbuildingBlocks = {
  [key: `__bb${string}`]: Type_return | undefined;
};

/**
 * 和 `Type_set` 一样，这里既可以是字符串，直接传参。
 * 也可以是 `get: { get: Type_get }` 形式，需要通过 get 函数来获取参数值。
 */
export type Type_get =
  | string
  | {
    get: Type_get;
  };

export type Type_buildingBlock = string;

export type Type_condition = Type_somethingWithParams;

export type Type_text = string;

export type Type_cycle = Type_sequence;

export type Type_by = number;

export type Type_to = number | string;

export type Type_number = number;

export type Type_sequence = Type_then[];

/**
 * 看起来语法有 `:knot`, `:knot:stitche` 和 `stitche` 三种，
 * 分别是绝对 knot 路径、绝对 stitche 路径和相对 stitche 路径。
 *
 * 当然，“现代” Ink 用的是 `knot.stitche` 的形式，要转换。
 */
export type Type_divert = string;

export type Type_at = number | string;

export type Type_city = string;

export type Type_journey = string;

export type Type_generateSpeaker = boolean;

export type Type_retelling = string;

export type Type_option = string;

export type Type_linkPath = string;

export type Type_inlineOption = boolean;

export type Type_storyCustomContentClass = string;

export type Type_dictionary =
  | Record<never, never>
  | {
    styleName: Type_styleName;
  }
  | {
    isNewspaper?: Type_isNewspaper;
    /**
     * [可翻译]
     */
    speakerName: Type_speakerName;
  };

export type Type_customDictionary = {
  dictionary: Type_dictionary;
  storyCustomContentClass: Type_storyCustomContentClass;
};

export type Type_speaker = string;

export type Type_duration = number;

export type Type_name = string;

export type Type_title = string;

export type Type_styleName = string;

export type Type_speakerName = string;

export type Type_isNewspaper = boolean;

export type Type_disable = boolean;

export type Type_copyingJourney = string;
