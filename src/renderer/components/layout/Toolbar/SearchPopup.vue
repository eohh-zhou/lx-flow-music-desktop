<template>
  <div
    v-if="visible"
    :class="$style.popup"
    @mousedown.prevent
    @wheel.stop
  >
    <!-- 搜索历史 -->
    <section
      v-if="!keyword && historyList.length"
      :class="$style.section"
    >
      <header :class="$style.sectionHeader">
        <span :class="$style.sectionTitle">{{ $t('search__history_title') }}</span>
        <button
          :class="$style.iconBtn"
          :title="$t('search__history_clear')"
          @click="handleClearHistory"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" height="100%" space="preserve">
            <use xlink:href="#icon-delete" />
          </svg>
        </button>
      </header>
      <div :class="$style.chips">
        <span
          v-for="(item, idx) in historyList"
          :key="item + '_' + idx"
          :class="$style.chip"
          @click="handlePickKeyword(item)"
        >
          <span :class="$style.chipText">{{ item }}</span>
          <button
            :class="$style.chipClose"
            :title="$t('search__history_remove')"
            @click.stop="handleRemoveHistory(idx)"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" height="100%" space="preserve">
              <use xlink:href="#icon-close" />
            </svg>
          </button>
        </span>
      </div>
    </section>

    <!-- 猜你喜欢 -->
    <section
      v-if="!keyword && hotKeywords.length"
      :class="$style.section"
    >
      <header :class="$style.sectionHeader">
        <span :class="$style.sectionTitle">{{ $t('search__guess_title') }}</span>
      </header>
      <div :class="$style.chips">
        <span
          v-for="(item, idx) in hotKeywords.slice(0, 12)"
          :key="item + '_g_' + idx"
          :class="$style.chip"
          @click="handlePickKeyword(item)"
        >{{ item }}</span>
      </div>
    </section>

    <!-- 热搜榜 -->
    <section
      v-if="!keyword && hotKeywords.length"
      :class="[$style.section, $style.boardSection]"
    >
      <header :class="$style.boardHeader">
        <span :class="$style.boardTitle">{{ $t('search__hot_title') }}</span>
      </header>
      <ol :class="$style.rankedList">
        <li
          v-for="(item, idx) in hotKeywords.slice(0, 9)"
          :key="item + '_h_' + idx"
          :class="[$style.rankedItem, { [$style.rankedTop]: idx < 3, [$style.rankActive]: selectIndex === pickHotIdx(idx) }]"
          @click="handlePickKeyword(item)"
          @mouseenter="handleHover(pickHotIdx(idx))"
        >
          <span :class="$style.rank">{{ idx + 1 }}</span>
          <span :class="$style.rankedName">{{ item }}</span>
          <span v-if="idx === 0" :class="$style.badgeHot">{{ $t('search__hot_badge') }}</span>
          <span v-else-if="idx === 1 || idx === 2" :class="$style.badgeUp">↑</span>
        </li>
      </ol>
    </section>

    <!-- 排行榜卡片（飙升榜 / 第二榜） -->
    <template v-for="(board, bi) in boards" :key="board.bangid">
      <section
        v-if="!keyword && board.songs.length"
        :class="[$style.section, $style.boardSection]"
      >
        <header :class="$style.boardHeader">
          <button
            :class="$style.boardTitleBtn"
            @click="handleOpenLeaderboard(board)"
          >{{ board.name }}</button>
          <button
            :class="$style.playAllBtn"
            :title="$t('list__play')"
            @click="handlePlayBoard(board)"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve">
              <use xlink:href="#icon-play" />
            </svg>
            <span>{{ $t('list__play') }}</span>
          </button>
        </header>
        <ol :class="$style.rankedList">
          <li
            v-for="(song, si) in board.songs.slice(0, 9)"
            :key="board.bangid + '_' + song.songmid"
            :class="[$style.rankedItem, { [$style.rankedTop]: si < 3, [$style.rankActive]: selectIndex === pickBoardIdx(bi, si) }]"
            @click="handlePlaySong(board, song, si)"
            @mouseenter="handleHover(pickBoardIdx(bi, si))"
          >
            <span :class="$style.rank">{{ si + 1 }}</span>
            <span :class="$style.rankedName">{{ song.name }}</span>
            <span :class="$style.rankedSinger">- {{ song.singer }}</span>
          </li>
        </ol>
      </section>
    </template>

    <!-- 输入中：scope 模式（歌单内匹配） -->
    <section
      v-if="keyword && scopeListId"
      :class="$style.section"
    >
      <header :class="$style.scopeHeader">
        <span :class="$style.scopeBadge">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-album" />
          </svg>
          {{ $t('search__scope_badge') }}
        </span>
        <span :class="$style.scopeCount">{{ scopeFiltered.length }}</span>
      </header>
      <ul
        v-if="scopeFiltered.length"
        :class="$style.tipList"
      >
        <li
          v-for="(item, idx) in scopeFiltered"
          :key="item.id || (item.name + '_' + idx)"
          :class="[$style.tipItem, { [$style.tipItemActive]: selectIndex === idx }]"
          @click="handlePickSong(item, idx)"
          @mouseenter="handleHover(idx)"
        >
          <svg :class="$style.tipIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-audio-wave" />
          </svg>
          <span :class="$style.tipText">
            <span :class="$style.tipName"><template v-for="(seg, i) in highlightSegments(item.name)" :key="i"><mark v-if="seg.match" class="search_match_mark">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template></template></span>
            <span :class="$style.tipSub">- {{ item.singer || $t('unknown_singer') }}</span>
          </span>
          <span :class="$style.tipTime">{{ item.interval || '' }}</span>
        </li>
      </ul>
      <div
        v-else
        :class="$style.empty"
      >{{ $t('search__no_match_in_scope') }}</div>
    </section>

    <!-- 输入中：全局 tipSearch 联想 -->
    <section
      v-else-if="keyword && tipList.length"
      :class="$style.section"
    >
      <ul :class="$style.tipList">
        <li
          v-for="(item, idx) in tipList"
          :key="item"
          :class="[$style.tipItem, { [$style.tipItemActive]: selectIndex === idx }]"
          @click="handlePickKeyword(item)"
          @mouseenter="handleHover(idx)"
        >
          <svg :class="$style.tipIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve">
            <use xlink:href="#icon-search" />
          </svg>
          <span :class="$style.tipText"><template v-for="(seg, i) in highlightSegments(item)" :key="i"><mark v-if="seg.match" class="search_match_mark">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template></template></span>
          <span v-if="hotSet.has(item)" :class="$style.tipBadge">{{ $t('search__hot_badge') }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, shallowReactive } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { historyList } from '@renderer/store/search/state'
import {
  getHistoryList,
  removeHistoryWord,
  clearHistoryList,
} from '@renderer/store/search/action'
import { getList as getHotList } from '@renderer/store/hotSearch'
import { listDetailInfo as _listDetailInfo } from '@renderer/store/songList/state'
import { getListMusicsFromCache, setTempList } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player/action'
import { LIST_IDS } from '@common/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  keyword: { type: String, default: '' },
  source: { type: String, default: 'kw' },
  scopeListId: { type: String, default: '' },
  selectIndex: { type: Number, default: -1 },
  tipList: { type: Array, default: () => [] },
})

const emit = defineEmits(['pick', 'play-song', 'play-leaderboard', 'navigate-leaderboard', 'hover-index'])

// 注意：这里不受 search.isShowHistorySearch / search.isShowHotSearch 设置控制
// 那两个设置只作用于搜索页的空白视图；顶栏弹窗始终展示历史与热搜
const hotKeywords = ref([])
const hotSet = computed(() => new Set(hotKeywords.value))
const boards = shallowReactive([]) // [{ bangid, name, songs: [] }]

// scope 模式的全量列表缓存（用于过滤）
const scopeAllList = ref([])

// 各榜单卡片提供的可键盘选择区间（与 selectIndex 映射）
const hotIndexBase = 0
const boardIndexBase = computed(() => hotKeywords.value.length ? Math.min(hotKeywords.value.length, 9) : 0)
const eachBoardSize = 9
// 每个榜单的起始索引（榜单歌曲不足 9 首时按实际数量偏移）
const boardOffsets = computed(() => {
  const offsets = []
  let base = boardIndexBase.value
  for (const b of boards) {
    offsets.push(base)
    base += Math.min(b.songs.length, eachBoardSize)
  }
  return offsets
})
const boardItemIdx = (bi, si) => boardOffsets.value[bi] + si
const hotItemIdx = (i) => hotIndexBase + i

const scopeFiltered = computed(() => {
  if (!props.keyword) return []
  const kw = props.keyword.toLowerCase().trim()
  if (!kw) return []
  return scopeAllList.value.filter(m => {
    const name = (m.name || '').toLowerCase()
    const singer = (m.singer || '').toLowerCase()
    const album = (m.meta?.albumName || '').toLowerCase()
    return name.includes(kw) || singer.includes(kw) || album.includes(kw)
  })
})

// 当前 popup 中全部可选项目的最大索引（外部键盘导航用）
const maxSelectIndex = computed(() => {
  if (props.keyword) {
    return Math.max(0, (props.scopeListId ? scopeFiltered.value.length : props.tipList.length) - 1)
  }
  const offsets = boardOffsets.value
  if (!offsets.length) return boardIndexBase.value - 1
  const last = offsets.length - 1
  return offsets[last] + Math.min(boards[last].songs.length, eachBoardSize) - 1
})

// 让父组件可以读取最大索引与 scope 列表（用于键盘命中后回放）
defineExpose({ maxSelectIndex, hotKeywords, boards, scopeFiltered, scopeAllList })

// 暴露给模板用（@mouseenter 计算全局索引）
const pickBoardIdx = (bi, si) => boardItemIdx(bi, si)
const pickHotIdx = (i) => hotItemIdx(i)

// ---------------- 数据加载 ----------------
const leaderboardChoices = {
  kw: [['93', '飙升榜'], ['158', '抖音热歌榜']],
  wy: [['19723756', '飙升榜'], ['991319590', '说唱榜']],
  tx: [['62', '飙升榜'], ['60', '抖快榜']],
  kg: [['6666', '飙升榜'], ['8888', 'TOP500']],
  bd: [['2', '热歌榜'], ['20', '华语金曲榜']],
  mg: [],
}

const loadHotKeywords = async() => {
  const list = await getHotList(props.source)
  hotKeywords.value = list.slice(0, 20)
}

const loadBoards = async() => {
  boards.splice(0, boards.length)
  const choices = leaderboardChoices[props.source] || []
  if (!choices.length) return
  const sdk = music[props.source]
  if (!sdk?.leaderboard?.getList) return
  const results = []
  for (const [bangid, name] of choices) {
    try {
      const { list } = await sdk.leaderboard.getList(bangid, 1)
      results.push({ bangid, name, songs: (list || []).slice(0, 9) })
    } catch (_) { /* ignore single-board failure */ }
  }
  boards.push(...results)
}

const getCurrentScopeList = async() => {
  if (!props.scopeListId) {
    scopeAllList.value = []
    return
  }
  if (props.scopeListId.startsWith('detail:')) {
    scopeAllList.value = [...(_listDetailInfo.list || [])]
    return
  }
  scopeAllList.value = [...(getListMusicsFromCache(props.scopeListId) || [])]
}

const refreshScopeList = () => {
  if (props.visible && props.scopeListId) void getCurrentScopeList()
}

// ---------------- 监听 ----------------
watch(() => props.visible, async(v) => {
  if (!v) return
  await getHistoryList()
  if (!hotKeywords.value.length) void loadHotKeywords()
  if (!boards.length) void loadBoards()
  refreshScopeList()
}, { immediate: false })

watch(() => props.source, () => {
  hotKeywords.value = []
  boards.splice(0, boards.length)
  if (props.visible) {
    void loadHotKeywords()
    void loadBoards()
  }
})

watch(() => props.scopeListId, () => { refreshScopeList() })

// 监听 listDetailInfo.list 变化（详情页切换歌单时更新）
watch(() => _listDetailInfo.list, () => {
  if (props.scopeListId?.startsWith('detail:')) scopeAllList.value = [..._listDetailInfo.list]
})

// ---------------- 交互 ----------------
const handlePickKeyword = (kw) => { emit('pick', kw) }
const handlePickSong = (song, idx) => { emit('play-song', { song, list: scopeAllList.value, scopeListId: props.scopeListId, index: idx }) }
const handleRemoveHistory = (idx) => { removeHistoryWord(idx) }
const handleClearHistory = () => { clearHistoryList() }

// 鼠标悬停同步高亮索引（selectIndex 是 prop，须由父组件更新）
const handleHover = (idx) => { emit('hover-index', idx) }

const handlePlayBoard = (board) => { emit('play-leaderboard', { bangid: board.bangid, source: props.source, songs: board.songs }) }

const handleOpenLeaderboard = (board) => { emit('navigate-leaderboard', { bangid: board.bangid, source: props.source }) }

const handlePlaySong = (board, song, idx) => {
  // 直接播放该榜单中此歌曲
  void setTempList(`board__${board.bangid}`, [...board.songs]).then(() => {
    playList(LIST_IDS.TEMP, idx)
  })
}

// ---------------- 关键词高亮 ----------------
// 返回分段数组 [{ text, match }]，模板用 v-for + <mark> 渲染，避免 v-html
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const highlightSegments = (text) => {
  const kw = props.keyword.trim()
  if (!kw || !text) return [{ text, match: false }]
  const re = new RegExp(escapeRegExp(kw), 'gi')
  const segments = []
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) != null) {
    if (m.index > lastIndex) segments.push({ text: text.slice(lastIndex, m.index), match: false })
    segments.push({ text: m[0], match: true })
    lastIndex = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++ // 防御空匹配死循环
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), match: false })
  return segments.length ? segments : [{ text, match: false }]
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.popup {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: 480px;
  max-width: calc(100vw - 24px);
  max-height: min(70vh, 600px);
  overflow-y: auto;
  background-color: var(--color-000);
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .14), 0 2px 6px rgba(0, 0, 0, .06);
  border: 1px solid var(--color-100);
  z-index: 100;
  padding: 4px 0;
  animation: popupIn .12s ease-out;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: color-mix(in srgb, var(--color-500) 30%, transparent);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(in srgb, var(--color-500) 55%, transparent);
  }
}

@keyframes popupIn {
  from { opacity: 0; transform: translate(-50%, -4px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}

.section {
  padding: 12px 18px 8px;
  + .section {
    border-top: 1px solid var(--color-100);
  }
}

.sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.sectionTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-450);
  letter-spacing: .3px;
}

.iconBtn {
  border: 0;
  background: transparent;
  color: var(--color-450);
  cursor: pointer;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: @transition-fast;
  transition-property: background-color, color;
  svg { width: 14px; height: 14px; }
  &:hover {
    color: var(--color-primary);
    background-color: var(--color-100);
  }
}

.chips {
  display: flex;
  flex-flow: row wrap;
  gap: 8px 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: 13px;
  background-color: var(--color-050);
  color: var(--color-700);
  font-size: 12px;
  cursor: pointer;
  transition: @transition-fast;
  transition-property: background-color, color;
  user-select: none;
  max-width: 100%;
  &:hover {
    background-color: var(--color-primary-alpha-900);
    color: var(--color-primary);
  }
}
.chipText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.chipClose {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  opacity: .55;
  padding: 0;
  margin-left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: @transition-fast;
  svg { width: 9px; height: 9px; }
  &:hover {
    opacity: 1;
    background-color: var(--color-150);
  }
}

.boardSection {
  padding: 12px 18px 14px;
}

.boardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.boardTitle,
.boardTitleBtn {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-450);
  letter-spacing: .3px;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  transition: @transition-fast;
  transition-property: color;
  &:hover { color: var(--color-primary); }
}

.playAllBtn {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--color-500);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 13px;
  font-size: 12px;
  transition: @transition-fast;
  transition-property: background-color, color;
  svg { width: 12px; height: 12px; }
  &:hover {
    color: var(--color-primary);
    background-color: var(--color-primary-alpha-900);
  }
}

.rankedList {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  column-gap: 14px;
  row-gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.rankedItem {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 6px;
  transition: background-color .15s ease;
  min-width: 0;
  &:hover, &.rankActive {
    background-color: var(--color-050);
  }
}

.rank {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  font-size: 13px;
  font-weight: 600;
  font-feature-settings: 'tnum';
  color: var(--color-350);
  font-style: italic;
}

.rankedTop {
  .rank {
    color: var(--color-primary);
    font-weight: 700;
  }
}

.rankedName {
  font-size: 12.5px;
  color: var(--color-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
  min-width: 0;
}

.rankedSinger {
  font-size: 11.5px;
  color: var(--color-450);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60px;
  flex: none;
}

.badgeHot {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background-color: #ff4d4f;
  padding: 0 4px;
  border-radius: 3px;
  line-height: 14px;
  margin-left: 4px;
}

.badgeUp {
  flex: none;
  font-size: 11px;
  color: #ff4d4f;
  font-weight: 700;
  margin-left: 4px;
}

.tipList {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tipItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-800);
  transition: background-color .12s ease;
  &.tipItemActive, &:hover {
    background-color: var(--color-primary-alpha-900);
  }
}

.tipIcon {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--color-400);
  opacity: .7;
}

.tipText {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tipName {
  margin-right: 4px;
}

.tipSub {
  color: var(--color-450);
  font-size: 12px;
}

.tipTime {
  flex: none;
  font-size: 11.5px;
  color: var(--color-400);
  font-feature-settings: 'tnum';
}

.tipBadge {
  flex: none;
  font-size: 10px;
  color: #fff;
  background-color: #ff4d4f;
  padding: 0 4px;
  border-radius: 3px;
  line-height: 14px;
}

.scopeHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.scopeBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-primary);
  background-color: var(--color-primary-alpha-900);
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 500;
  svg { width: 12px; height: 12px; }
}

.scopeCount {
  font-size: 12px;
  color: var(--color-450);
  font-feature-settings: 'tnum';
}

.empty {
  padding: 18px 8px;
  text-align: center;
  font-size: 12.5px;
  color: var(--color-450);
}
</style>

<style>
/* 关键字高亮 mark：跨 css module 渲染，需全局可见 */
.search_match_mark {
  color: var(--color-primary);
  background-color: var(--color-primary-alpha-900);
  border-radius: 2px;
  padding: 0 1px;
}
</style>
