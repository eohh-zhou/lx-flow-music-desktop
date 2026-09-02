<template>
  <div
    ref="dom_root"
    :class="$style.container"
    @contextmenu.stop
  >
    <div
      :class="[$style.search, { [$style.active]: focused }]"
    >
      <div :class="$style.form">
        <button
          type="button"
          :class="$style.searchBtn"
          :title="$t('search')"
          @mousedown.prevent="focusInput"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 30.239 30.239" space="preserve">
            <use xlink:href="#icon-search" />
          </svg>
        </button>
        <input
          ref="dom_input"
          v-model.trim="keyword"
          :placeholder="$t('search')"
          :class="$style.input"
          @focus="handleFocus"
          @blur="handleBlur"
          @keydown="handleKeydown"
          @keydown.arrow-down.arrow-up.prevent
          @keydown.enter.prevent="handleEnter"
          @keydown.esc.prevent="handleEsc"
          @contextmenu="handleContextMenu"
        >
        <transition enter-active-class="animated zoomIn" leave-active-class="animated zoomOut">
          <button
            v-show="keyword"
            type="button"
            :class="$style.clearBtn"
            :title="$t('search__clear_filter')"
            @mousedown.prevent="handleClear"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 24 24" space="preserve">
              <use xlink:href="#icon-window-close" />
            </svg>
          </button>
        </transition>
      </div>
      <SearchPopup
        ref="dom_popup"
        :visible="popupVisible"
        :keyword="keyword"
        :source="effectiveSource"
        :scope-list-id="scopeListId"
        :select-index="selectIndex"
        :tip-list="tipList"
        @pick="handlePopupPick"
        @play-song="handlePopupPlaySong"
        @play-leaderboard="handlePopupPlayLeaderboard"
        @navigate-leaderboard="handlePopupNavigateLeaderboard"
        @hover-index="handleHoverIndex"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, shallowRef } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import music from '@renderer/utils/musicSdk'
import { debounce } from '@common/utils'
import { appSetting } from '@renderer/store/setting'
import { searchText as _searchText } from '@renderer/store/search/state'
import {
  setSearchText,
  addHistoryWord,
  getHistoryList,
} from '@renderer/store/search/action'
import { setTempList } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player/action'
import { LIST_IDS } from '@common/constants'
import { HOTKEY_COMMON } from '@common/hotKey'
import { getSearchSetting } from '@renderer/utils/data'
import SearchPopup from './SearchPopup.vue'

const router = useRouter()
const route = useRoute()

const dom_root = ref(null)
const dom_input = ref(null)
const dom_popup = ref(null)

const keyword = ref('')
const focused = ref(false)
const popupVisible = ref(false)
const tipList = shallowRef([])
const selectIndex = ref(-1)

// 全局键盘焦点（用于判断是否拦截快捷键，避免冲突）
const isGloballyFocused = ref(false)

let hideTimer = null
let prevTipSource = ''
let pendingNavTimer = null

// 当前生效的 source：优先 temp_source，scope 模式下锁定为 scope 歌单的 source
const effectiveSource = ref('kw')

// scope 模式判定：当前路由是否在某个歌单内
const scopeListId = computed(() => {
  if (route.name === 'List' && typeof route.query.id === 'string') return route.query.id
  if (route.name === 'SongListDetail' && typeof route.query.source === 'string' && typeof route.query.id === 'string') {
    return `detail:${route.query.source}:${route.query.id}`
  }
  return ''
})

const isScopedMode = computed(() => !!scopeListId.value)

// popup 应显示的最大可选索引数量（用于键盘上下箭头）
const selectableCount = computed(() => {
  if (!popupVisible.value) return 0
  if (keyword.value) {
    return isScopedMode.value
      ? (dom_popup.value?.maxSelectIndex ?? -1) + 1
      : tipList.value.length
  }
  // 空关键词：rich 模式
  return (dom_popup.value?.maxSelectIndex ?? -1) + 1
})

watch(keyword, () => {
  selectIndex.value = keyword.value ? 0 : -1
  if (keyword.value) tipSearch()
  else { tipList.value = [] }
  if (focused.value) popupVisible.value = true
  // scope 模式下，输入即写入 route.query.search（实时过滤）
  if (isScopedMode.value && !pendingNavTimer) {
    syncScopeSearchParam()
  }
})

watch(() => route.name, () => {
  if (!focused.value) keyword.value = ''
  if (route.name !== 'Search') {
    if (appSetting['odc.isAutoClearSearchInput']) keyword.value = ''
  }
})

watch(_searchText, (v) => {
  if (route.name === 'Search' && v !== keyword.value) keyword.value = v
})

watch(focused, (v) => {
  if (v) popupVisible.value = true
})

watch(scopeListId, () => {
  selectIndex.value = keyword.value ? 0 : -1
})

watch(popupVisible, (v) => {
  if (!v && pendingNavTimer) {
    clearTimeout(pendingNavTimer)
    pendingNavTimer = null
  }
})

const focusInput = () => dom_input.value?.focus()

const handleFocus = () => {
  focused.value = true
  isGloballyFocused.value = true
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  popupVisible.value = true
  // 进入 scope 模式时让 input 与当前 route.query.search 同步
  if (isScopedMode.value && typeof route.query.search === 'string') {
    if (keyword.value !== route.query.search) keyword.value = route.query.search
  }
  // 加载临时 source 设置
  void getSearchSetting().then(({ temp_source }) => {
    if (temp_source) effectiveSource.value = temp_source
  }).catch(() => {})
  if (keyword.value) tipSearch()
}

const handleBlur = () => {
  hideTimer = setTimeout(() => {
    focused.value = false
    popupVisible.value = false
    isGloballyFocused.value = false
    selectIndex.value = -1
  }, 120)
}

const handleClear = () => {
  keyword.value = ''
  if (isScopedMode.value) syncScopeSearchParam()
  focusInput()
}

// 写入或清除当前 scope 路由的 search query param
const syncScopeSearchParam = () => {
  if (pendingNavTimer) clearTimeout(pendingNavTimer)
  const kw = keyword.value.trim()
  const newQuery = { ...route.query }
  if (kw) newQuery.search = kw
  else delete newQuery.search
  pendingNavTimer = setTimeout(() => {
    pendingNavTimer = null
    router.replace({ path: route.path, query: newQuery }).catch(() => {})
  }, 60)
}

const tipSearch = debounce(async() => {
  const sdk = music[prevTipSource || effectiveSource.value]
  if (!sdk?.tipSearch) return
  if (!keyword.value) {
    tipList.value = []
    sdk.tipSearch.cancelTipSearch?.()
    return
  }
  const { temp_source } = await getSearchSetting()
  if (!prevTipSource) prevTipSource = temp_source || 'kw'
  const src = prevTipSource
  const tipSdk = music[src]?.tipSearch
  if (!tipSdk) return
  tipSdk.search(keyword.value).then(list => {
    if (src !== prevTipSource) return
    tipList.value = list || []
  }).catch(() => {
    tipList.value = []
  })
}, 60)

const handleEnter = async() => {
  // 优先：selectIndex 命中某项
  if (selectIndex.value > -1) {
    if (keyword.value) {
      // tip / scope 列表
      if (isScopedMode.value) {
        const list = dom_popup.value?.scopeFiltered ?? []
        const song = list[selectIndex.value]
        if (song) {
          handlePopupPlaySong({ song, list: dom_popup.value?.scopeAllList ?? list, scopeListId: scopeListId.value, index: selectIndex.value })
          popupVisible.value = false
          return
        }
      } else {
        const item = tipList.value[selectIndex.value]
        if (item != null) {
          keyword.value = item
          await nextTick()
          await submitKeyword(item, true)
          return
        }
      }
    } else {
      // rich 模式：selectIndex 命中 hot / board
      const items = buildRichItems()
      const item = items[selectIndex.value]
      if (item?.type === 'hot') {
        keyword.value = item.value
        await nextTick()
        await submitKeyword(item.value, true)
        return
      }
      if (item?.type === 'board-song') {
        handlePopupPlayLeaderboard({ bangid: item.boardId, source: effectiveSource.value, songs: item.songs, index: item.index })
        popupVisible.value = false
        return
      }
    }
  }
  // 否则提交当前关键词
  if (!keyword.value.trim()) return
  await submitKeyword(keyword.value.trim(), true)
}

// rich 模式的可选项扁平化（用于 Enter 命中）
const buildRichItems = () => {
  const items = []
  // hot keywords (前 9 个)
  const hot = dom_popup.value?.hotKeywords ?? []
  hot.slice(0, 9).forEach(v => items.push({ type: 'hot', value: v }))
  // board songs
  const boards = dom_popup.value?.boards ?? []
  for (const b of boards) {
    b.songs.slice(0, 9).forEach((s, i) => items.push({ type: 'board-song', boardId: b.bangid, songs: b.songs, song: s, index: i }))
  }
  return items
}

const submitKeyword = async(text, fromEnter = false) => {
  if (!text) return
  if (isScopedMode.value) {
    // scope 模式下，Enter 直接同步 route.query.search（不导航）
    const newQuery = { ...route.query, search: text }
    await router.replace({ path: route.path, query: newQuery }).catch(() => {})
    keyword.value = text
    popupVisible.value = false
    focused.value = false
    dom_input.value?.blur()
    return
  }
  // 全局模式：导航到 /search
  setSearchText(text)
  await addHistoryWord(text)
  popupVisible.value = false
  focused.value = false
  dom_input.value?.blur()
  // 保留一点延迟，避免 blur 与 focus 抢焦点
  await new Promise(resolve => setTimeout(resolve, 30))
  await router.replace({
    path: '/search',
    query: { text },
  }).catch(() => {})
}

const handleKeydown = (e) => {
  // ArrowDown / ArrowUp / Enter / Esc 已经在模板上 .prevent 处理
  if (!popupVisible.value) return
  const count = selectableCount.value
  if (count <= 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectIndex.value = selectIndex.value + 1 < count ? selectIndex.value + 1 : 0
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectIndex.value = selectIndex.value - 1 >= 0 ? selectIndex.value - 1 : count - 1
  }
}

const handleEsc = () => {
  if (keyword.value) {
    keyword.value = ''
    if (isScopedMode.value) syncScopeSearchParam()
  } else {
    popupVisible.value = false
    focused.value = false
    dom_input.value?.blur()
  }
}

const handleContextMenu = (e) => {
  e.preventDefault()
  const text = window.getSelection()?.toString().trim() ?? ''
  if (!text) return
  const start = dom_input.value.selectionStart
  const end = dom_input.value.selectionEnd
  const newVal = keyword.value.substring(0, start) + text + keyword.value.substring(end)
  keyword.value = newVal
}

// ---- popup 事件 ----
const handleHoverIndex = (idx) => {
  selectIndex.value = idx
}

const handlePopupPick = async(kw) => {
  keyword.value = kw
  await nextTick()
  await submitKeyword(kw, true)
}

const handlePopupPlaySong = ({ song, list, scopeListId: listId, index }) => {
  // scope 模式点击歌曲：播放该歌曲
  if (!listId || !list?.length) return
  if (listId.startsWith('detail:')) {
    // 在线歌单详情：用临时列表
    void setTempList(listId, [...list]).then(() => {
      playList(LIST_IDS.TEMP, index)
    })
  } else {
    // 我的列表：直接用原 listId
    playList(listId, index)
  }
  popupVisible.value = false
  focused.value = false
  dom_input.value?.blur()
}

const handlePopupPlayLeaderboard = ({ bangid, source, songs, index = 0 }) => {
  if (!songs?.length) return
  void setTempList(`board__${bangid}`, [...songs]).then(() => {
    playList(LIST_IDS.TEMP, index)
  })
  popupVisible.value = false
  focused.value = false
  dom_input.value?.blur()
}

const handlePopupNavigateLeaderboard = ({ bangid, source }) => {
  popupVisible.value = false
  focused.value = false
  dom_input.value?.blur()
  void router.replace({
    path: '/leaderboard',
    query: { source, boardId: bangid },
  }).catch(() => {})
}

// ---- 全局快捷键 ----
const handleFocusHotkey = () => {
  focusInput()
  // 触发一次 popup 显示
  focused.value = true
  popupVisible.value = true
}

onMounted(() => {
  if (appSetting['search.isFocusSearchBox']) handleFocusHotkey()
  window.key_event?.on?.(HOTKEY_COMMON.focusSearchInput?.action, handleFocusHotkey)
  window.addEventListener('mousedown', handleDocumentMouseDown)
  // 初始化搜索历史（弹窗需要展示，不受设置开关限制）
  void getHistoryList()
})

onBeforeUnmount(() => {
  window.key_event?.off?.(HOTKEY_COMMON.focusSearchInput?.action, handleFocusHotkey)
  window.removeEventListener('mousedown', handleDocumentMouseDown)
  if (hideTimer) clearTimeout(hideTimer)
  if (pendingNavTimer) clearTimeout(pendingNavTimer)
})

// 点击外部关闭 popup
const handleDocumentMouseDown = (e) => {
  if (!popupVisible.value) return
  const root = dom_root.value
  if (root && !root.contains(e.target)) {
    popupVisible.value = false
    focused.value = false
  }
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  position: relative;
  width: 100%;
  max-width: 300px;
  min-width: 140px;
  height: 26px;
  -webkit-app-region: no-drag;
}

.search {
  position: absolute;
  width: 100%;
  border-radius: @radius-round;
  border: 1px solid transparent;
  transition: box-shadow .25s ease, background-color .25s ease, border-color .25s ease;
  display: flex;
  flex-flow: column nowrap;
  background-color: var(--color-050);

  &:hover:not(.active) {
    background-color: var(--color-100);
  }

  &.active {
    background-color: var(--color-000);
    border-color: var(--color-primary-alpha-500);
    box-shadow: 0 0 0 3px var(--color-primary-alpha-900), 0 2px 10px rgba(0, 0, 0, .05);
  }
}

.form {
  display: flex;
  height: 24px;
  position: relative;
  align-items: center;
}

.input {
  flex: auto;
  background-color: transparent;
  border: none;
  min-width: 0;
  outline: none;
  padding: 0 4px 0 2px;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 24px;
  color: var(--color-font);
  &::placeholder {
    color: var(--color-450);
    font-size: .98em;
  }
}

.searchBtn,
.clearBtn {
  flex: none;
  border: none;
  background-color: transparent;
  outline: none;
  cursor: pointer;
  height: 100%;
  width: 22px;
  padding: 0;
  margin: 0 1px;
  border-radius: @radius-round;
  color: var(--color-550);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: @transition-fast;
  transition-property: background-color, color;
  svg {
    height: 12px;
    width: 12px;
  }
  &:hover {
    color: var(--color-primary);
  }
  &:active { opacity: .7; }
}

.searchBtn {
  margin-left: 4px;
  pointer-events: auto;
}

.clearBtn {
  color: var(--color-450);
  margin-right: 4px;
  &:hover {
    color: var(--color-800);
    background-color: var(--color-100);
  }
}
</style>
