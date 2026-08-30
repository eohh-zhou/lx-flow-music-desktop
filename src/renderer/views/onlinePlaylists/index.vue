<template>
  <div :class="$style.container">
    <header :class="$style.header">
      <h1>{{ title }}</h1>
      <base-btn v-if="configured" :class="$style.refreshBtn" outline min :disabled="loading" @click="load()">{{ $t(`${prefix}_refresh`) }}</base-btn>
    </header>
    <main :class="$style.content">
      <div v-if="!statusChecked || loading" :class="$style.state"><p>{{ $t(`${prefix}_loading`) }}</p></div>
      <div v-else-if="!configured" :class="$style.state"><p>{{ $t(`${prefix}_not_configured`) }}</p><base-btn @click="openSettings">{{ $t(`${prefix}_configure`) }}</base-btn></div>
      <div v-else-if="error" :class="$style.state"><p>{{ $t(`${prefix}_load_failed`) }}</p><base-btn @click="load()">{{ $t(`${prefix}_retry`) }}</base-btn></div>
      <song-list v-else :list-info="listInfo" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { useI18n } from '@root/lang'
import { formatPlayCount } from '@renderer/utils'
import {
  getQQMusicAccountPlaylists,
  getQQMusicStatus,
  getNeteaseMusicAccountPlaylists,
  getNeteaseMusicStatus,
} from '@renderer/utils/ipc'
import type { ListInfo } from '@renderer/store/songList/state'
import SongList from '@renderer/views/songList/List/components/SongList.vue'

type Source = 'tx' | 'wy'
interface AccountPlaylist {
  id: string
  name: string
  img: string
  desc: string
  author: string
  playCount: number
  trackCount: number
  subscribed: boolean
}

const route = useRoute()
const router = useRouter()
const t = useI18n()
const statusChecked = ref(false)
const configured = ref(false)
const loading = ref(false)
const error = ref('')
const playlists = ref<AccountPlaylist[]>([])
let requestId = 0

const source = computed<Source>(() => (route.meta.source as Source) ?? 'tx')
const prefix = computed(() => source.value == 'tx' ? 'qq_music' : 'netease_music')
const title = computed(() => t(source.value == 'tx' ? 'online_playlists_qq' : 'online_playlists_netease'))

const listInfo = computed<ListInfo>(() => ({
  list: playlists.value.map(item => ({
    play_count: item.playCount ? formatPlayCount(item.playCount) : '',
    id: source.value == 'tx' ? `qqaccount_${item.id}` : `neteaseaccount_${item.id}`,
    author: `${t(item.subscribed ? `${prefix.value}_playlist_collected` : `${prefix.value}_playlist_created`)}${item.author ? ` · ${item.author}` : ''}`,
    name: item.name,
    img: item.img,
    desc: item.desc,
    source: source.value,
    total: String(item.trackCount),
  })),
  total: playlists.value.length,
  page: 1,
  limit: Math.max(playlists.value.length, 1),
  key: source.value == 'tx' ? 'qq_music_account_playlists' : 'netease_music_account_playlists',
  noItemLabel: playlists.value.length ? '' : t('no_item'),
  source: source.value,
  tagId: '',
  sortId: '',
}))

const load = async() => {
  const currentRequestId = ++requestId
  const src = source.value
  loading.value = true
  error.value = ''
  try {
    let list: AccountPlaylist[]
    if (src == 'tx') {
      const status = await getQQMusicStatus()
      if (requestId != currentRequestId) return
      configured.value = status.configured
      if (!status.configured) return
      const result = await getQQMusicAccountPlaylists()
      if (requestId != currentRequestId) return
      list = result.list.map(item => ({
        id: `${item.dirId}_${item.tid}`,
        name: item.name,
        img: item.img,
        desc: item.desc,
        author: item.author,
        playCount: item.playCount,
        trackCount: item.trackCount,
        subscribed: item.subscribed,
      }))
    } else {
      const status = await getNeteaseMusicStatus()
      if (requestId != currentRequestId) return
      configured.value = status.configured
      if (!status.configured) return
      const result = await getNeteaseMusicAccountPlaylists()
      if (requestId != currentRequestId) return
      list = result.list.map(item => ({
        id: String(item.id),
        name: item.name,
        img: item.img,
        desc: item.desc,
        author: item.author,
        playCount: item.playCount,
        trackCount: item.trackCount,
        subscribed: item.subscribed,
      }))
    }
    playlists.value = list
  } catch (err) {
    if (requestId == currentRequestId) error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (requestId == currentRequestId) {
      statusChecked.value = true
      loading.value = false
    }
  }
}

const openSettings = () => {
  void router.push({
    path: '/setting',
    query: { name: source.value == 'tx' ? 'SettingQQMusic' : 'SettingNeteaseMusic' },
  })
}

watch(source, () => {
  statusChecked.value = false
  configured.value = false
  playlists.value = []
  void load()
})

onMounted(() => {
  void load()
})
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container { height: 100%; display: flex; flex-flow: column nowrap; min-width: 0; }
.header { flex: none; min-height: 44px; display: flex; align-items: center; border-bottom: var(--color-list-header-border-bottom); h1 { flex: none; padding-left: 15px; font-size: 16px; font-weight: 600; color: var(--color-font); } }
.refreshBtn { flex: none; margin-right: 10px; color: var(--color-font); background: none !important; }
.content { min-height: 0; flex: auto; position: relative; overflow: hidden; }
.state { position: absolute; inset: 0; display: flex; flex-flow: column nowrap; align-items: center; justify-content: center; gap: 16px; color: var(--color-font-label); p { font-size: 16px; } }
</style>
