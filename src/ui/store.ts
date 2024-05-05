import { defineStore } from 'pinia';
import { ref } from 'vue';

import { InkVariableType, Options } from './story';

export default defineStore('saves', () => {
  const saves = ref<{
    save: object,
    lines: string[],
    options: Options,
    title: string,
  }[]>([]);
  const globalVariables = ref<Record<string, InkVariableType>>({});
  const globalReadCounts = ref<Record<string, number>>({});
  const debug = ref({
    conditions: false,
    conditionDetails: false,
    cycles: false,
    functions: false,
    diverts: false,
    original: false,
    logPaths: false,
    stepping: false,
    keepCycles: false,
  });
  return {
    saves, globalReadCounts, globalVariables, debug,
  };
}, {
  persist: true,
});
