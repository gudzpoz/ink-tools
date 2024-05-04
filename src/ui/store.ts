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
  return { saves, globalReadCounts, globalVariables };
}, {
  persist: true,
});
