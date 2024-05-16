<template>
  <ControlPanel />
  <div class="body" :class="{ inline: options[0]?.inline }">
    <TransitionGroup name="list">
      <div v-for="line, i in lines" :key="i">
        <p v-html="line" />
      </div>
    </TransitionGroup>
    <TransitionGroup name="list" tag="ul">
      <li v-for="option, i in options" :key="option.link" class="option">
        <button type="button" @click="story.select(i)" v-html="story.getOptionText(option)" :disabled="!option.condition" />
      </li>
    </TransitionGroup>
  </div>
</template>
<script setup lang="ts">
import {
  computed, onMounted,
} from 'vue';

import ControlPanel from './ControlPanel.vue';

import useStore from './store';
import useStory from './teller';

const store = useStore();
const debug = computed(() => store.debug);
const story = useStory(store);
const {
  ink, inkHistory, lines, options,
} = story;

declare global {
  interface Window {
    ink: Record<string, string | number | boolean>;
    inkHistory: Record<string, number>;
  }
}
onMounted(async () => {
  await story.selectNewKnot();
  window.ink = ink;
  window.inkHistory = inkHistory;
});

const displayConditions = computed(() => (debug.value.conditions ? 'inline-flex' : 'none'));
const displayConditionDetails = computed(
  () => (debug.value.conditions && debug.value.conditionDetails ? 'inline-block' : 'none'),
);
const displayCycles = computed(() => (debug.value.cycles ? 'inline-flex' : 'none'));
const displayDiverts = computed(() => (debug.value.diverts ? 'inline-flex' : 'none'));
const displayFunctions = computed(() => (debug.value.functions ? 'inline-flex' : 'none'));
const displayOriginal = computed(() => (debug.value.showOriginal ? 'inline-block' : 'none'));
</script>
<style>
body {
  --background: #f0f0f0;
  --color: #111;
  --span-color: #666;
  background-color: var(--background);
  color: var(--color);
  margin: 0;
  padding: 0;
}

/* Inline 选项的显示 */
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

div.body span.original {
  font-size: 0.9em;
  text-decoration: underline;
}

ul > li.option button::after {
  content: "...";
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
div.body span.original {
  display: v-bind(displayOriginal);
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

#app {
  display: grid;
  justify-content: center;
  grid-template-columns: 50% 50%;
  height: 100vh;
}
#app > * {
  padding: 1em;
  width: 100%;
  height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
}
#app > *:first-child {
  grid-column: 2;
  grid-row: 1;
}
</style>
