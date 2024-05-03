<template>
  <label>
    Starting Knot:
    <select ref="knotSelect" @change="(e) => selectNewKnot((e.target as HTMLSelectElement).value)">
      <option v-for="story, i in stories" :key="story" :value="i">
        {{ String(i + 1).padStart(4, '0') }}-{{ story }}
      </option>
    </select>
  </label>
  <button type="button" @click="selectNewKnot(knotSelect?.value ?? 0)">
    Restart
  </button>
  <div>
    <div v-for="line in lines" :key="line">
      <p v-html="line" />
    </div>
  </div>
  <div>
    <button
      type="button"
      v-for="option, i in options"
      :key="option.link"
      @click="select(i)"
    >{{ option.text }}</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { InkStoryRunner, Options } from './story';
import { InkRootNode } from '../types';

import rootJson from '../../data/80days.json';

// @ts-expect-error: Excessive stack depth comparing types
const root: InkRootNode = rootJson;
const story = new InkStoryRunner(root);

const stories = Object.keys(root['indexed-content'].ranges);
const knotSelect = ref<HTMLSelectElement>();

const lines = ref(['']);
const options = ref<Options>([]);

let timeOutHandle: number | null = null;
async function fetchMore(delay: number = 20) {
  if (options.value.length !== 0) {
    return;
  }
  const line = await story.next();
  if (typeof line === 'string') {
    if (line !== '<br><br>') {
      lines.value[lines.value.length - 1] += line;
    } else {
      lines.value.push('');
    }
    timeOutHandle = setTimeout(fetchMore, delay);
  } else if (Array.isArray(line)) {
    lines.value[lines.value.length - 1] += ' ';
    options.value = line;
  } else {
    lines.value.push('Story Ended');
  }
}

async function selectNewKnot(i: string | number) {
  if (timeOutHandle !== null) {
    clearTimeout(timeOutHandle);
    timeOutHandle = null;
  }
  lines.value = [''];
  options.value = [];
  await story.init(stories[typeof i === 'string' ? parseInt(i, 10) : i]);
  await fetchMore();
  fetchMore();
}

onMounted(async () => {
  await selectNewKnot(0);
});

async function select(i: number) {
  const { value } = options;
  options.value = [];
  story.selectOption(value, i);
  await fetchMore();
}
</script>
<style scoped></style>
