<template>
  <div :class="$style.container">
    <header :class="$style.header">
      <h1>{{ $t('qq_music') }}</h1>
      <base-tab v-model="activeTab" :class="$style.tabs" :list="tabs" />
      <base-btn v-if="configured" :class="$style.refreshBtn" outline min :disabled="loading" @click="loadActiveTab(true)">
        {{ $t('qq_music_refresh') }}
      </base-btn>
    </header>

    <main :class="$style.content">
      <div v-if="!statusChecked || loading" :class="$style.state">
        <p>{{ $t('qq_music_loading') }}</p>
      </div>

      <div v-else-if="!configured" :class="$style.state">
        <p>{{ $t('qq_music_not_configured') }}</p>
        <base-btn @click="openSettings">{{ $t('qq_music_configure') }}</base-btn>
      </div>

      <div v-else-if="error" :class="$style.state">
        <p>{{ $t('qq_music_load_failed') }}</p>
        <base-btn @click="loadActiveTab(true)">{{ $t('qq_music_retry') }}</base-btn>
      </div>

      <div v-else-if="activeTab == 'home'" :class="[$style.home, 'scroll']">
        <ul :class="$style.homeList">
          <li v-for="item in homeItems" :key="item.id">
            <button type="button" :class="$style.homeItem" @click="openHomeItem(item)">
              <span :class="$style.cover">
                <img v-if="item.img" :src="item.img" loading="lazy" decoding="async">
                <svg-icon v-else name="music" />
              </span>
              <span :class="$style.homeText">
                <strong>{{ item.name }}</strong>
                <small>{{ item.desc }}</small>
              </span>
              <svg-icon :class="$style.arrow" name="angle-right-solid" />
            </button>
          </li>
        </ul>
      </div>

      <div v-else-if="activeTab == 'radar'" :class="[$style.radar, 'scroll']">
        <section v-for="group in radarGroups" :key="group.id" :class="$style.radarSection">
          <h2>{{ group.name }}</h2>
          <ul :class="$style.radarGrid">
            <li v-for="radio in group.list" :key="radio.id">
              <button type="button" :class="$style.radarItem" @click="openDetail(`qqradio_${radio.id}`, radio.img)">
                <span :class="$style.radarCover">
                  <img v-if="radio.img" :src="radio.img" loading="lazy" decoding="async">
                  <svg-icon v-else name="music" />
                </span>
                <span :class="$style.radarText">
                  <strong>{{ radio.name }}</strong>
                  <small v-if="radio.listenCount"><svg-icon name="headphones" />{{ formatPlayCount(radio.listenCount) }}</small>
                  <small v-else>{{ $t('qq_music_radar') }}</small>
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>

      <song-list v-else-if="activeTab == 'playlists'" :list-info="playlistListInfo" />

      <material-online-list
        v-else
        ref="newSongListRef"
        :page="1"
        :limit="Math.max(newSongs.length, 1)"
        :total="newSongs.length"
        :list="newSongs"
        :no-item="newSongs.length ? '' : $t('no_item')"
        @play-list="playNewSongs"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { useI18n } from '@root/lang'
import { formatPlayCount, toNewMusicInfo } from '@renderer/utils'
import {
  getQQMusicDailyRecommend,
  getQQMusicNewSongs,
  getQQMusicRadarList,
  getQQMusicRecommendPlaylists,
  getQQMusicStatus,
} from '@renderer/utils/ipc'
import { playSongListDetail } from '@renderer/views/songList/Detail/action'
import type { ListInfo } from '@renderer/store/songList/state'
import SongList from '@renderer/views/songList/List/components/SongList.vue'

type RecommendTab = 'home' | 'radar' | 'playlists' | 'newSongs'

interface HomeItem {
  id: string
  name: string
  desc: string
  img: string
  detailId?: string
  tab?: RecommendTab
}

const router = useRouter()
const t = useI18n()
const activeTab = ref<RecommendTab>('home')
const statusChecked = ref(false)
const configured = ref(false)
const loading = ref(false)
const error = ref('')
const daily = ref<LX.QQMusic.DailyRecommend | null>(null)
const radarGroups = ref<LX.QQMusic.RadioGroup[]>([])
const playlists = ref<LX.QQMusic.PlaylistItem[]>([])
const newSongs = ref<LX.Music.MusicInfoOnline[]>([])
const loadedTabs = new Set<RecommendTab>()
let loadedDay = ''
let dailyRefreshTimer: ReturnType<typeof setInterval> | null = null
let requestId = 0

const getDayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}
const refreshIfStale = () => {
  if (!configured.value || !loadedDay || loadedDay == getDayKey()) return
  loadedTabs.clear()
  void loadActiveTab(true)
}

const tabs = computed(() => [
  { id: 'home', label: t('qq_music_home') },
  { id: 'radar', label: t('qq_music_radar') },
  { id: 'playlists', label: t('qq_music_playlist') },
  { id: 'newSongs', label: t('qq_music_new_song') },
])

const firstRadio = computed(() => radarGroups.value.flatMap(group => group.list).find(item => item.id == 99) ?? radarGroups.value[0]?.list[0])

const homeItems = computed<HomeItem[]>(() => [
  {
    id: 'radar',
    name: firstRadio.value?.name ?? t('qq_music_radar'),
    desc: t('qq_music_home_radar_desc'),
    img: firstRadio.value?.img ?? '',
    detailId: firstRadio.value ? `qqradio_${firstRadio.value.id}` : undefined,
    tab: 'radar',
  },
  {
    id: 'daily',
    name: daily.value?.info.name ?? t('qq_music_daily_recommend'),
    desc: t('qq_music_home_daily_desc'),
    img: daily.value?.info.img ?? '',
    detailId: 'daily30',
  },
  {
    id: 'playlists',
    name: t('qq_music_home_playlist_name'),
    desc: t('qq_music_home_playlist_desc'),
    img: playlists.value[0]?.img ?? '',
    tab: 'playlists',
  },
  {
    id: 'newSongs',
    name: t('qq_music_home_new_name'),
    desc: t('qq_music_home_new_desc'),
    img: newSongs.value[0]?.meta.picUrl ?? '',
    tab: 'newSongs',
  },
])

const playlistListInfo = computed<ListInfo>(() => ({
  list: playlists.value.map(item => ({
    play_count: formatPlayCount(item.playCount),
    id: item.id,
    author: item.author,
    name: item.name,
    img: item.img,
    desc: item.desc,
    source: 'tx',
  })),
  total: playlists.value.length,
  page: 1,
  limit: Math.max(playlists.value.length, 1),
  key: 'qq_music_recommend_playlists',
  noItemLabel: playlists.value.length ? '' : t('no_item'),
  source: 'tx',
  tagId: '',
  sortId: '',
}))

const setNewSongs = (result: LX.QQMusic.NewSongRecommend) => {
  newSongs.value = result.list
    .map(song => toNewMusicInfo(song))
    .filter((song): song is LX.Music.MusicInfoOnline => song.source != 'local')
}

const markTabLoaded = (tab: RecommendTab, dayKey: string) => {
  loadedTabs.add(tab)
  loadedDay = dayKey
}

const loadActiveTab = async(force = false) => {
  if (!configured.value) return
  const tab = activeTab.value
  const dayKey = getDayKey()
  if (loadedDay != dayKey) loadedTabs.clear()
  if (!force && loadedTabs.has(tab) && loadedDay == dayKey) return
  const currentRequestId = ++requestId
  loading.value = true
  error.value = ''
  try {
    if (tab == 'home') {
      const [dailyResult, radarResult, playlistResult, newSongResult] = await Promise.all([
        getQQMusicDailyRecommend(),
        getQQMusicRadarList(),
        getQQMusicRecommendPlaylists(),
        getQQMusicNewSongs(),
      ])
      if (requestId != currentRequestId) return
      daily.value = dailyResult
      radarGroups.value = radarResult.groups
      playlists.value = playlistResult.list
      setNewSongs(newSongResult)
      loadedTabs.add('radar')
      loadedTabs.add('playlists')
      loadedTabs.add('newSongs')
    } else if (tab == 'radar') {
      const result = await getQQMusicRadarList()
      if (requestId != currentRequestId) return
      radarGroups.value = result.groups
    } else if (tab == 'playlists') {
      const result = await getQQMusicRecommendPlaylists()
      if (requestId != currentRequestId) return
      playlists.value = result.list
    } else {
      const result = await getQQMusicNewSongs()
      if (requestId != currentRequestId) return
      setNewSongs(result)
    }
    markTabLoaded(tab, dayKey)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (requestId == currentRequestId) loading.value = false
  }
}

const openDetail = (id: string, picUrl = '') => {
  void router.push({
    path: '/songList/detail',
    query: {
      source: 'tx',
      id,
      picUrl,
      fromName: 'QQMusicRecommend',
    },
  })
}

const openHomeItem = (item: HomeItem) => {
  if (item.detailId) {
    openDetail(item.detailId, item.img)
  } else if (item.tab) {
    activeTab.value = item.tab
  }
}

const playNewSongs = (index: number) => {
  void playSongListDetail('qqnew_5', 'tx', newSongs.value, index)
}

const openSettings = () => {
  void router.push({
    path: '/setting',
    query: { name: 'SettingQQMusic' },
  })
}

watch(activeTab, () => {
  void loadActiveTab()
})

onMounted(async() => {
  try {
    configured.value = (await getQQMusicStatus()).configured
  } finally {
    statusChecked.value = true
  }
  if (configured.value) await loadActiveTab()
  dailyRefreshTimer = setInterval(refreshIfStale, 60 * 1000)
  window.addEventListener('focus', refreshIfStale)
  document.addEventListener('visibilitychange', refreshIfStale)
})

onBeforeUnmount(() => {
  if (dailyRefreshTimer) clearInterval(dailyRefreshTimer)
  dailyRefreshTimer = null
  window.removeEventListener('focus', refreshIfStale)
  document.removeEventListener('visibilitychange', refreshIfStale)
})
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  min-width: 0;
}

.header {
  flex: none;
  min-height: 44px;
  display: flex;
  align-items: center;
  border-bottom: var(--color-list-header-border-bottom);

  h1 {
    flex: none;
    padding-left: 15px;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-font);
  }
}

.tabs {
  flex: auto;
  min-width: 0;
  justify-content: center;
}

.refreshBtn {
  flex: none;
  margin-right: 10px;
  color: var(--color-font);
  background: none !important;
}

.content {
  min-height: 0;
  flex: auto;
  position: relative;
  overflow: hidden;
}

.state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--color-font-label);

  p {
    font-size: 16px;
  }
}

.home,
.radar {
  position: absolute;
  inset: 0;
  overflow-y: auto;
}

.home {
  padding: 4px 18px 20px;
  box-sizing: border-box;
}

.homeList {
  max-width: 900px;
  margin: 0 auto;

  li {
    border-bottom: var(--color-list-header-border-bottom);
  }
}

.homeItem {
  width: 100%;
  height: 116px;
  padding: 12px 8px;
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--color-font);
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  transition: background-color @transition-fast, opacity @transition-fast;

  &:hover {
    background-color: var(--color-button-background-hover);
  }

  &:active {
    opacity: .7;
  }
}

.cover,
.radarCover {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 6px;
  background-color: var(--color-button-background);
  box-shadow: 0 0 2px rgba(0, 0, 0, .18);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 30%;
    height: 30%;
    color: var(--color-font-label);
  }
}

.cover {
  width: 92px;
  height: 92px;
}

.homeText,
.radarText {
  min-width: 0;
  flex: auto;
  display: flex;
  flex-flow: column nowrap;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  small {
    margin-top: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-font-label);
    font-size: 12px;
  }
}

.homeText strong {
  font-size: 17px;
}

.arrow {
  flex: none;
  width: 10px;
  color: var(--color-font-label);
}

.radar {
  padding: 8px 18px 24px;
  box-sizing: border-box;
}

.radarSection {
  max-width: 1100px;
  margin: 0 auto 24px;

  h2 {
    padding: 8px 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-font);
  }
}

.radarGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px 18px;
}

.radarItem {
  width: 100%;
  min-width: 0;
  height: 72px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  color: var(--color-font);
  background: transparent;
  border: 0;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  transition: background-color @transition-fast, opacity @transition-fast;

  &:hover {
    background-color: var(--color-button-background-hover);
  }

  &:active {
    opacity: .7;
  }
}

.radarCover {
  width: 60px;
  height: 60px;
}

.radarText {
  strong {
    font-size: 14px;
  }

  small svg {
    margin-right: 3px;
  }
}

@media (max-width: 760px) {
  .header h1 {
    display: none;
  }

  .tabs {
    justify-content: flex-start;
  }

  .radarGrid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}
</style>
