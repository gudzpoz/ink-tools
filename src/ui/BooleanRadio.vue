<template>
  <div class="boolean-radio">
    <span>{{ title }}</span>
    <label>
      <input type="radio" :checked="modelValue" @change="$emit('update:modelValue', true)">
      {{ activeLabel }}
    </label>
    <label>
      <input type="radio" :checked="!modelValue" @change="$emit('update:modelValue', false)">
      {{ inactiveLabel }}
    </label>
  </div>
</template>
<script setup lang="ts">
import { defineEmits, defineProps } from 'vue';

defineProps<{
  modelValue: boolean,
  title: string,
  activeLabel: string,
  inactiveLabel: string,
}>();

defineEmits<{
  (e: 'update:modelValue', value: boolean): void,
}>();
</script>
<style>
.boolean-radio {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 10px;
}
</style>
