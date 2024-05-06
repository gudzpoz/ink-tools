<template>
  <div class="header">
    <div class="sticky">
      <div>
        <label class="select" for="knotSelector">
          ⤷ 选择故事起点：
          <Dropdown
            id="knotSelector"
            v-model="store.selectedKnot"
            :options="stories.map((knot, i) => ({
              label: `${String(i + 1).padStart(4, '0')}-${knot}`,
              value: knot,
            }))"
            optionLabel="label"
            optionValue="value"
            placeholder="选择故事起点"
            filter
            :virtualScrollerOptions="{ itemSize: 38 }"
          />
        </label>
        <button type="button" @click="selectNewKnot()">
          ⟳ 从头再来
        </button>
        <button type="button" @click="selectNewKnot('test')" v-if="DEVELOPMENTAL">
          运行上传的 test.json（不上传就运行的话应该会出很多错）
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
          <input type="checkbox" v-model="debug.conditionDetails" :disabled="!debug.conditions" />
          🌸 显示条件有关变量
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
        <label>
          <input type="checkbox" v-model="debug.stepping" /> 🐌 步进
        </label>
        <button type="button" @click="fetchMore()" :disabled="!debug.stepping">
          👣 步进
        </button>
      </div>
      <div>
        变量控制：
        <button type="button" @click="alertUsage">
          🐞 如何使用
        </button>
        <button type="button" @click="showVariableBrowser()">
          🔍 变量查看器
        </button>
        <button type="button" @click="resetVariables">
          🗑️ 重置 {{
            Object.keys(store.globalVariables).length
          }} 个变量以及 {{
            Object.keys(store.globalReadCounts).length
          }} 个读取计数器
        </button>
      </div>
      <div>
        存盘与读取：
        <label class="select">
          ⋙ 选择之前选项点
          <select ref="saveSelect" @change="(e) => loadStory((e.target as HTMLSelectElement).value)">
            <option
              v-for="save, i in store.saves"
              :key="i"
              :value="i"
            >
              #{{ store.saves.length - i }}@{{ save.title }}
            </option>
          </select>
        </label>
        <button type="button" @click="quickLoad">
          ⤴️ 上一个选项点
        </button>
        <button type="button" @click="clearSaves">
          🗑️ 清除存盘
        </button>
        <label>
          <input type="checkbox" v-model="debug.keepCycles" /> 💫 重开/读取存档保留 Cycle 计数
        </label>
      </div>
      <p class="ip">你现在处在：{{ ip.join('.') }}</p>
    </div>
  </div>
  <div class="body" :class="{ inline: options[0]?.inline }">
    <TransitionGroup name="list">
      <div v-for="line, i in lines" :key="i">
        <p v-html="line" />
      </div>
    </TransitionGroup>
    <TransitionGroup name="list" tag="ul">
      <li v-for="option, i in options" :key="option.link">
        <button type="button" @click="select(i)" v-html="getOptionText(option)" :disabled="!option.condition" />
      </li>
    </TransitionGroup>
  </div>
  <Dialog
    class="variable-browser"
    v-model:visible="shouldShowVariableBrowser"
    header="变量/节点查看器"
    :keepInViewPort="false"
  >
    <TabView>
      <TabPanel header="变量">
        <label>
          正则表示式筛选：
          <input
            type="text"
            v-model="store.variableFilter"
            placeholder="示例：money|fogg"
          />
        </label>
        <div class="variable-browser-inner">
          <label
            v-for="[k, v] in filteredVariables"
            :key="k"
          >
            {{ k }}<span v-if="store.globalVariables[k] !== undefined">（已修改）</span>=
            <input
              v-if="typeof v === 'number'"
              type="number"
              :value="v"
              @change="ink[k] = Number(($event.target as HTMLInputElement).value)"
            />
            <input
              v-else-if="typeof v === 'boolean'"
              type="checkbox"
              :checked="!!v"
              @change="ink[k] = Boolean(($event.target as HTMLInputElement).checked)"
            />
            <div v-else>出错啦！（{{ k }}={{ v }}）请向开发者汇报～</div>
          </label>
        </div>
      </TabPanel>
      <TabPanel header="节点">
        <div class="knot-browser">
          <label class="select" for="knotBrowserSelector">
            Knot 文件名：
            <Dropdown
              id="knotBrowserSelector"
              v-model="browserSelectedKnot"
              :options="stories.map((knot) => ({
                label: `:${knot}`,
                value: knot,
              }))"
              optionLabel="label"
              optionValue="value"
              placeholder="Knot 名称"
              filter
              :virtualScrollerOptions="{ itemSize: 38 }"
            />
          </label>
          <label>
            :{{ browserSelectedKnot }} 访问次数
            <span v-if="store.globalReadCounts[`:${browserSelectedKnot}`] !== undefined">（已修改）</span>：
            <input
              type="number"
              :value="story.getReadCount(`:${browserSelectedKnot}`)"
              @change="inkHistory[`:${browserSelectedKnot}`] = Number(($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="select" for="stitchBrowserSelector">
            Stitch 名称：
            <Dropdown
              id="stitchBrowserSelector"
              v-model="browserSelectedStitch"
              :options="stitchesShown.map((stitch) => ({
                label: `:${stitch}`,
                value: stitch,
              }))"
              optionLabel="label"
              optionValue="value"
              placeholder="Stitch 名称"
              filter
              :virtualScrollerOptions="{ itemSize: 38 }"
            />
          </label>
          <label>
            :{{ browserSelectedKnot }}:{{
              stitchesShown.includes(browserSelectedStitch) ? browserSelectedStitch : '???'
            }} 访问次数
            <span
              v-if="store.globalReadCounts[
                `:${browserSelectedKnot}:${browserSelectedStitch}`
              ] !== undefined">（已修改）</span>：
            <input
              type="number"
              :disabled="!stitchesShown.includes(browserSelectedStitch)"
              :value="story.getReadCount(`:${browserSelectedKnot}:${
                stitchesShown.includes(browserSelectedStitch) ? browserSelectedStitch : '???'
              }`)"
              @change="inkHistory[
                `:${browserSelectedKnot}:${browserSelectedStitch}`
              ] = Number(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </TabPanel>
    </TabView>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from 'primevue/dialog';
import Dropdown from 'primevue/dropdown';
import TabPanel from 'primevue/tabpanel';
import TabView from 'primevue/tabview';

import { parse as parseCsv } from 'csv-parse/browser/esm/sync';
import {
  computed, onMounted, ref, watch,
} from 'vue';
import JSZip from 'jszip';

import useStore from './store';
import {
  DebugInfo, InkStoryRunner, InkVariableType, Options,
} from './story';
import { InkChunkNode, InkChunkWithStitches, InkRootNode } from '../types';

import rootJson from '../../data/80days.json';
import { yieldToMain } from './utils';

const DEVELOPMENTAL = import.meta.env.DEV;

// @ts-expect-error: Excessive stack depth comparing types
const root: InkRootNode = rootJson;
const story = new InkStoryRunner(root);
const ip = ref([]);

const stories = Object.keys(root['indexed-content'].ranges);
const saveSelect = ref<HTMLSelectElement>();

const lines = ref(['']);
const options = ref<Options>([]);

const store = useStore();
const debug = computed(() => store.debug);
const shouldShowVariableBrowser = ref(false);

const variablesShown = ref<Record<string, InkVariableType>>({});
const filteredVariables = computed(() => {
  try {
    const regex = RegExp(store.variableFilter);
    return Object.entries(variablesShown.value).filter(([k]) => regex.test(k));
  } catch (_) {
    return Object.entries(variablesShown.value);
  }
});
const browserSelectedKnot = ref('');
const browserSelectedStitch = ref('');
const stitchesShown = ref<string[]>([]);
function showVariableBrowser() {
  variablesShown.value = Object.fromEntries(
    story.getVariableNames().map((name) => [name, story.getVar(name)]),
  );
  shouldShowVariableBrowser.value = true;
}
story.listener = (event) => {
  if (event.type === 'variable') {
    variablesShown.value[event.name] = event.value;
  } else {
    browserSelectedKnot.value = event.knot;
    browserSelectedStitch.value = event.stitch ?? '';
  }
};
watch(browserSelectedKnot, async (name) => {
  const chunk = await story.copyChunk(name) as InkChunkNode;
  if (Array.isArray(chunk) || Object.keys(chunk).length === 0) {
    stitchesShown.value = [];
    return;
  }
  stitchesShown.value = Object.keys((chunk as InkChunkWithStitches).stitches);
});

function saveStory() {
  const save = story.save();
  store.saves.unshift({
    save,
    lines: lines.value.map((e) => e),
    options: options.value.map((e) => e),
    title: story.copyIp().join('.'),
  });
}

const storyUniqueId = ref(0);
let timeOutHandle: ReturnType<typeof setTimeout> | null = null;
function schedule(delay: number) {
  if (debug.value.stepping) {
    return;
  }
  timeOutHandle = setTimeout(() => {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define, no-void
    void fetchMore();
  }, delay);
}
function outputText(l: string) {
  const [first, ...rest] = l.split('<br><br>');
  lines.value[lines.value.length - 1] += first;
  lines.value.push(...rest);
}
function getConditionDetails(l: DebugInfo) {
  let text = l.info;
  if (l.usedVariables || l.usedFunctions || l.usedKnots) {
    text += '<div class="details">';
    if (l.usedVariables?.length) {
      text += `<div class="variables">涉及变量：${l.usedVariables.join(', ')}</div>`;
    }
    if (l.usedFunctions?.length) {
      text += `<div class="functions">涉及函数：${l.usedFunctions.join(', ')}</div>`;
    }
    if (l.usedKnots?.length) {
      text += `<div class="functions">涉及节点：${l.usedKnots.join(', ')}</div>`;
    }
    text += '</div>';
  }
  return text;
}
function getOptionText(o: Options[number]) {
  return `${
    o.debug.map((d) => (typeof d === 'string' ? d : getConditionDetails(d))).join('')
  }${o.text}`;
}
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
  if (!line) {
    lines.value.push('Story Ended');
    return;
  }
  line.forEach((l) => {
    if (typeof l === 'string') {
      // 普通输出
      outputText(l);
      return;
    }
    // 选项
    if (Array.isArray(l)) {
      if (l.every((e) => !e.condition)) {
        // 全部不可选的情况下当成普通内容处理。
        outputText(`<ul>${
          l.map((e) => `<li><button disabled>${getOptionText(e)}</button></li>`).join('')
        }</ul>`);
        return;
      }
      lines.value[lines.value.length - 1] += ' ';
      options.value = l;
      saveStory();
      return;
    }
    // Debug 信息
    outputText(getConditionDetails(l));
  });
  if (options.value.length === 0) {
    schedule(delay);
  }
}

function clearContents() {
  storyUniqueId.value += 1;
  lines.value = [''];
  options.value = [];
}

async function selectNewKnot(knot?: string) {
  if (timeOutHandle !== null) {
    clearTimeout(timeOutHandle);
    timeOutHandle = null;
  }
  store.saves = [];
  clearContents();
  const cycleCounts = debug.value.keepCycles && story.save().cycleCounts;
  await story.init(knot ?? store.selectedKnot);
  if (cycleCounts) {
    story.environment.cycleCounts = cycleCounts;
  }
  Object.entries(store.globalVariables).forEach(([k, v]) => {
    story.setVar(k, v);
  });
  Object.entries(store.globalReadCounts).forEach(([k, v]) => {
    story.setReadCount(k, v);
  });
  await fetchMore();
}
watch(() => store.selectedKnot, () => selectNewKnot(store.selectedKnot));

declare global {
  interface Window {
    ink: Record<string, string | number | boolean>;
    inkHistory: Record<string, number>;
  }
}

const ink = new Proxy<Record<string, InkVariableType>>({}, {
  get(_: never, p: string) {
    return story.getVar(p);
  },
  set(_: never, p: string, v: string | number | boolean) {
    store.globalVariables[p] = v;
    story.setVar(p, v);
    return true;
  },
  ownKeys() {
    return story.getVariableNames();
  },
});
const inkHistory = new Proxy<Record<string, number>>({}, {
  get(_: never, p: string) {
    return story.getReadCount(p);
  },
  set(_: never, p: string, v: number) {
    store.globalReadCounts[p] = v;
    story.setReadCount(p, v);
    return true;
  },
  ownKeys() {
    return Object.keys(root['indexed-content'].ranges).map((e) => `:${e}`);
  },
});
onMounted(async () => {
  await selectNewKnot();
  window.ink = ink;
  window.inkHistory = inkHistory;
});

async function select(i: number) {
  const { value } = options;
  options.value = [];
  await story.selectOption(value, i);
  await fetchMore();
}

async function loadStory(i: string) {
  const to = parseInt(i, 10);
  const { save, lines: savedLines, options: savedOptions } = store.saves[to];
  clearContents();
  store.saves = store.saves.splice(to);
  const cycleCounts = debug.value.keepCycles && story.save().cycleCounts;
  await story.load(save as never);
  if (cycleCounts) {
    story.environment.cycleCounts = cycleCounts;
  }
  lines.value = savedLines;
  options.value = savedOptions;
  if (savedOptions.length !== 0) {
    await fetchMore();
  }
  ip.value = story.copyIp() as never[];
}

async function quickLoad() {
  if (options.value.length === 0 && store.saves.length >= 1) {
    await loadStory('0');
    return;
  }
  if (store.saves.length >= 2) {
    await loadStory('1');
    return;
  }
  store.saves = [];
  await selectNewKnot(store.selectedKnot);
}

function clearSaves() {
  store.saves = [];
}

function alertUsage() {
  // eslint-disable-next-line no-alert
  alert(`你当然可以直接使用右边的变量查看器。
如果用控制台的话，请按 F12 打开浏览器的开发者工具，并点击进入控制台（Console）。
在 Console 里输入下面内容来改变变量值：
    ink.<variable> = newValue;
在 Console 里输入下面内容来改变是否读过某 knot / stitch 的统计量：
    inkHistory[':knot:stitch'] = 1;
例如：
    ink.banksize = 3;
    ink.money = 1000;
    inkHistory[':meet_manager:__default_paragraph_4'] = 1;
这些变量在输入之后以及每次故事从头运行时都会被设置成您所设定的值。（按“重置”按钮来恢复默认值。）`);
}

function resetVariables() {
  store.globalVariables = {};
  store.globalReadCounts = {};
}

type CsvTranslation = {
  json_path: string,
  original: string,
  translated: string,
};

function patchChunkWithTranslation(obj: unknown, translations: CsvTranslation[], isRoot: boolean) {
  const chunk = isRoot ? (obj as InkRootNode).buildingBlocks : obj;
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
  const translations = parseCsv(csv, {
    bom: true,
    cast: false,
    columns: ['json_path', 'original', 'translated'],
    skip_empty_lines: true,
    relax_column_count_less: true,
    relax_column_count_more: true,
  }) as CsvTranslation[];
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
  if (ext !== 'zip' && name !== '' && name !== 'test' && root['indexed-content'].ranges[name] === undefined) {
    (shouldAlert ? alert : console.log)(`JSON/CSV 的文件名不符合：无对应 ${stem} 的 Ink 节点`);
    return false;
  }
  // 操作可能较为费时，优先保证 UI 响应。
  await yieldToMain();
  if (ext === 'csv') {
    const translations = parseTranslationCsv(content);
    const chunk = await story.copyChunk(name);
    patchChunkWithTranslation(chunk, translations, stem === '');
    story.loadExternalChunk(name, chunk);
  } else if (ext === 'json') {
    const json = new TextDecoder('utf-8').decode(content);
    const translatedJson = JSON.parse(json) as InkChunkNode;
    story.loadExternalChunk(name, translatedJson);
  } else {
    const promises: Promise<boolean>[] = [];
    (await (new JSZip().loadAsync(content))).forEach((path, data) => {
      if (data.dir) {
        return;
      }
      const segments = path.split('/');
      const filename = segments.pop()!;
      // eslint-disable-next-line prefer-const
      let [entryStem, entryExt, extra] = filename.split('.');
      if (!entryStem || !entryExt) {
        return;
      }
      if (extra === 'json' && entryExt === 'csv') {
        // Paratranz 导出的原始格式，处理不了。
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
    await selectNewKnot();
  }
}
watch(() => debug.value.original, () => {
  story.useExternal = !debug.value.original;
});
watch(() => debug.value.logPaths, () => {
  story.logPaths = !debug.value.logPaths;
});

const displayConditions = computed(() => (debug.value.conditions ? 'inline-flex' : 'none'));
const displayConditionDetails = computed(
  () => (debug.value.conditions && debug.value.conditionDetails ? 'inline-block' : 'none'),
);

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
  padding: 0.2em 3em;
}
div.inline > div:nth-last-child(2), div.inline > div:nth-last-child(2) > p {
  display: inline;
}
div.inline > ul, div.inline > ul > li {
  display: inline;
  padding-left: 0;
}

div.body span, div.body div.details {
  font-size: 0.6rem;
  color: var(--span-color);
}
div.body span.condition {
  font-family: monospace;
  display: inline-flex;
  flex-direction: column;
  text-align: center;
  vertical-align: top;
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
div.body span.result.true {
  color: green;
}
div.body span.result.false {
  color: red;
}
div.body span.result.false.has_otherwise {
  color: orange;
}
div.body div.details div.variables::before {
  background-color: red;
  content: "";
  width: 2px;
  height: 1em;
  display: inline-block;
}
div.body div.details div.variables,
div.body div.details div.functions,
div.body div.details div.knots {
  background-color: #fff8;
  padding: 0.2em;
  border-radius: 3px;
  min-width: 8em;
}
div.body div.details div.variables {
  display: inline-block;
}
div.body div.details div.functions,
div.body div.details div.knots {
  display: block;
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
div.body span.count {
  padding-left: 1em;
  position: absolute;
  top: -1em;
  font-family: monospace;
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

div.body span.condition {
  display: v-bind(displayConditions);
}
div.body div.details {
  display: v-bind(displayConditionDetails);
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
  background-color: white;
  padding: 0.2em;
  border-radius: 0.2em;
  border: 1px solid #ccc;
}
label.select {
  width: 100%;
  height: fit-content;
  overflow: hidden;
}
label.select > select {
  width: 100%;
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

.variable-browser-inner > label {
  display: flex;
  justify-content: space-between;
  height: 1.5em;
}
.knot-browser {
  display: flex;
  flex-direction: column;
  justify-content: left;
  flex-wrap: wrap;
  text-align: center;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

p.ip {
  height: 1.5em;
  width: 100%;
  overflow-x: auto;
  text-wrap: nowrap;
}

#app {
  display: grid;
  justify-content: center;
  grid-template-columns: 1fr 1fr;
}
#app > div.header {
  grid-column: 2;
  grid-row: 1;
}
div.header > div.sticky {
  position: sticky;
  top: 30px;
  width: 40vw;
}
</style>
