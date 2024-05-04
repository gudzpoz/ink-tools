<template>
  <div class="header">
    <div>
      <label class="select">
        ⤷ 选择故事起点：
        <select ref="knotSelect" @change="(e) => selectNewKnot((e.target as HTMLSelectElement).value)">
          <option v-for="story, i in stories" :key="story" :value="i">
            {{ String(i + 1).padStart(4, '0') }}-{{ story }}
          </option>
        </select>
      </label>
      <button type="button" @click="selectNewKnot(knotSelect?.value ?? 0)">
        ⟳ 从头再来
      </button>
    </div>
    <div>
      <label class="file">
        📤 上传翻译后的 JSON/CSV/ZIP 以替换文本
        <input type="file" @change="(e) => updateStoryWithTranslation(e)" />
      </label>
      <label>
        <input type="checkbox" v-model="debug.original" /> 📄 显示原文
      </label>
    </div>
    <div>
      显示附加信息：
      <label>
        <input type="checkbox" v-model="debug.conditions" /> ❗ 条件
      </label>
      <label>
        <input type="checkbox" v-model="debug.cycles" /> ♻️ 循环文本（Cycles/Sequences）
      </label>
      <label>
        <input type="checkbox" v-model="debug.diverts" /> 🦘 跳转（Diverts）
      </label>
      <label>
        <input type="checkbox" v-model="debug.functions" /> ⚙️ 表达式与函数
      </label>
      <label>
        <input type="checkbox" v-model="debug.logPaths" /> 📝 在 F12 的 Console 中记录路径
      </label>
      <div>
        变量控制：
        <button type="button" @click="alertUsage">
          🐞 如何使用
        </button>
        <button type="button" @click="resetVariables">
          🗑️ 重置
        </button>
        存盘与读取：
        <button type="button" @click="quickLoad">
          ⤴️ 上一个选项点
        </button>
        <label class="select">
          ⋙ 选择之前选项点
          <select ref="saveSelect" @change="(e) => loadStory((e.target as HTMLSelectElement).value)">
            <option
              v-for="save, i in saves"
              :key="i"
              :value="i"
            >
              #{{ saves.length - i }}@{{ save.title }}
            </option>
          </select>
        </label>
        <button type="button" @click="clearSaves">
          🗑️ 清除存盘
        </button>
        <p>你现在处在：{{ ip.join('.') }}</p>
      </div>
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
const ip = ref([]);
const saves = ref<{
  save: unknown,
  lines: string[],
  options: Options,
  title: string,
}[]>([]);
const globalVariables = ref<ReturnType<typeof story.getVariables>>({});
const globalReadCounts = ref<Record<string, number>>({});

const stories = Object.keys(root['indexed-content'].ranges);
const knotSelect = ref<HTMLSelectElement>();
const saveSelect = ref<HTMLSelectElement>();

const lines = ref(['']);
const options = ref<Options>([]);

const debug = ref({
  conditions: false,
  cycles: false,
  functions: false,
  diverts: false,
  original: false,
  logPaths: false,
});

function saveStory() {
  const save = story.save();
  saves.value.unshift({
    save,
    lines: lines.value.map((e) => e),
    options: options.value.map((e) => e),
    title: story.copyIp().join('.'),
  });
}

const storyUniqueId = ref(0);
let timeOutHandle: ReturnType<typeof setTimeout> | null = null;
async function fetchMore(delay: number = 20) {
  ip.value = story.copyIp() as never[];
  if (options.value.length !== 0) {
    return;
  }
  const startingId = storyUniqueId.value;
  const line = await story.next();
  if (startingId !== storyUniqueId.value) {
    return;
  }
  if (saveSelect.value) {
    saveSelect.value.selectedIndex = -1;
  }
  if (typeof line === 'string') {
    const [first, ...rest] = line.split('<br><br>');
    lines.value[lines.value.length - 1] += first;
    lines.value.push(...rest);
    timeOutHandle = setTimeout(fetchMore, delay);
  } else if (Array.isArray(line)) {
    // 全部不可选的情况下应该会有一个默认选项的。
    if (line.every((e) => !e.condition)) {
      // 默认选项当成普通文本来处理。
      const otherOptions = line.filter((e) => !e.default);
      const option = line.find((e) => e.default);
      if (option) {
        lines.value.push(`<ul>${
          otherOptions.map((e) => `<li><button disabled>${e.text}</button></li>`).join('')
        }</ul>`);
        lines.value.push(option.text);
        timeOutHandle = setTimeout(fetchMore, delay);
        return;
      }
    }
    lines.value[lines.value.length - 1] += ' ';
    options.value = line;
    saveStory();
  } else {
    lines.value.push('Story Ended');
  }
}

function clearContents() {
  storyUniqueId.value += 1;
  lines.value = [''];
  options.value = [];
}

async function selectNewKnot(i: string | number) {
  if (timeOutHandle !== null) {
    clearTimeout(timeOutHandle);
    timeOutHandle = null;
  }
  saves.value = [];
  clearContents();
  await story.init(stories[typeof i === 'string' ? parseInt(i, 10) : i]);
  const variables = story.getVariables();
  Object.entries(globalVariables.value).forEach(([k, v]) => {
    variables[k] = v;
  });
  Object.entries(globalReadCounts.value).forEach(([k, v]) => {
    story.setReadCount(k, v);
  });
  await fetchMore();
}

declare global {
  interface Window {
    ink: Record<string, string | number | boolean>;
    inkHistory: Record<string, number>;
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
  window.inkHistory = new Proxy({}, {
    get(_: never, p: string) {
      return story.getReadCount(p);
    },
    set(_: never, p: string, v: number) {
      globalReadCounts.value[p] = v;
      story.setReadCount(p, v);
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

async function loadStory(i: string) {
  const to = parseInt(i, 10);
  const { save, lines: savedLines, options: savedOptions } = saves.value[to];
  clearContents();
  saves.value = saves.value.splice(to);
  await story.load(save as never);
  lines.value = savedLines;
  options.value = savedOptions;
  if (savedOptions.length !== 0) {
    await fetchMore();
  }
  ip.value = story.copyIp() as never[];
  if (knotSelect.value) {
    knotSelect.value.selectedIndex = -1;
  }
}

async function quickLoad() {
  if (options.value.length === 0 && saves.value.length >= 1) {
    await loadStory('0');
    return;
  }
  if (saves.value.length >= 2) {
    await loadStory('1');
    return;
  }
  saves.value = [];
  await selectNewKnot(knotSelect.value?.value ?? 0);
}

function clearSaves() {
  saves.value.splice(0);
}

function alertUsage() {
  // eslint-disable-next-line no-alert
  alert(`请按 F12 打开浏览器的开发者工具，并点击进入控制台（Console）。
在 Console 里输入下面内容来改变变量值：
    ink.<variable> = newValue;
在 Console 里输入下面内容来改变是否读过某 knot / stitch 的统计量：
    inkHistory[':knot:stitch'] = 1;
例如
    ink.banksize = 3;
    ink.money = 1000;
    inkHistory[':meet_manager:__default_paragraph_4'] = 1;
这些变量在输入之后以及每次故事从头运行时都会被设置成您所设定的值。（按“重置”按钮来恢复默认值。）`);
}

function resetVariables() {
  globalVariables.value = {};
  globalReadCounts.value = {};
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
    relax_column_count_less: true,
    relax_column_count_more: true,
  });
  return translations.map((item) => {
    const { json_path: path, original, translated } = item;
    if (path && original && translated) {
      return item;
    }
    return {
      json_path: path ?? '',
      original: original ?? '',
      translated: translated ?? original ?? '',
    };
  });
}

async function updateStoryWithFile(
  stem: string,
  extension: string,
  content: ArrayBuffer,
  shouldAlert: boolean,
): Promise<boolean> {
  const ext = extension.toLowerCase();
  if (ext !== 'json' && ext !== 'csv' && ext !== 'zip') {
    (shouldAlert ? alert : console.log)(`请上传 .json/.csv/.zip 文件：实际上传了 ${ext}（${stem}）`);
    return false;
  }
  const [, name] = /^.*[0-9]{4}-(.+)$/.exec(stem) ?? ['', stem];
  if (ext !== 'zip' && name !== '' && root['indexed-content'].ranges[name] === undefined) {
    (shouldAlert ? alert : console.log)(`JSON/CSV 的文件名不符合：无对应 ${stem} 的 Ink 节点`);
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
            console.log('导入错误：', path, e);
            return false;
          }
        })(),
      );
    });
    alert(`导入可能会导致您的浏览器卡顿一段时间。开始导入后，请耐心等待直至故事重新加载。

关闭此对话框以**开始导入**。`);
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
watch(() => debug.value.logPaths, () => {
  story.logPaths = !debug.value.logPaths;
});

const displayConditions = computed(() => (debug.value.conditions ? 'inline-flex' : 'none'));
const displayCycles = computed(() => (debug.value.cycles ? 'inline-flex' : 'none'));
const displayDiverts = computed(() => (debug.value.diverts ? 'inline-flex' : 'none'));
const displayFunctions = computed(() => (debug.value.functions ? 'inline-flex' : 'none'));
</script>
<style>
body {
  --background: #f0f0f0;
  --color: #111;
  --span-color: #666;
  background-color: var(--background);
  color: var(--color);
}

div.header {
  display: flex;
  flex-direction: column;
  justify-content: left;
  flex-wrap: wrap;
  margin: 0.2em 3em;
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
  color: var(--span-color);
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
span.condition > span.result::after {
  display: block;
}
span.condition > span.result.false::after {
  display: block;
  content: "(skipped)";
  text-align: center;
}
span.condition > span.result.false.has_otherwise::after {
  text-align: right;
  content: "- else:";
}
span.condition > span.result.true::after {
  text-align: right;
  content: "- then:";
}
span.result.true {
  color: green;
}
span.result.false {
  color: red;
}
span.result.false.has_otherwise {
  color: orange;
}

span.start::before {
  content: "{{";
}
span.end::after {
  content: "}}";
}
span.start {
  position: relative;
}
span.count {
  padding-left: 1em;
  font-size: 1em;
  position: absolute;
  top: -1em;
}

span.return {
  position: relative;
  padding-left: 0.5em;
}
span.return::before {
  content: "end";
  position: absolute;
  top: -1em;
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
div.body > div span.expr, div.body > div span.call, div.body > div span.return {
  display: v-bind(displayFunctions);
}

label {
  display: inline-block;
}
label.file, label.select {
  flex-direction: column;
  justify-content: left;
  flex-wrap: wrap;
  margin: 0.2em 3em;
  background-color: white;
  padding: 0.2em;
  border-radius: 0.2em;
  border: 1px solid #ccc;
}
label.file:hover {
  background-color: #ddd;
}
label.file:active {
  background-color: #bbb;
}
label.file > input {
  display: none;
}
</style>
