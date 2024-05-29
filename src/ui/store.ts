import { defineStore } from 'pinia';
import { ref } from 'vue';

import { InkVariableType } from '../story';

export default defineStore('saves', () => {
  const globalVariables = ref<Record<string, InkVariableType>>({});
  const globalReadCounts = ref<Record<string, number>>({});
  const debug = ref({
    conditions: false,
    conditionDetails: false,
    cycles: false,
    functions: false,
    diverts: false,
    original: false,
    showOriginal: false,
    logPaths: false,
    stepping: false,
    keepCycles: false,
    randomizeOnReload: false,
    replaceFunctions: true,
  });
  return {
    globalReadCounts,
    globalVariables,
    debug,
    variableFilter: ref(''),
    selectedKnot: ref(''),
    browsingKnot: ref(''),
    browsingStitch: ref(''),
  };
}, {
  persist: true,
});
