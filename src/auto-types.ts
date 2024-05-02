export type Type_action = (string);

export type Type_userInfo = ({
  at?: Type_at,
  by?: Type_by,
  city?: Type_city,
  copyingJourney?: Type_copyingJourney,
  disable?: Type_disable,
  duration?: Type_duration,
  generateSpeaker?: Type_generateSpeaker,
  journey?: Type_journey,
  name?: Type_name,
  now?: Type_now,
  number?: Type_number,
  retelling?: Type_retelling,
  speaker?: Type_speaker,
  text?: Type_text,
  title?: Type_title,
  to?: Type_to,
});

export type Type_now = (boolean);

export type Type_doFuncs = ({
  buildingBlock?: Type_buildingBlock,
  func?: Type_func,
  params?: Type_params,
  set?: Type_set,
})[];

export type Type_set = (string | boolean | number | {
  buildingBlock?: Type_buildingBlock,
  func?: Type_func,
  get?: Type_get,
  params?: Type_params,
})[];

export type Type_return = (Type_set[number]);

export type Type_func = (string);

export type Type_params = (number | boolean | string | {
  buildingBlock?: Type_buildingBlock,
  func?: Type_func,
  get?: Type_get,
  params?: Type_params,
})[] | { [key: `__bb${string}`]: Type_return | undefined };

export type Type_get = (string | {
  get?: Type_get,
});

export type Type_buildingBlock = (string);

export type Type_condition = ({
  buildingBlock?: Type_buildingBlock,
  func?: Type_func,
  params?: Type_params,
});

export type Type_then = (string | {
  action?: Type_action,
  buildingBlock?: Type_buildingBlock,
  condition?: Type_condition,
  cycle?: Type_cycle,
  dictionary?: Type_dictionary,
  divert?: Type_divert,
  doFuncs?: Type_doFuncs,
  inlineOption?: Type_inlineOption,
  linkPath?: Type_linkPath,
  option?: Type_option,
  otherwise?: Type_otherwise,
  params?: Type_params,
  return?: Type_return,
  sequence?: Type_sequence,
  storyCustomContentClass?: Type_storyCustomContentClass,
  then?: Type_then,
  userInfo?: Type_userInfo,
})[];

export type Type_otherwise = (string | {
  action?: Type_action,
  buildingBlock?: Type_buildingBlock,
  condition?: Type_condition,
  cycle?: Type_cycle,
  dictionary?: Type_dictionary,
  divert?: Type_divert,
  doFuncs?: Type_doFuncs,
  inlineOption?: Type_inlineOption,
  linkPath?: Type_linkPath,
  option?: Type_option,
  otherwise?: Type_otherwise,
  params?: Type_params,
  return?: Type_return,
  sequence?: Type_sequence,
  storyCustomContentClass?: Type_storyCustomContentClass,
  then?: Type_then,
  userInfo?: Type_userInfo,
})[];

export type Type_text = (string);

export type Type_cycle = (string | {
  buildingBlock?: Type_buildingBlock,
  condition?: Type_condition,
  cycle?: Type_cycle,
  divert?: Type_divert,
  inlineOption?: Type_inlineOption,
  linkPath?: Type_linkPath,
  option?: Type_option,
  otherwise?: Type_otherwise,
  params?: Type_params,
  return?: Type_return,
  sequence?: Type_sequence,
  then?: Type_then,
})[][];

export type Type_by = (number);

export type Type_to = (number | string);

export type Type_number = (number);

export type Type_sequence = (string | {
  action?: Type_action,
  buildingBlock?: Type_buildingBlock,
  condition?: Type_condition,
  cycle?: Type_cycle,
  divert?: Type_divert,
  doFuncs?: Type_doFuncs,
  linkPath?: Type_linkPath,
  option?: Type_option,
  otherwise?: Type_otherwise,
  params?: Type_params,
  sequence?: Type_sequence,
  then?: Type_then,
  userInfo?: Type_userInfo,
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

export type Type_dictionary = ({
  isNewspaper?: Type_isNewspaper,
  speakerName?: Type_speakerName,
  styleName?: Type_styleName,
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