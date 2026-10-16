<template>
  <div :class="$style.container">
    <div :class="$style.controls">
      <base-tab :model-value="mode" :list="modes" item-label="name" @change="changeMode" />
      <base-btn min outline :disabled="loading" @click="showSettings = true">{{ $t('ai_recommend__settings') }}</base-btn>
    </div>
    <div v-if="mode != 'ai'" :class="$style.controls">
      <base-selection :model-value="tagId" :list="categories" item-key="id" item-name="name" @update:model-value="changeCategory" />
      <base-btn min outline :disabled="loading || page <= 1" @click="changePage(page - 1)">{{ $t('bilibili__previous_batch') }}</base-btn>
      <base-btn min :disabled="loading || !hasMore" @click="changePage(page + 1)">{{ $t('bilibili__next_batch') }}</base-btn>
      <base-btn min outline :disabled="loading" @click="loadBrowse(true)">{{ $t('bilibili__refresh') }}</base-btn>
    </div>
    <div v-else :class="$style.aiControls">
      <div :class="$style.controls">
        <base-input v-model="biliAiSession.hint" :class="$style.preference" :trim="false" :disabled="loading" :auto-paste="false" :placeholder="$t('ai_recommend__hint_placeholder')" :aria-label="$t('ai_recommend__preference')" maxlength="500" @submit="generate" />
        <base-btn min :disabled="loading" @click="generate">{{ $t('ai_recommend__generate') }}</base-btn>
        <base-btn v-if="loading" min outline @click="cancel">{{ $t('ai_recommend__cancel') }}</base-btn>
      </div>
      <base-checkbox id="bili-ai-use-profile" v-model="biliAiSession.useProfile" :disabled="loading" :label="$t('ai_recommend__use_profile')" />
      <p :class="$style.tip">{{ $t('ai_recommend__data_tip') }}</p>
    </div>
    <p v-if="mode != 'ai' && loading && info.list.length" :class="$style.tip" role="status">{{ $t('bilibili__loading_more', { count: info.list.length }) }}</p>
    <p v-if="notice" :class="$style.notice" role="status">{{ $t(notice) }}</p>
    <SongList :class="$style.cards" :list-info="info" hide-pagination />
    <AiRecommendationSettings v-model="showSettings" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowReactive, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { LIST_IDS } from '@common/constants'
import { discoveryCategories, discoverPlaylists } from '@renderer/utils/musicSdk/bili/discovery'
import { cancelAiRecommendation, createAiJobId, getAiRecommendConfig, getRecommendationError, planAiRecommendations, rankAiRecommendations } from '@renderer/utils/aiRecommendation'
import { getListMusics } from '@renderer/store/list/listManage'
import { playedList } from '@renderer/store/player/state'
import { biliAiSession, biliBrowseSession } from '@renderer/store/songList/bilibili'
import type { ListInfo, ListInfoItem } from '@renderer/store/songList/state'
import { useI18n } from '@renderer/plugins/i18n'
import type { AiRecommendContext, AiRecommendSeed } from '@common/types/aiRecommendation'
import SongList from './SongList.vue'
import AiRecommendationSettings from './AiRecommendationSettings.vue'

const props = defineProps<{ tagId: string, sortId: string, page: number }>()
const router = useRouter()
const route = useRoute()
const t = useI18n()
const mode = computed(() => ['hot', 'new', 'ai'].includes(props.sortId) ? props.sortId : 'hot')
const modes = computed(() => (['hot', 'new', 'ai'] as const).map(id => ({ id, name: t(`bilibili__mode_${id}`) })))
const categories = computed(() => discoveryCategories.map(item => ({ id: item.id, name: t(`bilibili__category_${item.label}` as Parameters<typeof t>[0]) })))
const loading = ref(false)
const notice = ref('')
const hasMore = ref(false)
const showSettings = ref(false)
const info = shallowReactive<ListInfo>({ list: [], source: 'bili', total: 0, page: 1, limit: 20, key: null, tagId: '', sortId: 'hot', noItemLabel: '' })
let controller: AbortController | null = null
const activeJob = { id: '' }
let version = 0
let browseKey = ''

const stop = () => {
  version++
  controller?.abort()
  controller = null
  if (activeJob.id) void cancelAiRecommendation(activeJob.id).catch(() => {})
  activeJob.id = ''
}
const rememberPage = () => {
  Object.assign(biliBrowseSession, { tagId: props.tagId, sortId: mode.value, page: props.page })
}
const navigate = (sortId: string, tagId: string, page = 1) => {
  void router.replace({ path: route.path, query: { sortId, tagId, page } })
}
const changeMode = (id: string) => {
  if (id == 'ai') { void router.push({ path: '/recommendations', query: { source: 'bili' } }); return }
  navigate(id, props.tagId)
}
const changeCategory = (id: string) => { navigate(mode.value, id) }
const changePage = (page: number) => { navigate(mode.value, props.tagId, page) }

const loadBrowse = async(refresh = false) => {
  stop()
  const current = version
  const signal = (controller = new AbortController()).signal
  loading.value = true
  notice.value = ''
  hasMore.value = false
  const key = `${mode.value}:${props.tagId}:${props.page}`
  if (browseKey != key) info.list = []
  browseKey = key
  info.noItemLabel = info.list.length ? '' : t('list__loading')
  rememberPage()
  try {
    const result = await discoverPlaylists({
      category: props.tagId,
      sort: mode.value,
      page: props.page,
      refresh,
      signal,
      onProgress(result) {
        if (current != version || !result.list.length) return
        info.list = result.list
        info.total = result.list.length
        info.noItemLabel = ''
      },
    })
    if (current != version) return
    Object.assign(info, result, { noItemLabel: result.list.length ? '' : t('bilibili__empty_batch') })
    hasMore.value = result.hasMore
    notice.value = result.warning
  } catch (error) {
    if (current == version) {
      const key = getRecommendationError(error)
      notice.value = key
      info.noItemLabel = info.list.length ? '' : t(key)
    }
  } finally {
    if (current == version) loading.value = false
  }
}

const getSeeds = async(): Promise<AiRecommendSeed[]> => {
  if (!biliAiSession.useProfile) return []
  const love = await getListMusics(LIST_IDS.LOVE)
  const songs = [...playedList.slice(-15).reverse().map(item => 'metadata' in item.musicInfo ? item.musicInfo.metadata.musicInfo : item.musicInfo), ...love.slice(0, 25)]
  return [...new Map(songs.filter(Boolean).map(song => [song.name + '\n' + song.singer, { name: song.name, singer: song.singer }])).values()].slice(0, 40)
}

const generate = async() => {
  if (loading.value) return
  stop()
  const current = version
  const signal = (controller = new AbortController()).signal
  loading.value = true
  notice.value = ''
  info.noItemLabel = info.list.length ? '' : t('ai_recommend__generating')
  const currentJob = activeJob.id = createAiJobId()
  try {
    const context: AiRecommendContext = { hint: biliAiSession.hint.trim(), seeds: await getSeeds() }
    if (current != version) return
    if (!context.hint && !context.seeds.length) throw new Error('ai_recommend__error_preference')
    const config = await getAiRecommendConfig()
    if (current != version) return
    if (!config.configured) {
      showSettings.value = true
      throw new Error('ai_recommend__error_config')
    }
    const intents = await planAiRecommendations({ ...context, jobId: currentJob })
    if (current != version) return
    info.noItemLabel = info.list.length ? '' : t('ai_recommend__finding')
    const candidates = new Map<string, ListInfoItem>()
    // Sequential searches keep the same two-request detail concurrency limit as browsing.
    for (const intent of intents) {
      const result = await discoverPlaylists({ keyword: intent.keyword, signal })
      if (current != version) return
      for (const item of result.list) {
        if (!candidates.has(item.id)) candidates.set(item.id, item)
        if (candidates.size >= 20) break
      }
      if (candidates.size >= 20) break
    }
    if (!candidates.size) throw new Error('ai_recommend__error_no_results')
    let list = [...candidates.values()]
    info.noItemLabel = info.list.length ? '' : t('ai_recommend__ranking')
    let rankNotice = ''
    try {
      const ordered = await rankAiRecommendations({ ...context, jobId: currentJob, candidates: list.map(item => ({ id: item.id, name: item.name, author: item.author, trackCount: item.trackCount ?? 0 })) })
      if (current != version) return
      const ranked = new Set(ordered.map(item => item.id))
      list = [...ordered.flatMap(item => {
        const playlist = candidates.get(item.id)
        return playlist ? [{ ...playlist, reason: item.reason }] : []
      }), ...list.filter(item => !ranked.has(item.id))]
    } catch {
      if (current != version) return
      rankNotice = 'ai_recommend__rank_fallback'
    }
    biliAiSession.list = list
    biliAiSession.notice = notice.value = rankNotice
    info.list = list
    info.noItemLabel = ''
    info.total = list.length
  } catch (error) {
    if (current != version) return
    const key = getRecommendationError(error)
    notice.value = key
    info.noItemLabel = info.list.length ? '' : t(key)
  } finally {
    if (current == version) {
      loading.value = false
      if (activeJob.id == currentJob) activeJob.id = ''
    }
  }
}

const cancel = () => {
  stop()
  loading.value = false
  notice.value = 'ai_recommend__cancelled'
  info.noItemLabel = info.list.length ? '' : t('ai_recommend__empty')
}

watch(() => [mode.value, props.tagId, props.page], () => {
  stop()
  loading.value = false
  rememberPage()
  if (mode.value != 'ai') {
    void loadBrowse()
    return
  }
  info.list = biliAiSession.list
  browseKey = ''
  info.noItemLabel = info.list.length ? '' : t('ai_recommend__empty')
  notice.value = biliAiSession.notice
}, { immediate: true })

onBeforeUnmount(stop)
</script>

<style lang="less" module>
.container { flex: auto; min-height: 0; display: flex; flex-direction: column; }
.controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 5px 12px; font-size: 12px; }
.aiControls { padding: 0 12px; .controls { padding: 5px 0 10px; } }
.preference { flex: 1; min-width: 180px; }
.tip, .notice { font-size: 12px; line-height: 1.6; color: var(--color-font-label); padding: 5px 12px; }
.aiControls .tip { padding-left: 0; }
.notice { color: var(--color-primary-font); }
.cards { flex: auto; min-height: 0; }
</style>
