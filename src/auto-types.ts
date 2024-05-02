export type Type_then = (string | {
  action: Type_action,
  userInfo?: Type_userInfo,
} | {
  doFuncs: Type_doFuncs,
} | {
  return: Type_return,
} | {
  condition?: Type_condition,
  inlineOption?: Type_inlineOption,
  linkPath?: Type_linkPath,
  option?: Type_option,
  otherwise?: Type_otherwise,
  then?: Type_then,
} | {
  buildingBlock: Type_buildingBlock,
  params: Type_params,
} | {
  cycle: Type_cycle,
} | {
  sequence: Type_sequence,
} | {
  divert: Type_divert,
} | {
  dictionary: Type_dictionary,
  storyCustomContentClass: Type_storyCustomContentClass,
})[];

export type Type_action = (string);

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
} | {
  buildingBlock?: Type_buildingBlock,
  func?: Type_func,
  params: Type_params,
})[];

export type Type_set = (string | boolean | number | {
  buildingBlock?: Type_buildingBlock,
  func?: Type_func,
  params: Type_params,
} | {
  get: Type_get,
})[];

export type Type_return = (Type_set[number]);

export type Type_func = (string);

export type Type_params = (number | boolean | string | {
  get: Type_get,
} | {
  buildingBlock?: Type_buildingBlock,
  func?: Type_func,
  params: Type_params,
})[] | { [key: `__bb${string}`]: Type_return | undefined };

export type Type_get = (string | {
  get: Type_get,
});

export type Type_buildingBlock = (string);

export type Type_condition = ({
  buildingBlock?: Type_buildingBlock,
  func?: Type_func,
  params: Type_params,
});

export type Type_otherwise = (string | {
  return: Type_return,
} | {
  condition?: Type_condition,
  inlineOption?: Type_inlineOption,
  linkPath?: Type_linkPath,
  option?: Type_option,
  otherwise?: Type_otherwise,
  then?: Type_then,
} | {
  action: Type_action,
  userInfo: Type_userInfo,
} | {
  cycle: Type_cycle,
} | {
  buildingBlock: Type_buildingBlock,
  params: Type_params,
} | {
  divert: Type_divert,
} | {
  doFuncs: Type_doFuncs,
} | {
  sequence: Type_sequence,
} | {
  dictionary: Type_dictionary,
  storyCustomContentClass: Type_storyCustomContentClass,
})[];

export type Type_text = (string);

export type Type_cycle = (string | {
  condition: Type_condition,
  otherwise?: Type_otherwise,
  then: Type_then,
} | {
  cycle: Type_cycle,
} | {
  return: Type_return,
} | {
  buildingBlock: Type_buildingBlock,
  params: Type_params,
} | {
  sequence: Type_sequence,
} | {
  inlineOption?: Type_inlineOption,
  linkPath: Type_linkPath,
  option: Type_option,
} | {
  divert: Type_divert,
})[][];

export type Type_by = (number);

export type Type_to = (number | string);

export type Type_number = (number);

export type Type_sequence = (string | {
  doFuncs: Type_doFuncs,
} | {
  divert: Type_divert,
} | {
  cycle: Type_cycle,
} | {
  condition?: Type_condition,
  linkPath?: Type_linkPath,
  option?: Type_option,
  otherwise?: Type_otherwise,
  then?: Type_then,
} | {
  sequence: Type_sequence,
} | {
  buildingBlock: Type_buildingBlock,
  params: Type_params,
} | {
  action: Type_action,
  userInfo: Type_userInfo,
})[][];

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

export type Type_speaker = (string);

export type Type_duration = (number);

export type Type_name = (string);

export type Type_title = (string);

export type Type_styleName = (string);

export type Type_speakerName = (string);

export type Type_isNewspaper = (boolean);

export type Type_disable = (boolean);

export type Type_copyingJourney = (string);