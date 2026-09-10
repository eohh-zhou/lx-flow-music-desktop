<template>
  <div :class="$style.btnContent">
    <button
      ref="dom_btn" :class="$style.btn" :aria-label="$t('player__play_queue')" :title="$t('player__play_queue')"
      @click.stop="toggleVisible"
    >
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="80%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-list-temp" />
      </svg>
    </button>
    <base-popup v-model:visible="visible" :btn-el="dom_btn">
      <div :class="$style.panel" @click.stop>
        <div :class="$style.header">
          <span :class="$style.title">{{ $t('player__play_queue') }}</span>
          <span v-if="queueCount" :class="$style.count">{{ queueCount }}</span>
          <button :class="$style.clearBtn" :disabled="!laterList.length" @click="handleClear">{{ $t('player__play_queue_clear') }}</button>
        </div>
        <div v-if="!currentMusic && !laterList.length" :class="$style.empty">{{ $t('player__play_queue_empty') }}</div>
        <div v-else :class="$style.listContent">
          <section v-if="currentMusic" :class="$style.section">
            <div :class="$style.sectionHeader">
              <span>{{ $t('player__play_queue_current') }}</span>
            </div>
            <div :class="[$style.row, $style.currentRow]" :title="`${currentMusic?.name ?? ''} - ${currentMusic?.singer ?? ''}`">
              <span :class="$style.num">▶</span>
              <span :class="$style.name">{{ currentMusic?.name }}</span>
              <span :class="$style.singer">{{ currentMusic?.singer }}</span>
              <span :class="$style.interval">{{ currentMusic?.interval || '--/--' }}</span>
            </div>
          </section>

          <section :class="$style.section">
            <div :class="$style.sectionHeader">
              <span>{{ $t('player__play_queue_later') }}</span>
              <span v-if="laterList.length" :class="$style.sectionCount">{{ laterList.length }}</span>
            </div>
            <div v-if="!laterList.length" :class="$style.noLater">{{ $t('player__play_queue_empty') }}</div>
            <button
              v-for="(item, index) in laterList" :key="item.key"
              :class="$style.row"
              :title="`${item.musicInfo.name} - ${item.musicInfo.singer}`"
              @click="handlePlayLater(item)"
            >
              <span :class="$style.num">{{ index + 1 }}</span>
              <span :class="$style.name">{{ item.musicInfo.name }}</span>
              <span :class="$style.singer">{{ item.musicInfo.singer }}</span>
              <span :class="$style.interval">{{ item.musicInfo.interval || '--/--' }}</span>
            </button>
          </section>
        </div>
      </div>
    </base-popup>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from '@common/utils/vueTools'
import { clearTempPlayeList, getList, setPlayQueueStopped } from '@renderer/store/player/action'
import { playList, playNext } from '@renderer/core/player'
import { isPlayQueueStopped, playInfo, playMusicInfo, tempPlayList } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'

const visible = ref(false)
const dom_btn = ref<HTMLElement | null>(null)
const playlistSnapshot = shallowRef<Array<LX.Music.MusicInfo | LX.Download.ListItem>>([])

const getDisplayMusicInfo = (musicInfo: LX.Music.MusicInfo | LX.Download.ListItem): LX.Music.MusicInfo => {
  return 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
}

const refreshPlaylistSnapshot = () => {
  const listId = playInfo.playerListId
  playlistSnapshot.value = listId ? getList(listId).slice() : []
}

watch(() => [playInfo.playerListId, playMusicInfo.musicInfo?.id, playInfo.playerPlayIndex], refreshPlaylistSnapshot, {
  immediate: true,
})

const handleListChange = (ids: string[]) => {
  const listId = playInfo.playerListId
  if (listId && ids.includes(listId)) refreshPlaylistSnapshot()
}

window.app_event.on('myListUpdate', handleListChange)
onBeforeUnmount(() => {
  window.app_event.off('myListUpdate', handleListChange)
})

const currentMusic = computed(() => {
  if (!playMusicInfo.musicInfo) return null
  return getDisplayMusicInfo(playMusicInfo.musicInfo)
})

interface QueueItem {
  key: string
  musicInfo: LX.Music.MusicInfo
  type: 'temp' | 'playlist'
  tempIndex?: number
  listId?: string | null
  listIndex?: number
}

const getPlaylistQueue = (): QueueItem[] => {
  const listId = playInfo.playerListId
  const current = playMusicInfo.musicInfo
  if (!listId || !current) return []

  const list = playlistSnapshot.value
  if (!list.length) return []

  // While a manual "play later" song is active, playerPlayIndex still points to
  // the original playlist position that playback will resume from afterwards.
  let currentIndex = playInfo.playerPlayIndex
  if (!playMusicInfo.isTempPlay && list[currentIndex]?.id != current.id) {
    currentIndex = list.findIndex(item => item.id == current.id)
  }
  if (currentIndex < 0) return []

  const indexes: number[] = []
  switch (appSetting['player.togglePlayMethod']) {
    case 'list':
    case 'none':
      for (let index = currentIndex + 1; index < list.length; index++) indexes.push(index)
      break
    case 'listLoop':
      for (let offset = 1; offset < list.length; offset++) indexes.push((currentIndex + offset) % list.length)
      break
    case 'random':
      for (let index = 0; index < list.length; index++) {
        if (index != currentIndex) indexes.push(index)
      }
      break
  }

  return indexes.map(index => ({
    key: `playlist:${listId}:${index}`,
    musicInfo: getDisplayMusicInfo(list[index]),
    type: 'playlist',
    listId,
    listIndex: index,
  }))
}

const laterList = computed<QueueItem[]>(() => [
  ...tempPlayList.map((item, index) => ({
    key: `temp:${item.musicInfo.id}:${index}`,
    musicInfo: getDisplayMusicInfo(item.musicInfo),
    type: 'temp' as const,
    tempIndex: index,
  })),
  ...(isPlayQueueStopped.value ? [] : getPlaylistQueue()),
])

const queueCount = computed(() => laterList.value.length + (currentMusic.value ? 1 : 0))

const toggleVisible = async() => {
  if (visible.value) {
    visible.value = false
    return
  }
  await nextTick()
  visible.value = true
}

const handlePlayLater = (item: QueueItem) => {
  if (item.type == 'temp') {
    const index = item.tempIndex
    if (index == null || index < 0 || index >= tempPlayList.length) return
    if (index) tempPlayList.splice(0, index)
    void playNext()
    return
  }

  if (item.listId && item.listIndex != null) playList(item.listId, item.listIndex)
}

const handleClear = () => {
  if (!laterList.value.length) return
  clearTempPlayeList()
  setPlayQueueStopped(true)
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.btnContent {
  flex: none;
  height: 100%;
  display: flex;
  align-items: center;
}

.btn {
  flex: none;
  height: 30px;
  width: 30px;
  border-radius: @radius-round;
  transition: @transition-fast;
  transition-property: color, opacity, background-color;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  border: none;
  padding: 0;

  opacity: .85;
  cursor: pointer;

  svg {
    filter: none;
  }
  &:hover {
    opacity: 1;
    color: var(--color-900) !important;
    background-color: var(--color-100);
  }
  &:active {
    opacity: 1;
    transform: scale(.94);
  }
}

.panel {
  width: 400px;
  max-width: 90vw;
  display: flex;
  flex-flow: column nowrap;
  padding: 0;
}

.header {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--color-100);
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-font);
}

.count {
  font-size: 11px;
  color: var(--color-font-label);
  background-color: var(--color-100);
  border-radius: 8px;
  padding: 0 7px;
  line-height: 16px;
}

.clearBtn {
  margin-left: auto;
  border: none;
  background-color: transparent;
  font-size: 12px;
  color: var(--color-font-label);
  cursor: pointer;
  border-radius: @radius-round;
  padding: 2px 8px;
  transition: @transition-fast;
  transition-property: color, background-color;

  &:hover {
    color: var(--color-900);
    background-color: var(--color-100);
  }
  &:disabled {
    opacity: .4;
    cursor: default;
    background-color: transparent;
  }
}

.empty {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--color-font-label);
}

.listContent {
  height: min(400px, 46vh);
  overflow-y: auto;
  padding: 4px 0 8px;
}

.section {
  &:not(:first-child) {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--color-100);
  }
}

.sectionHeader {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  color: var(--color-font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: uppercase;
}

.sectionCount {
  color: var(--color-450);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.row {
  width: 100%;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
  border: none;
  background-color: transparent;
  padding: 0 12px;
  height: 34px;
  font-size: 12.5px;
  color: var(--color-font);
  cursor: pointer;
  text-align: left;

  &:hover {
    background-color: var(--color-100);
  }
}

.currentRow {
  cursor: default;
  color: var(--color-primary);
  background-color: var(--color-50);

  .name, .singer, .num {
    color: var(--color-primary);
    font-weight: 600;
  }
}

.noLater {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 48px;
  color: var(--color-font-label);
  font-size: 12px;
}

.num {
  flex: none;
  width: 26px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-350);
  text-align: right;
}

.name {
  flex: 1 1 auto;
  min-width: 0;
  .mixin-ellipsis-1();
}

.singer {
  flex: 0 1 30%;
  min-width: 0;
  font-size: 11.5px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}

.interval {
  flex: none;
  width: 42px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-450);
  text-align: right;
}

</style>
