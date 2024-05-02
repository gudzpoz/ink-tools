// 下面的类型信息原本是由 `unpack.ts` 生成的，生成的类型信息是能够通过 TypeScript 校验的。
// 但是为了更精确一些，这里手动改了类型信息。请之后慎重改动。

/**
 * `buildingBlock` 是自定义的函数。
 */
export type Type_buildingBlockWithParams = {
  buildingBlock: Type_buildingBlock,
  params: Type_params,
};

/**
 * `func` 是引擎内置的例如 `Equals, HasRead` 等函数。
 */
export type Type_funcWithParams = {
  func: Type_func,
  params: Type_params,
};

/**
 * 下面是生成的类型（人工改过）。原本显得似乎 `func, params, buildingBlock` 都是可选的，
 * 但是实际上有上面的有两种类型。什么意思不知道。
 */
export type Type_somethingWithParams = (Type_buildingBlockWithParams | Type_funcWithParams);

/**
 * 同上，`condition` 可以拆分出两种。
 */
export type Type_conditionThen = {
  condition: Type_condition,
  then: Type_then,
  otherwise?: Type_otherwise,
};

/**
 * 另外一种含 `condition` 的类型其实是 `option` 就是了……被字母顺序误导了以为还是 `condition` 一族的了。
 */
export type Type_optionLink = {
  option: Type_option,
  linkPath: Type_linkPath,
  condition?: Type_condition,
  inlineOption?: Type_inlineOption,
}

/**
 * 大概是 `~ expr` 这些节点？
 */
export type Type_doFuncsNode = {
  doFuncs: Type_doFuncs,
};

/**
 * `~ return (...)`
 */
export type Type_returnNode = {
  return: Type_return,
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
  cycle: Type_cycle,
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
  sequence: Type_sequence,
};

/**
 * `-> knot`
 */
export type Type_divertNode = {
  divert: Type_divert,
};

/**
 * 基本上可以覆盖所有数组类型的节点。懒得继续合并了。
 */
export type Type_then = (string | Type_actionTag | Type_doFuncsNode | Type_returnNode | Type_optionLink | Type_conditionThen | Type_buildingBlockWithParams | Type_cycleNode | Type_sequenceNode | Type_divertNode | Type_customDictionary)[];

/**
 * 感觉 `Type_userInfo` 和 `Type_action` 都是和 tag 相关的。
 * 后者是 tag 名称，前者附加额外信息。
 *
 * 总之感觉不需要太在意。
 */
export type Type_actionTag = {
  action: Type_action,
  userInfo?: Type_userInfo,
};

/**
 * 见 `Type_userInfo` 的猜想。
 */
export type Type_action = (string);

/**
 * 见 `Type_userInfo` 的猜想。
 */
export type Type_userInfo = ({
  now: Type_now,
} | {
  city?: Type_city,
  generateSpeaker?: Type_generateSpeaker,
  journey?: Type_journey,
  retelling?: Type_retelling,
  speaker?: Type_speaker,
  text: Type_text,
} | {
  by: Type_by,
} | {
  copyingJourney?: Type_copyingJourney,
  duration?: Type_duration,
  to: Type_to,
} | {
  number: Type_number,
} | {
  at: Type_at,
} | {
  name: Type_name,
} | {
  title: Type_title,
} | {
  disable: Type_disable,
});

export type Type_now = (boolean);

export type Type_doFuncs = ({
  set: Type_set,
} | Type_somethingWithParams)[];

/**
 * 离谱，为什么会有 `set: { get: Type_get }` 这种操作呢？
 * 是因为这个其实大概是 Ink 的 ref 语法，实际传递过去的参数是参数名称字符串，
 * 需要通过一个 get 函数来获取参数值。
 *
 * 同样，看 Type_get。
 */
export type Type_set = (string | boolean | number | Type_somethingWithParams | {
  get: Type_get,
})[];

export type Type_return = (Type_set[number]);

export type Type_func = (string);

export type Type_params = (number | boolean | string | {
  get: Type_get,
} | Type_somethingWithParams)[] | { [key: `__bb${string}`]: Type_return | undefined };

/**
 * 和 `Type_set` 一样，这里既可以是字符串，直接传参。
 * 也可以是 `get: { get: Type_get }` 形式，需要通过 get 函数来获取参数值。
 */
export type Type_get = (string | {
  get: Type_get,
});

export type Type_buildingBlock = (string);

export type Type_condition = (Type_somethingWithParams);

export type Type_otherwise = (string | Type_returnNode | Type_optionLink | Type_conditionThen | Type_actionTag | Type_cycleNode | Type_buildingBlockWithParams | Type_divertNode | Type_doFuncsNode | Type_sequenceNode | Type_customDictionary)[];

export type Type_text = (string);

export type Type_cycle = (string | Type_optionLink | Type_conditionThen | Type_cycleNode | Type_returnNode | Type_buildingBlockWithParams | Type_sequenceNode | Type_divertNode)[][];

export type Type_by = (number);

export type Type_to = (number | string);

export type Type_number = (number);

export type Type_sequence = (string | Type_doFuncsNode | Type_divertNode | Type_cycleNode | Type_optionLink | Type_conditionThen | Type_sequenceNode | Type_buildingBlockWithParams | Type_actionTag)[][];

/**
 * 看起来语法有 `:knot`, `:knot:stitche` 和 `stitche` 三种，
 * 分别是绝对 knot 路径、绝对 stitche 路径和相对 stitche 路径。
 *
 * 当然，“现代” Ink 用的是 `knot.stitche` 的形式，要转换。
 */
export type Type_divert = (string);

export type Type_at = (number | string);

export type Type_city = (string);

export type Type_journey = (string);

export type Type_generateSpeaker = (boolean);

export type Type_retelling = (string);

export type Type_option = (string);

export type Type_linkPath = (string);

export type Type_inlineOption = (boolean);

export type Type_storyCustomContentClass = (string);

export type Type_dictionary = ({} | {
  styleName: Type_styleName,
} | {
  isNewspaper?: Type_isNewspaper,
  speakerName: Type_speakerName,
});

export type Type_customDictionary = {
  dictionary: Type_dictionary,
  storyCustomContentClass: Type_storyCustomContentClass,
};

export type Type_speaker = (string);

export type Type_duration = (number);

export type Type_name = (string);

export type Type_title = (string);

export type Type_styleName = (string);

export type Type_speakerName = (string);

export type Type_isNewspaper = (boolean);

export type Type_disable = (boolean);

export type Type_copyingJourney = (string);