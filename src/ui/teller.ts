/* eslint-disable no-param-reassign */
import { parse as parseCsv } from 'csv-parse/browser/esm/sync';
import JSZip from 'jszip';
import { ref, watch } from 'vue';

import useStore from './store';
import { InkyJsCompiler, NEW_BUILDING_BLOCK_DEFINITIONS } from '../js2ijson';
import {
  DebugInfo, InkStoryRunner, InkVariableType, Options,
} from '../story';
import {
  InkChunkNode,
  InkChunkWithStitches,
  InkRootNode,
  JSONPath,
} from '../types';
import { yieldToMain } from '../utils';

import rootJson from '../../data/80days.json';

// @ts-expect-error: Excessive stack depth comparing types
const root: InkRootNode = rootJson;

function newStory(store: ReturnType<typeof useStore>) {
  const story = new InkStoryRunner(root);

  function updateFromStore() {
    story.useExternal = !store.debug.original;
    story.useReplacementFunctions = store.debug.replaceFunctions;
    story.logPaths = !store.debug.logPaths;
  }
  watch(store, updateFromStore, { deep: true });
  updateFromStore();

  const variables = ref<Record<string, InkVariableType>>({});
  const stitchesInSelectedKnot = ref<string[]>([]);
  story.listener = (event) => {
    if (event.type === 'variable') {
      variables.value[event.name] = event.value;
    } else {
      store.selectedKnot = event.knot;
      store.selectedStitch = event.stitch ?? '';
    }
  };
  watch(() => store.selectedKnot, async (name) => {
    const chunk = await story.copyChunk(name) as InkChunkNode;
    if (Array.isArray(chunk) || Object.keys(chunk).length === 0) {
      stitchesInSelectedKnot.value = [];
      return;
    }
    stitchesInSelectedKnot.value = Object.keys((chunk as InkChunkWithStitches).stitches);
  });
  function flushVariables() {
    variables.value = Object.fromEntries(
      story.getVariableNames().map((name) => [name, story.getVar(name)]),
    );
  }
  function resetVariables() {
    store.globalVariables = {};
    store.globalReadCounts = {};
  }

  const inkyJs = ref(NEW_BUILDING_BLOCK_DEFINITIONS);
  const compiler = new InkyJsCompiler();
  function applyInkyJs() {
    try {
      const buildingBlocks = compiler.compile(inkyJs.value);
      story.replacementFunctions.buildingBlocks = buildingBlocks;
    } catch (e) {
      console.error('编译失败，请检查语法：', (e as Error).message);
    }
  }
  function exportInkyJsToJson() {
    applyInkyJs();
    const json = JSON.stringify(story.replacementFunctions, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'buildingBlocks.json';
    a.click();
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

  const lines = ref(['']);
  const options = ref<Options>([]);
  const ip = ref<JSONPath>([]);

  const storyUniqueId = ref(0);
  let timeOutHandle: ReturnType<typeof setTimeout> | null = null;
  function clearContents() {
    storyUniqueId.value += 1;
    lines.value = [''];
    options.value = [];
  }
  function schedule(delay: number) {
    if (store.debug.stepping) {
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
    if (!line) {
      lines.value.push('<i>Story Ended</i><hr>');
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
  async function select(i: number) {
    const { value } = options;
    options.value = [];
    await story.selectOption(value, i);
    await fetchMore();
  }

  async function selectNewKnot(knot?: string) {
    if (timeOutHandle !== null) {
      clearTimeout(timeOutHandle);
      timeOutHandle = null;
    }
    store.saves = [];
    clearContents();
    const cycleCounts = store.debug.keepCycles && story.save().cycleCounts;
    const seedNum = store.debug.keepCycles && ink.seednum;
    await story.init(knot ?? store.selectedKnot);
    if (cycleCounts) {
      story.environment.cycleCounts = cycleCounts;
      ink.seednum = seedNum;
    }
    Object.entries(store.globalVariables).forEach(([k, v]) => {
      story.setVar(k, v);
    });
    Object.entries(store.globalReadCounts).forEach(([k, v]) => {
      story.setReadCount(k, v);
    });
    flushVariables();
    await fetchMore();
  }
  watch(() => store.selectedKnot, () => selectNewKnot(store.selectedKnot));

  function saveStory() {
    const save = story.save();
    store.saves.unshift({
      save,
      lines: lines.value.map((e) => e),
      options: options.value.map((e) => e),
      title: story.copyIp().join('.'),
    });
  }
  async function loadStory(i: string) {
    const to = parseInt(i, 10);
    const { save, lines: savedLines, options: savedOptions } = store.saves[to];
    clearContents();
    store.saves = store.saves.splice(to);
    const cycleCounts = store.debug.keepCycles && story.save().cycleCounts;
    const seedNum = store.debug.keepCycles && ink.seednum;
    await story.load(save as never);
    if (cycleCounts) {
      story.environment.cycleCounts = cycleCounts;
      ink.seednum = seedNum;
    }
    lines.value = savedLines;
    options.value = savedOptions;
    if (savedOptions.length !== 0) {
      await fetchMore();
    }
    flushVariables();
    ip.value = story.copyIp();
  }
  function clearSaves() {
    store.saves = [];
  }

  type CsvTranslation = {
    json_path: string,
    original: string,
    translated: string,
  };

  function patchChunkWithTranslation(
    obj: unknown,
    translations: CsvTranslation[],
    isRoot: boolean,
  ) {
    const chunk = isRoot ? (obj as InkRootNode).buildingBlocks : obj;
    translations.forEach(({ json_path, translated }) => {
      if (translated === '') {
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

  return {
    story,
    knots: Object.keys(root['indexed-content'].ranges),

    lines,
    options,
    ip,

    getOptionText,

    select,
    fetchMore,
    selectNewKnot,

    variables,
    resetVariables,
    stitchesInSelectedKnot,

    ink,
    inkHistory,

    save: saveStory,
    load: loadStory,
    clearSaves,

    inkyJs,
    applyInkyJs,
    exportInkyJsToJson,

    updateStoryWithFile,
  };
}

let story: ReturnType<typeof newStory> | undefined;
export default function useStory(store: ReturnType<typeof useStore>) {
  if (story) {
    return story;
  }
  story = newStory(store);
  return story;
}
