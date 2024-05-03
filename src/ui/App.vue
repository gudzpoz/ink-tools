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
    <div>
      Debug:
      <label>
        <input type="checkbox" v-model="debug.conditions" /> Conditions
      </label>
      <label>
        <input type="checkbox" v-model="debug.cycles" /> Cycles/Sequences
      </label>
      <label>
        <input type="checkbox" v-model="debug.diverts" /> Diverts
      </label>
      <label>
        <input type="checkbox" v-model="debug.functions" /> Functions
      </label>
    </div>
    <div>
      Variables:
      <button type="button" @click="alertUsage">
        Edit
      </button>
      <button type="button" @click="resetVariables">
        Reset
      </button>
    </div>
  </div>
  <div class="body" :class="{ inline: options[0]?.inline }">
    <div v-for="line in lines" :key="line">
      <p v-html="line" />
    </div>
    <ul>
      <li v-for="option, i in options" :key="option.link">
        <button type="button" @click="select(i)" v-html="option.text" :disabled="!option.condition" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onMounted, ref,
} from 'vue';

import { InkStoryRunner, Options } from './story';
import { InkRootNode } from '../types';

import rootJson from '../../data/80days.json';

// @ts-expect-error: Excessive stack depth comparing types
const root: InkRootNode = rootJson;
const story = new InkStoryRunner(root);
const globalVariables = ref<ReturnType<typeof story.getVariables>>({});

const stories = Object.keys(root['indexed-content'].ranges);
const knotSelect = ref<HTMLSelectElement>();

const lines = ref(['']);
const options = ref<Options>([]);

const debug = ref({
  conditions: false,
  cycles: false,
  functions: false,
  diverts: false,
});

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
  const variables = story.getVariables();
  Object.entries(globalVariables.value).forEach(([k, v]) => {
    variables[k] = v;
  });
  await fetchMore();
}

declare global {
  interface Window {
    ink: Record<string, string | number | boolean>;
  }
}

onMounted(async () => {
  await selectNewKnot(0);
  window.ink = new Proxy({}, {
    get(_: never, p: string) {
      return story.getVariables()[p];
    },
    set(_: never, p: string, v: string | number | boolean) {
      globalVariables.value[p] = v;
      story.getVariables()[p] = v;
      return true;
    },
  });
});

async function select(i: number) {
  const { value } = options;
  options.value = [];
  story.selectOption(value, i);
  await fetchMore();
}

function alertUsage() {
  // eslint-disable-next-line no-alert
  alert(`Press F12 to open up a "Console" and type:
    ink.<variable> = newValue;
to set variable values. For example:

    ink.banksize = 3;

    ink.money = 1000;

These variables will be restored to the value you set when you restart the story (until you press "Reset").`);
}

function resetVariables() {
  globalVariables.value = {};
}

async function updateStoryWithTranslatedJson(e: Event) {
  const { files } = (e.target as HTMLInputElement);
  if (!files || files.length === 0) {
    return;
  }
  const [file] = files;
  const [name, ext] = file.name.split('.');
  if (ext !== 'json') {
    // eslint-disable-next-line no-alert
    alert('Please select a JSON file');
    return;
  }
  if (root['indexed-content'].ranges[name] === undefined) {
    // eslint-disable-next-line no-alert
    alert('Check your JSON filename');
    return;
  }
  const json = await file.text();
  const translatedJson = JSON.parse(json);
  story.loadExternalChunk(name, translatedJson);
  await selectNewKnot(knotSelect.value?.value ?? 0);
}

const displayConditions = computed(() => (debug.value.conditions ? 'inline-flex' : 'none'));
const displayCycles = computed(() => (debug.value.cycles ? 'inline-flex' : 'none'));
const displayDiverts = computed(() => (debug.value.diverts ? 'inline-flex' : 'none'));
const displayFunctions = computed(() => (debug.value.functions ? 'inline-flex' : 'none'));
</script>
<style>
div.header {
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  flex-wrap: wrap;
}
div.inline > div:nth-last-child(2), div.inline > div:nth-last-child(2) > p {
  display: inline;
}
div.inline > ul, div.inline > ul > li {
  display: inline;
  padding-left: 0;
}

span {
    font-size: 0.5em;
}
span.condition {
    font-family: monospace;
    display: inline-flex;
    flex-direction: column;
    text-align: center;
    vertical-align: top;
    font-size: 1em;
}
span.condition > span {
    display: block;
}
span.condition > span.result.false::after {
    display: block;
    content: "(skipped)";
    text-align: right;
}
span.condition > span.result.false.has_otherwise::after {
    content: "- else:";
}
span.result {
    color: red;
}

span.start::before {
    content: "{{";
}
span.end::after {
    content: "}}";
}

div.body > div span.condition {
  display: v-bind(displayConditions);
}
div.body > div span.start, div.body > div span.end {
  display: v-bind(displayCycles);
}
div.body > div span.divert {
  display: v-bind(displayDiverts);
}
div.body > div span.expr, div.body > div span.call {
  display: v-bind(displayFunctions);
}
</style>
