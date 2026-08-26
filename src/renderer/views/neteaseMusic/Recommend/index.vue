<template>
  <div :class="$style.container">
    <header :class="$style.header">
      <h1>{{ $t('netease_music') }}</h1>
      <base-tab v-model="activeTab" :class="$style.tabs" :list="tabs" />
      <base-btn v-if="configured" :class="$style.refreshBtn" outline min :disabled="loading" @click="loadActiveTab(true)">{{ $t('netease_music_refresh') }}</base-btn>
    </header>
    <main :class="$style.content">
      <div v-if="!statusChecked || loading" :class="$style.state"><p>{{ $t('netease_music_loading') }}</p></div>
      <div v-else-if="!configured" :class="$style.state"><p>{{ $t('netease_music_not_configured') }}</p><base-btn @click="openSettings">{{ $t('netease_music_configure') }}</base-btn></div>
      <div v-else-if="error" :class="$style.state"><p>{{ $t('netease_music_load_failed') }}</p><base-btn @click="loadActiveTab(true)">{{ $t('netease_music_retry') }}</base-btn></div>
      <div v-else-if="activeTab == 'home'" :class="[$style.home, 'scroll']">
        <ul :class="$style.homeList"><li v-for="item in homeItems" :key="item.id"><button type="button" :class="$style.homeItem" @click="activeTab = item.tab"><span :class="$style.cover"><img v-if="item.img" :src="item.img" loading="lazy" decoding="async"><svg-icon v-else name="music" /></span><span :class="$style.homeText"><strong>{{ item.name }}</strong><small>{{ item.desc }}</small></span><svg-icon :class="$style.arrow" name="angle-right-solid" /></button></li></ul>
      </div>
      <material-online-list v-else-if="activeTab == 'daily' || activeTab == 'personalFm' || activeTab == 'newSongs'" :page="1" :limit="Math.max(activeSongs.length, 1)" :total="activeSongs.length" :list="activeSongs" :no-item="activeSongs.length ? '' : $t('no_item')" @play-list="playActiveSongs" />
      <song-list v-else-if="activeTab == 'playlists'" :list-info="playlistListInfo" />
      <song-list v-else :list-info="accountPlaylistListInfo" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { useI18n } from '@root/lang'
import { formatPlayCount, toNewMusicInfo } from '@renderer/utils'
import { getNeteaseMusicAccountPlaylists, getNeteaseMusicDailyRecommend, getNeteaseMusicNewSongs, getNeteaseMusicPersonalFM, getNeteaseMusicRecommendPlaylists, getNeteaseMusicStatus } from '@renderer/utils/ipc'
import { playSongListDetail } from '@renderer/views/songList/Detail/action'
import type { ListInfo } from '@renderer/store/songList/state'
import SongList from '@renderer/views/songList/List/components/SongList.vue'

type RecommendTab = 'home' | 'myPlaylists' | 'daily' | 'personalFm' | 'playlists' | 'newSongs'
interface HomeItem { id: string, name: string, desc: string, img: string, tab: RecommendTab }
const router = useRouter()
const t = useI18n()
const activeTab = ref<RecommendTab>('home')
const statusChecked = ref(false)
const configured = ref(false)
const loading = ref(false)
const error = ref('')
const daily = ref<LX.NeteaseMusic.SongRecommend | null>(null)
const personalFm = ref<LX.NeteaseMusic.SongRecommend | null>(null)
const playlists = ref<LX.NeteaseMusic.PlaylistItem[]>([])
const accountPlaylists = ref<LX.NeteaseMusic.AccountPlaylistItem[]>([])
const newSongs = ref<LX.Music.MusicInfoOnline[]>([])
const loadedTabs = new Set<RecommendTab>()
let loadedDay = ''
let dailyRefreshTimer: ReturnType<typeof setInterval> | null = null
let requestId = 0
const getDayKey = () => { const now = new Date(); return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}` }
const refreshIfStale = () => { if (!configured.value || !loadedDay || loadedDay == getDayKey()) return; loadedTabs.clear(); void loadActiveTab(true) }
const tabs = computed(() => [
  { id: 'home', label: t('netease_music_home') }, { id: 'myPlaylists', label: t('netease_music_my_playlists') }, { id: 'daily', label: t('netease_music_daily') },
  { id: 'personalFm', label: t('netease_music_fm') }, { id: 'playlists', label: t('netease_music_playlist') },
  { id: 'newSongs', label: t('netease_music_new_song') },
])
const homeItems = computed<HomeItem[]>(() => [
  { id: 'myPlaylists', name: t('netease_music_my_playlists'), desc: t('netease_music_home_my_playlists_desc'), img: accountPlaylists.value[0]?.img ?? '', tab: 'myPlaylists' },
  { id: 'daily', name: daily.value?.info.name ?? t('netease_music_daily'), desc: t('netease_music_home_daily_desc'), img: daily.value?.info.img ?? '', tab: 'daily' },
  { id: 'fm', name: personalFm.value?.info.name ?? t('netease_music_fm'), desc: t('netease_music_home_fm_desc'), img: personalFm.value?.info.img ?? '', tab: 'personalFm' },
  { id: 'playlists', name: t('netease_music_home_playlist_name'), desc: t('netease_music_home_playlist_desc'), img: playlists.value[0]?.img ?? '', tab: 'playlists' },
  { id: 'newSongs', name: t('netease_music_home_new_name'), desc: t('netease_music_home_new_desc'), img: newSongs.value[0]?.meta.picUrl ?? '', tab: 'newSongs' },
])
const activeSongs = computed(() => activeTab.value == 'daily' ? daily.value?.list.map(song => toNewMusicInfo(song)).filter(song => song.source != 'local') ?? [] : activeTab.value == 'personalFm' ? personalFm.value?.list.map(song => toNewMusicInfo(song)).filter(song => song.source != 'local') ?? [] : newSongs.value)
const playlistListInfo = computed<ListInfo>(() => ({
  list: playlists.value.map(item => ({ play_count: formatPlayCount(item.playCount), id: item.id, author: item.author, name: item.name, img: item.img, desc: item.desc, source: 'wy' })),
  total: playlists.value.length,
  page: 1,
  limit: Math.max(playlists.value.length, 1),
  key: 'netease_music_recommend_playlists',
  noItemLabel: playlists.value.length ? '' : t('no_item'),
  source: 'wy',
  tagId: '',
  sortId: '',
}))
const accountPlaylistListInfo = computed<ListInfo>(() => ({
  list: accountPlaylists.value.map(item => ({
    play_count: item.playCount ? formatPlayCount(item.playCount) : '',
    id: `neteaseaccount_${item.id}`,
    author: `${t(item.subscribed ? 'netease_music_playlist_collected' : 'netease_music_playlist_created')}${item.author ? ` · ${item.author}` : ''}`,
    name: item.name,
    img: item.img,
    desc: item.desc,
    source: 'wy',
    total: String(item.trackCount),
  })),
  total: accountPlaylists.value.length,
  page: 1,
  limit: Math.max(accountPlaylists.value.length, 1),
  key: 'netease_music_account_playlists',
  noItemLabel: accountPlaylists.value.length ? '' : t('no_item'),
  source: 'wy',
  tagId: '',
  sortId: '',
}))

const markLoaded = (tab: RecommendTab, dayKey: string) => { loadedTabs.add(tab); loadedDay = dayKey }
const setNewSongs = (result: LX.NeteaseMusic.SongRecommend) => { newSongs.value = result.list.map(song => toNewMusicInfo(song)).filter(song => song.source != 'local') }
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
      const [dailyResult, fmResult, playlistResult, accountPlaylistResult, newSongResult] = await Promise.all([getNeteaseMusicDailyRecommend(), getNeteaseMusicPersonalFM(), getNeteaseMusicRecommendPlaylists(), getNeteaseMusicAccountPlaylists(), getNeteaseMusicNewSongs()])
      if (requestId != currentRequestId) return
      daily.value = dailyResult; personalFm.value = fmResult; playlists.value = playlistResult.list; accountPlaylists.value = accountPlaylistResult.list; setNewSongs(newSongResult)
      for (const item of ['myPlaylists', 'daily', 'personalFm', 'playlists', 'newSongs'] as RecommendTab[]) loadedTabs.add(item)
    } else if (tab == 'myPlaylists') {
      accountPlaylists.value = (await getNeteaseMusicAccountPlaylists()).list
    } else if (tab == 'daily') daily.value = await getNeteaseMusicDailyRecommend()
    else if (tab == 'personalFm') personalFm.value = await getNeteaseMusicPersonalFM()
    else if (tab == 'playlists') playlists.value = (await getNeteaseMusicRecommendPlaylists()).list
    else setNewSongs(await getNeteaseMusicNewSongs())
    if (requestId == currentRequestId) markLoaded(tab, dayKey)
  } catch (err) { if (requestId == currentRequestId) error.value = err instanceof Error ? err.message : String(err) } finally { if (requestId == currentRequestId) loading.value = false }
}
const playActiveSongs = (index: number) => {
  void playSongListDetail(`netease_recommend_${activeTab.value}`, 'wy', activeSongs.value, index)
}
const openSettings = () => { void router.push({ path: '/setting', query: { name: 'SettingNeteaseMusic' } }) }
watch(activeTab, () => { void loadActiveTab() })
onMounted(async() => { try { configured.value = (await getNeteaseMusicStatus()).configured } finally { statusChecked.value = true }; if (configured.value) await loadActiveTab(); dailyRefreshTimer = setInterval(refreshIfStale, 60 * 1000); window.addEventListener('focus', refreshIfStale); document.addEventListener('visibilitychange', refreshIfStale) })
onBeforeUnmount(() => { if (dailyRefreshTimer) clearInterval(dailyRefreshTimer); dailyRefreshTimer = null; window.removeEventListener('focus', refreshIfStale); document.removeEventListener('visibilitychange', refreshIfStale) })
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.container { height: 100%; display: flex; flex-flow: column nowrap; min-width: 0; }
.header { flex: none; min-height: 44px; display: flex; align-items: center; border-bottom: var(--color-list-header-border-bottom); h1 { flex: none; padding-left: 15px; font-size: 16px; font-weight: 600; color: var(--color-font); } }
.tabs { flex: auto; min-width: 0; justify-content: center; }
.refreshBtn { flex: none; margin-right: 10px; color: var(--color-font); background: none !important; }
.content { min-height: 0; flex: auto; position: relative; overflow: hidden; }
.state { position: absolute; inset: 0; display: flex; flex-flow: column nowrap; align-items: center; justify-content: center; gap: 16px; color: var(--color-font-label); p { font-size: 16px; } }
.home { position: absolute; inset: 0; overflow-y: auto; padding: 4px 18px 20px; box-sizing: border-box; }
.homeList { max-width: 900px; margin: 0 auto; li { border-bottom: var(--color-list-header-border-bottom); } }
.homeItem { width: 100%; height: 116px; padding: 12px 8px; display: flex; align-items: center; gap: 16px; color: var(--color-font); background: transparent; border: 0; text-align: left; cursor: pointer; transition: background-color @transition-fast, opacity @transition-fast; &:hover { background-color: var(--color-button-background-hover); } &:active { opacity: .7; } }
.cover { flex: none; width: 92px; height: 92px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 6px; background-color: var(--color-button-background); box-shadow: 0 0 2px rgba(0, 0, 0, .18); img { width: 100%; height: 100%; object-fit: cover; } svg { width: 30%; height: 30%; color: var(--color-font-label); } }
.homeText { min-width: 0; flex: auto; display: flex; flex-flow: column nowrap; strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; font-size: 17px; } small { margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-font-label); font-size: 12px; } }
.arrow { flex: none; width: 10px; color: var(--color-font-label); }
@media (max-width: 760px) { .header h1 { display: none; } .tabs { justify-content: flex-start; } }
</style>
