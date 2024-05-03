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
    <div>
      <label>
        Use translated JSON/CSV/ZIP:
        <input type="file" @change="(e) => updateStoryWithTranslation(e)" />
      </label>
      <label>
        <input type="checkbox" v-model="debug.original" /> Show original text
      </label>
    </div>
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
import { parse as parseCsv } from 'csv-parse/browser/esm/sync';
import {
  computed, onMounted, ref, watch,
} from 'vue';
import JSZip from 'jszip';

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
  original: false,
});

const storyUniqueId = ref(0);
let timeOutHandle: ReturnType<typeof setTimeout> | null = null;
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

type CsvTranslation = {
  json_path: string,
  original: string,
  translated: string,
};

function patchChunkWithTranslation(obj: unknown, translations: CsvTranslation[], isRoot: boolean) {
  const chunk = (isRoot ? (obj as InkRootNode).buildingBlocks : obj) as unknown;
  translations.forEach(({ json_path, translated }) => {
    if (translated.trim() === '') {
      return;
    }
    const path = json_path.split('.');
    const last = path.pop();
    const parent = path.reduce((acc, key) => (acc as Record<string, unknown>)?.[key], chunk);
    if (parent === undefined || last === undefined) {
      return;
    }
    (parent as Record<string, unknown>)[last] = translated;
  });
}

function parseTranslationCsv(content: ArrayBuffer) {
  const csv = new TextDecoder('utf-8').decode(content);
  const translations: CsvTranslation[] = parseCsv(csv, {
    bom: true,
    cast: false,
    columns: ['json_path', 'original', 'translated'],
    skip_empty_lines: true,
    relax_column_count_more: true,
  });
  return translations;
}

async function updateStoryWithFile(
  stem: string,
  extension: string,
  content: ArrayBuffer,
  shouldAlert: boolean,
): Promise<boolean> {
  const ext = extension.toLowerCase();
  if (ext !== 'json' && ext !== 'csv' && ext !== 'zip') {
    (shouldAlert ? alert : console.log)(`Please select a .json/.csv/.zip file: passed ${ext} (${stem})`);
    return false;
  }
  const name = /^[0-9]{4}-/.test(stem) ? stem.substring(5) : stem;
  if (ext !== 'zip' && name !== '' && root['indexed-content'].ranges[name] === undefined) {
    (shouldAlert ? alert : console.log)(`Check your JSON/CSV filename: passed ${stem}`);
    return false;
  }
  if (ext === 'csv') {
    const translations = parseTranslationCsv(content);
    const chunk = await story.copyChunk(name);
    patchChunkWithTranslation(chunk, translations, stem === '');
    story.loadExternalChunk(name, chunk);
  } else if (ext === 'json') {
    const json = new TextDecoder('utf-8').decode(content);
    const translatedJson = JSON.parse(json);
    story.loadExternalChunk(name, translatedJson);
  } else {
    const promises: Promise<boolean>[] = [];
    (await (new JSZip().loadAsync(content))).forEach((path, data) => {
      if (data.dir) {
        return;
      }
      const segments = path.split('/');
      const filename = segments.pop()!;
      let [entryStem, entryExt] = filename.split('.');
      if (!entryStem || !entryExt) {
        return;
      }
      if (filename.includes('buildingBlocks')) {
        entryStem = '';
        entryExt = 'csv';
      }
      promises.push(
        (async () => {
          try {
            return await updateStoryWithFile(entryStem, entryExt, await data.async('arraybuffer'), false);
          } catch (e) {
            console.log('Import error:', path, e);
            return false;
          }
        })(),
      );
    });
    alert(`It is going to take a while. After closing this alert, please wait until the story reloads.

**Confirm** to start importing.`);
    return (await Promise.all(promises)).some((b) => b);
  }
  return true;
}

async function updateStoryWithTranslation(e: Event) {
  const { files } = (e.target as HTMLInputElement);
  if (!files || files.length === 0) {
    return;
  }
  const [file] = files;
  const [stem, extension] = file.name.split('.');
  if (await updateStoryWithFile(stem, extension, await file.arrayBuffer(), true)) {
    await selectNewKnot(knotSelect.value?.value ?? 0);
  }
}
watch(() => debug.value.original, () => {
  story.useExternal = !debug.value.original;
});

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
