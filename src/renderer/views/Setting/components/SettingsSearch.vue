<template>
  <div ref="root" :class="$style.search" @focusout="handleFocusOut">
    <div :class="$style.inputWrap">
      <svg-icon name="search" viewBox="0 0 30.239 30.239" :class="$style.searchIcon" aria-hidden="true" />
      <input
        ref="input" v-model="query" type="search" role="combobox" autocomplete="off" spellcheck="false"
        :class="$style.input" :placeholder="$t('settings_search_placeholder')" :aria-label="$t('settings_search_label')"
        aria-autocomplete="list" aria-controls="settings-search-results" :aria-expanded="showResults"
        :aria-activedescendant="showResults && results[selectedIndex] ? `settings-search-${results[selectedIndex].id}` : undefined"
        @focus="opened = true" @input="opened = true" @keydown="handleKeydown" @keyup.stop
      >
      <button v-if="query" type="button" :class="$style.clear" :aria-label="$t('settings_search_clear')" @click="clear">
        <svg-icon name="window-close" viewBox="0 0 24 24" aria-hidden="true" />
      </button>
    </div>
    <div v-if="showResults" :class="$style.dropdown">
      <ul id="settings-search-results" ref="list" role="listbox" :aria-label="$t('settings_search_label')" class="scroll" :class="$style.results">
        <li
          v-for="(item, index) in results" :id="`settings-search-${item.id}`" :key="item.id" role="option"
          :aria-selected="selectedIndex == index" :class="[$style.result, { [$style.selected]: selectedIndex == index }]"
          @mouseenter="selectedIndex = index" @mousedown.prevent @click="select(item)"
        >
          <span :class="$style.title">{{ item.title }}</span>
          <span :class="$style.category">{{ item.categoryTitle }}</span>
        </li>
      </ul>
      <p v-if="!results.length" :class="$style.empty" role="status">{{ $t('settings_search_empty') }}</p>
      <div v-else :class="$style.footer">
        <span role="status" aria-live="polite">{{ $t('settings_search_count', { count: results.length }) }}</span>
        <span>{{ $t('settings_search_keyboard') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from '@common/utils/vueTools'
import { isLinux, isMac } from '@common/utils'
import { messages, useI18n } from '@root/lang'
import { createSettingSearchIndex, searchSettings, type SettingSearchItem } from '../searchIndex'

const emit = defineEmits<{
  (event: 'select', item: SettingSearchItem): void
  (event: 'close'): void
}>()
const t = useI18n()
const root = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const query = ref('')
const opened = ref(false)
const selectedIndex = ref(0)
const searchIndex = computed(() => createSettingSearchIndex(t, Object.values(messages), isMac ? 'darwin' : isLinux ? 'linux' : 'win32'))
const results = computed(() => searchSettings(searchIndex.value, query.value))
const showResults = computed(() => opened.value && !!query.value.trim())

watch(results, () => {
  selectedIndex.value = 0
  if (list.value) list.value.scrollTop = 0
})

const select = (item: SettingSearchItem) => {
  opened.value = false
  emit('select', item)
}
const clear = () => {
  query.value = ''
  input.value?.focus()
}
const handleFocusOut = (event: FocusEvent) => {
  if (!root.value?.contains(event.relatedTarget as Node | null)) opened.value = false
}
const handleKeydown = (event: KeyboardEvent) => {
  event.stopPropagation()
  // Enter while choosing an IME candidate must not activate a search result.
  if (event.isComposing || event.keyCode == 229) return
  if (event.key == 'Escape') {
    event.preventDefault()
    if (showResults.value) opened.value = false
    else emit('close')
  } else if (event.key == 'ArrowDown' || event.key == 'ArrowUp') {
    event.preventDefault()
    if (!results.value.length) return
    if (!opened.value) {
      opened.value = true
      selectedIndex.value = event.key == 'ArrowDown' ? 0 : results.value.length - 1
    } else {
      selectedIndex.value = (selectedIndex.value + (event.key == 'ArrowDown' ? 1 : -1) + results.value.length) % results.value.length
    }
    void nextTick(() => {
      list.value?.children[selectedIndex.value]?.scrollIntoView({ block: 'nearest' })
    })
  } else if (event.key == 'Enter' && showResults.value) {
    event.preventDefault()
    const item = results.value[selectedIndex.value]
    if (item) select(item)
  }
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.search {
  position: relative;
  width: 440px;
  max-width: 100%;
  color: var(--color-font);
}
.inputWrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--color-primary-alpha-300);
  border-radius: @form-radius;
  background: var(--color-app-background);
  &:focus-within { border-color: var(--color-primary); }
}
.searchIcon { flex: none; width: 16px; height: 16px; opacity: .7; }
.input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0;
  border: 0;
  outline: none;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 13px;
  &::placeholder { color: inherit; opacity: .65; }
  &::-webkit-search-cancel-button { display: none; }
}
.clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 5px;
  border: 0;
  border-radius: @form-radius;
  background: transparent;
  color: inherit;
  cursor: pointer;
  &:hover { background: var(--color-primary-alpha-900); }
  &:focus-visible { outline: 2px solid var(--color-primary); }
}
.dropdown {
  position: absolute;
  z-index: 10;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  overflow: hidden;
  border: 1px solid var(--color-primary-alpha-300);
  border-radius: @form-radius;
  background: var(--color-app-background);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
}
.results {
  max-height: min(320px, 45vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
}
.result {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px;
  border-radius: @form-radius;
  cursor: pointer;
}
.selected { background: var(--color-primary-alpha-900); }
.title { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.category { font-size: 11px; line-height: 1.3; opacity: .7; }
.empty { padding: 20px 12px; text-align: center; font-size: 13px; }
.footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  padding: 9px 12px;
  border-top: 1px solid var(--color-primary-alpha-900);
  font-size: 11px;
  line-height: 1.4;
  opacity: .8;
}
</style>
