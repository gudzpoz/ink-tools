<template>
  <div class="header">
    <div>
      <div>
        <label class="select" for="knotSelector">
          ⤷ 选择故事起点：
          <Dropdown
            id="knotSelector"
            v-model="store.selectedKnot"
            @update:modelValue="(knot) => story.selectNewKnot(knot)"
            :options="story.knots.map((knot, i) => ({
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
        <button type="button" @click="story.selectNewKnot()">
          ⟳ 从头再来
        </button>
        <button type="button" @click="story.selectNewKnot('test')" v-if="DEVELOPMENTAL">
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
        <label>
          <input type="checkbox" v-model="debug.replaceFunctions" :disabled="debug.original" />
          ㉆ 使用试验性函数翻译
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
        <button type="button" @click="story.fetchMore()" :disabled="!debug.stepping">
          👣 步进
        </button>
      </div>
      <div>
        存盘与读取：
        <label class="select">
          ⋙ 选择之前选项点
          <select ref="saveSelect" @change="(e) => story.load((e.target as HTMLSelectElement).value)">
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
        <button type="button" @click="story.clearSaves">
          🗑️ 清除存盘
        </button>
        <label>
          <input type="checkbox" v-model="debug.keepCycles" /> 💫 重开/读取存档保留 Cycle 计数，不恢复随机数种子
        </label>
      </div>
      <p class="ip">你现在处在：{{ story.ip.value.join('.') }}</p>
    </div>
    <TabView scrollable>
      <TabPanel header="变量">
        <button type="button" @click="story.resetVariables">
          🗑️ 重置 {{
            Object.keys(store.globalVariables).length
          }} 个变量以及 {{
            Object.keys(store.globalReadCounts).length
          }} 个读取计数器
        </button>
        <p>
          可以用控制台或者下面的输入框来改变变量值。
          这些变量在输入之后以及每次故事从头运行时都会被设置成您所设定的值。（按“重置”按钮来恢复默认值。）
        </p>
        <p>
          <label>
            正则表示式筛选：
            <input
              type="text"
              v-model="store.variableFilter"
              placeholder="示例：money|fogg"
            />
          </label>
        </p>
        <VirtualScroller
          class="variable-browser-inner"
          :itemSize="24"
          :items="filteredVariables"
        >
          <template v-slot:item="{ item }">
            <label :key="item[0]">
              {{ item[0] }}<span v-if="store.globalVariables[item[1]] !== undefined">（已修改）</span>=
              <input
                v-if="typeof item[1] === 'number'"
                type="number"
                :value="item[1]"
                @change="ink[item[1]] = Number(($event.target as HTMLInputElement).value)"
              />
              <input
                v-else-if="typeof item[1] === 'boolean'"
                type="checkbox"
                :checked="item[1]"
                @change="ink[item[0]] = Boolean(($event.target as HTMLInputElement).checked)"
              />
              <div v-else>出错啦！（{{ item[0] }}={{ item[1] }}）请向开发者汇报～</div>
            </label>
          </template>
        </VirtualScroller>
      </TabPanel>
      <TabPanel header="变量常用操作">
        <p>下面是一些常用操作以及它们的相关变量。如果觉得有其它常用操作的话欢迎在群里反馈～</p>
        <button type="button" @click="ink.seednum = Math.floor(1e6 + Math.random() * 1e4)">
          🌱 随机化随机数种子（seednum）
        </button>
        <button type="button" @click="ink.money = 10 * 10000 * 240 + (ink.money as number)">
          💵 给我来 10 万英镑（money）
        </button>
        <button type="button" @click="ink.withoutfogg = false">
          🤡 获得 Monsieur Fogg（源码是这么写的）（withoutfogg）
        </button>
        <button type="button" @click="ink.withoutfogg = true">
          🎩 失去 Monsieur Fogg（withoutfogg）
        </button>
        <p>一些小提示：</p>
        <ul>
          <li>
            网页模拟的 Ink 都是伪随机数，意思是从同样的条件/存档开始的话，只要选择的选项一样（或者甚至不一样）
            最后的结构仍然会是相同的。这对于测试来说可能不太友好，请善用随机化随机数种子以及读档时不恢复随机数种子的功能。
          </li>
          <li>
            如果看到 alt() 函数的话，它其实在现在的 Ink 里叫做 Shuffles，会（伪）随机地展示两片文本中的一条。
            如果发现只能看到其中一条，或是想测试另外一条的话，请尝试随机化随机数种子。
          </li>
          <li>
            0779-play_poker 打牌时需要 Monsieur Fogg 在场（withoutfogg=false）。
            另外打牌也是受到随机数种子控制的，请按需随机化随机数种子。
          </li>
        </ul>
      </TabPanel>
      <TabPanel header="节点">
        <div class="knot-browser">
          <label class="select" for="knotBrowserSelector">
            Knot 文件名：
            <Dropdown
              id="knotBrowserSelector"
              v-model="store.selectedKnot"
              :options="story.knots.map((knot) => ({
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
            :{{ store.browsingKnot }} 访问次数
            <span v-if="store.globalReadCounts[`:${store.browsingKnot}`] !== undefined">（已修改）</span>：
            <input
              type="number"
              :value="story.story.getReadCount(`:${store.browsingKnot}`)"
              @change="inkHistory[`:${store.browsingKnot}`] = Number(($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="select" for="stitchBrowserSelector">
            Stitch 名称：
            <Dropdown
              id="stitchBrowserSelector"
              v-model="store.browsingStitch"
              :options="story.stitchesInSelectedKnot.value.map((stitch) => ({
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
            :{{ store.browsingKnot }}:{{
              story.stitchesInSelectedKnot.value.includes(
                store.browsingStitch,
              ) ? store.browsingStitch : '???'
            }} 访问次数
            <span
              v-if="store.globalReadCounts[
                `:${store.browsingKnot}:${store.browsingStitch}`
              ] !== undefined">（已修改）</span>：
            <input
              type="number"
              :disabled="!story.stitchesInSelectedKnot.value.includes(store.browsingStitch)"
              :value="story.story.getReadCount(`:${store.browsingKnot}:${
                story.stitchesInSelectedKnot.value.includes(store.browsingStitch)
                  ? store.browsingStitch : '???'
              }`)"
              @change="inkHistory[
                `:${store.browsingKnot}:${store.browsingStitch}`
              ] = Number(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </TabPanel>
      <TabPanel header="覆盖率统计">
        <p>
          这里可以看到运行过程中有没有运行过翻译中的某一行，避免没有测试到某些翻译的情况。
          其实理想来说可能测总共排列组合的覆盖率会好些，但实现起来太复杂了，测试起来也难；
          所以这里测试的其实还只是翻译文本的覆盖率。
        </p>
        <label class="file">
          📤 上传当前测试的 CSV 翻译文件
          <input type="file" @change="(e) => story.setupCoverage(e)" />
        </label>
        <DataTable
          class="coverage-table"
          :virtualScrollerOptions="{ itemSize: 46 }"
          :value="Object.entries(story.coverage.value).map(([path, data]) => ({
            path,
            covered: data.covered ? '✅' : '❌',
            text: data.text,
          }))"
        >
          <Column field="covered" header="" />
          <Column field="path" header="位置" />
          <Column field="text" header="翻译文本" />
        </DataTable>
      </TabPanel>
      <TabPanel header="函数级别汉化危险区域">
        <p>
          这是用于直接替换某些不可能简单汉化的 buildingBlocks 类 JavaScript 脚本。
          我也不知道这可能弄出什么东西来。请密切关注浏览器控制台，如有问题请尝试刷新。
        </p>
        <label class="textarea">
          代码内容：
          <br>
          <Textarea v-model="story.inkyJs.value" />
        </label>
        <br>
        <button type="button" @click="story.applyInkyJs">💥 应用！</button>
        <button type="button" @click="story.exportInkyJsToJson">📥 导出为编译后的 JSON</button>
      </TabPanel>
    </TabView>
  </div>
</template>
<script setup lang="ts">
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dropdown from 'primevue/dropdown';
import TabPanel from 'primevue/tabpanel';
import TabView from 'primevue/tabview';
import Textarea from 'primevue/textarea';
import VirtualScroller from 'primevue/virtualscroller';

import { computed, ref } from 'vue';

import useStore from './store';
import useStory from './teller';

const DEVELOPMENTAL = import.meta.env.DEV;

const saveSelect = ref<HTMLSelectElement>();

const store = useStore();
const debug = computed(() => store.debug);
const story = useStory(store);
const {
  ink, inkHistory,
} = story;

const filteredVariables = computed(() => {
  try {
    const regex = RegExp(store.variableFilter);
    return Object.entries(story.variables.value).filter(([k]) => regex.test(k));
  } catch (_) {
    return Object.entries(story.variables.value);
  }
});

async function quickLoad() {
  if (story.options.value.length === 0 && store.saves.length >= 1) {
    await story.load('0');
    return;
  }
  if (store.saves.length >= 2) {
    await story.load('1');
    return;
  }
  store.saves = [];
  await story.selectNewKnot(store.selectedKnot);
}

async function updateStoryWithTranslation(e: Event) {
  const { files } = (e.target as HTMLInputElement);
  if (!files || files.length === 0) {
    return;
  }
  const [file] = files;
  if (await story.updateStoryWithFile(file.name, await file.arrayBuffer(), true)) {
    await story.selectNewKnot();
  }
}
</script>
<style scoped>
label.textarea, textarea {
  font-family: monospace;
  width: 100%;
  font-size: 0.8rem;
  min-height: 10em;
}

p.ip {
  height: auto;
  width: 100%;
  overflow-x: auto;
  text-wrap: nowrap;
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

.variable-browser {
  max-width: 50vw;
}
.variable-browser-inner label {
  display: flex;
  justify-content: space-between;
  height: 24px;
}
.knot-browser {
  display: flex;
  flex-direction: column;
  justify-content: left;
  flex-wrap: wrap;
  text-align: center;
}

.coverage-table, .variable-browser-inner {
  height: 30em;
  max-height: 60vh;
  overflow: auto;
}
</style>
