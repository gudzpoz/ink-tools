<template>
  <div class="header">
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
    <label>
      Use translated JSON:
      <input type="file" @change="(e) => updateStoryWithTranslatedJson(e)" />
    </label>
  </div>
  <div :class="{ inline: options[0]?.inline }">
    <div v-for="line in lines" :key="line">
      <p v-html="line" />
    </div>
    <ul>
      <li v-for="option, i in options" :key="option.link">
        <button type="button" @click="select(i)">
          {{ option.text }}
        </button>
      </li>
    </ul>
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

const storyUniqueId = ref(0);
let timeOutHandle: number | null = null;
async function fetchMore(delay: number = 20) {
  if (options.value.length !== 0) {
    return;
  }
  const startingId = storyUniqueId.value;
  const line = await story.next();
  if (startingId !== storyUniqueId.value) {
    return;
  }
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
  storyUniqueId.value += 1;
  lines.value = [''];
  options.value = [];
  await story.init(stories[typeof i === 'string' ? parseInt(i, 10) : i]);
  await fetchMore();
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

async function updateStoryWithTranslatedJson(e: Event) {
  const { files } = (e.target as HTMLInputElement);
  if (!files || files.length === 0) {
    return;
  }
  const [file] = files;
  const [name, ext] = file.name.split('.');
  if (ext !== 'json') {
    alert('Please select a JSON file');
    return;
  }
  if (root['indexed-content'].ranges[name] === undefined) {
    alert('Check your JSON filename');
    return;
  }
  const json = await file.text();
  const translatedJson = JSON.parse(json);
  story.loadExternalChunk(name, translatedJson);
  await selectNewKnot(knotSelect.value?.value ?? 0);
}
</script>
<style scoped>
div.header {
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
}
div.inline > div:nth-last-child(2), div.inline > div:nth-last-child(2) > p {
  display: inline;
}
div.inline > ul, div.inline > ul > li {
  display: inline;
  padding-left: 0;
}
</style>
