<template>
  <div :class="$style.container">
    <nav :class="$style.modes" :aria-label="$t('recommend__title')">
      <button type="button" :class="{[$style.selectedMode]: viewMode == 'software'}" :aria-pressed="viewMode == 'software'" @click="switchMode('software')">{{ $t('software__title') }}</button>
      <button type="button" :class="{[$style.selectedMode]: viewMode == 'ai'}" :aria-pressed="viewMode == 'ai'" @click="switchMode('ai')">{{ $t('software__ai_tab') }}</button>
    </nav>
    <SoftwareRecommendations v-if="viewMode == 'software'" />
    <template v-else>
    <div :class="$style.platformHeader">
    <nav :class="$style.platforms" :aria-label="$t('recommend__platform')">
      <button v-for="item in platforms" :key="item.id" type="button" :class="{[$style.selected]: prefs.source == item.id}" :aria-pressed="prefs.source == item.id" @click="switchSource(item.id)">
        <svg :viewBox="item.viewBox" width="18" height="18" aria-hidden="true"><use :xlink:href="item.icon" /></svg>{{ item.label }}
      </button>
    </nav>
      <base-btn outline min :disabled="loading" @click="showSettings = true">{{ $t('ai_recommend__settings') }}</base-btn>
    </div>
    <section :class="$style.panel" :aria-label="$t('recommend__preferences')">
      <base-input v-model="prefs.hint" :class="$style.preference" :auto-paste="false" :trim="false" :disabled="loading" maxlength="500" :placeholder="$t('recommend__placeholder')" :aria-label="$t('ai_recommend__preference')" @submit="run()" />
      <div :class="$style.presets">
        <button v-for="preset in presets" :key="preset" type="button" :disabled="loading" @click="prefs.hint = preset">{{ preset }}</button>
      </div>
      <div :class="$style.options">
        <base-checkbox id="recommend-profile" v-model="prefs.useProfile" :disabled="loading" :label="$t('recommend__use_profile')" />
        <base-selection v-if="prefs.useProfile" v-model="prefs.listId" :class="$style.listSelect" :list="seedLists" :disabled="loading" item-key="id" item-name="name" :aria-label="$t('recommend__reference_list')" />
        <span>{{ $t('recommend__variety') }}</span>
        <base-selection v-model="prefs.variety" :class="$style.variety" :list="varieties" :disabled="loading" item-key="id" item-name="name" :aria-label="$t('recommend__variety')" />
        <base-checkbox id="recommend-avoid-recent" v-model="prefs.avoidRecent" :disabled="loading" :label="$t('recommend__avoid_recent')" />
      </div>
      <div :class="$style.actions">
        <base-btn min :disabled="loading" @click="run()">{{ $t('ai_recommend__generate') }}</base-btn>
        <base-btn v-if="loading" min outline @click="cancel">{{ $t('ai_recommend__cancel') }}</base-btn>
        <span v-if="loading" role="status">{{ translate(stage) }}</span>
      </div>
      <p :class="$style.privacy">{{ $t(prefs.useProfile ? 'recommend__privacy_profile' : 'recommend__privacy_hint') }}</p>
    </section>
    <div :class="$style.resultHeader">
      <div>
          <strong>{{ $t('recommend__your_results') }}</strong>
      </div>
      <base-btn v-if="rows.length" min outline @click="play(0)">{{ $t('list__play') }}</base-btn>
      <base-btn v-if="rows.length" min outline :disabled="loading || !nextRows.length" @click="nextBatch">{{ $t('recommend__next_batch') }}</base-btn>
    </div>
    <p v-if="message || feed.notice" :class="$style.notice" role="status">{{ translate(message || feed.notice) }} <button v-if="message == 'recommend__login_required'" type="button" @click="openAccountSettings">{{ $t('recommend__login') }}</button></p>
    <main ref="resultsContainer" :class="[$style.results, 'scroll']" :aria-busy="loading">
      <ul v-if="rows.length" :class="$style.grid">
        <li v-for="(row, index) in rows" :key="row.music.id" :class="$style.card" :data-recommendation-id="row.music.id">
          <span :class="$style.order" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <button type="button" :class="$style.cover" :aria-label="$t('recommend__play_song', { name: row.music.name })" @click="play(index)">
            <img v-if="row.music.meta.picUrl" :src="row.music.meta.picUrl" loading="lazy" decoding="async" alt="" @error="hideBrokenImage">
            <svg-icon v-else name="music" />
            <span :class="$style.playOverlay"><svg-icon name="play-outline" /></span>
          </button>
          <div :class="$style.track">
            <button type="button" :title="row.music.name" :class="$style.name" @click="play(index)">{{ row.music.name }}</button>
            <p :class="$style.artist" :title="row.music.singer">{{ row.music.singer || $t('unknown_singer') }} <span>{{ row.music.interval }}</span></p>
            <p v-if="row.reason" :class="$style.reason" :title="row.reason">{{ row.reason }}</p>
          </div>
          <div :class="$style.trackActions">
            <button type="button" :aria-label="$t('recommend__collect_song', { name: row.music.name })" :title="$t('list__collect')" @click="collect(row)"><svg viewBox="0 0 444.87 391.18" width="16" height="16" aria-hidden="true"><use xlink:href="#icon-love" /></svg></button>
            <button type="button" :aria-label="$t('recommend__dismiss_song', { name: row.music.name })" :title="$t('recommend__not_interested')" @click="dismiss(row)"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button>
          </div>
        </li>
      </ul>
      <div v-else :class="$style.empty"><svg-icon name="recommendation-sparkles" /><p>{{ $t(loading ? 'recommend__waiting' : 'recommend__empty') }}</p></div>
    </main>
    <footer v-if="blocked.length" :class="$style.footer">
      <button type="button" @click="resetFeedback">{{ $t('recommend__reset_feedback', { count: blocked.length }) }}</button>
    </footer>
    <AiRecommendationSettings v-model="showSettings" />
    <common-list-add-modal v-if="selectedMusic" v-model:show="showCollect" :music-info="selectedMusic" teleport="#view" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { useI18n } from '@renderer/plugins/i18n'
import { LIST_IDS } from '@common/constants'
import { userLists } from '@renderer/store/list/state'
import { setTempList } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player/action'
import { hasDislike } from '@renderer/core/dislikeList'
import { cancelAiRecommendation, createAiJobId, getAiRecommendConfig, getRecommendationError } from '@renderer/utils/aiRecommendation'
import { recommendationPreferences as prefs, recommendationFeeds, recommendationSources, recommendationBlocked as blocked, getBlockedKeys, blockRecommendation, saveRecommendations } from '@renderer/utils/recommendation/session'
import { getRecommendationProfile } from '@renderer/utils/recommendation/profile'
import { generateTracks } from '@renderer/utils/recommendation/engine'
import { checkCancelled } from '@renderer/utils/recommendation/providers'
import { trackSignature } from '@renderer/utils/recommendation/ranking'
import { selectAiBatch } from '@renderer/utils/recommendation/aiRanking'
import { getOwnedLibraryKeys } from '@renderer/utils/recommendation/softwareData'
import { isOwnedTrack } from '@renderer/utils/recommendation/softwareProfile'
import useVisibleArtists from '@renderer/utils/recommendation/useVisibleArtists'
import type { TrackRecommendation } from '@renderer/utils/recommendation/ranking'
import type { RecommendationSource } from '@common/types/aiRecommendation'
import AiRecommendationSettings from '@renderer/views/songList/List/components/AiRecommendationSettings.vue'
import SoftwareRecommendations from './SoftwareRecommendations.vue'

const router = useRouter()
const route = useRoute()
const viewMode = ref<'software' | 'ai'>(route.query.mode == 'ai' || route.query.source ? 'ai' : 'software')
const t = useI18n()
const translate = (key: string) => t(key as Parameters<typeof t>[0])
const loading = ref(false)
const stage = ref('')
const message = ref('')
const showSettings = ref(false)
const showCollect = ref(false)
const selectedMusic = ref<LX.Music.MusicInfoOnline | null>(null)
const resultsContainer = ref<HTMLElement | null>(null)
const platforms = computed(() => [
  { id: 'tx' as const, label: t('source_tx'), icon: '#icon-qq-music', viewBox: '0 0 1024 1024' },
  { id: 'wy' as const, label: t('source_wy'), icon: '#icon-netease-music', viewBox: '0 0 1024 1024' },
  { id: 'bili' as const, label: 'bilibili', icon: '#icon-bilibili-fill', viewBox: '0 0 1024 1024' },
])
const varieties = computed(() => (['familiar', 'balanced', 'explore'] as const).map(id => ({ id, name: t(`recommend__variety_${id}`) })))
const presets = computed(() => (['relax', 'focus', 'commute', 'discover'] as const).map(key => t(`recommend__preset_${key}`)))
const seedLists = computed(() => [{ id: '', name: t('software__all_lists') }, ...userLists.map(list => ({ id: list.id, name: list.name }))])
const feed = computed(() => recommendationFeeds[prefs.source])
const owned = ref<Set<string>>(new Set())
const libraryReady = ref(false)
const allowed = (music: LX.Music.MusicInfoOnline) => libraryReady.value && !isOwnedTrack(music, owned.value) && !hasDislike(music)
const rows = computed(() => {
  const excluded = getBlockedKeys()
  return feed.value.ids.flatMap(id => {
    const row = feed.value.pool.find(row => row.music.id == id)
    return feed.value.mode == 'ai' && row && allowed(row.music) && !excluded.has(id) && !excluded.has(trackSignature(row.music)) ? [row] : []
  })
})
const nextRows = computed(() => selectAiBatch(feed.value.pool, { source: prefs.source, variety: prefs.variety, blocked: getBlockedKeys(), owned: owned.value, allowed, seen: new Set(feed.value.seen), limit: 20 }))
let controller: AbortController | null = null
let jobId = ''
let version = 0
let libraryController: AbortController | null = null
const refreshOwned = async() => {
  libraryController?.abort()
  libraryReady.value = false
  const signal = (libraryController = new AbortController()).signal
  try {
    const keys = await getOwnedLibraryKeys(signal)
    if (!signal.aborted) { owned.value = keys; libraryReady.value = true }
  } catch { /* Cached songs stay hidden until the local library can be checked. */ }
}
const listsChanged = (ids: string[]) => { if (viewMode.value == 'ai' && ids.some(id => userLists.some(list => list.id == id))) void refreshOwned() }
window.app_event.on('myListUpdate', listsChanged)
watch(() => [viewMode.value, userLists.map(list => list.id).join(',')], () => {
  if (viewMode.value == 'ai') void refreshOwned()
  else libraryController?.abort()
}, { immediate: true })

const stop = () => {
  version++
  controller?.abort()
  controller = null
  if (jobId) void cancelAiRecommendation(jobId).catch(() => {})
  jobId = ''
  loading.value = false
}
const persist = () => { if (!saveRecommendations()) message.value = 'recommend__storage_failed' }
useVisibleArtists(resultsContainer, rows, music => {
  const target = recommendationFeeds[prefs.source]
  target.pool = markRaw(target.pool.map(row => row.music.id == music.id ? { ...row, music } : row))
  persist()
})
const switchSource = (source: RecommendationSource) => {
  void router.replace({ path: '/recommendations', query: { mode: 'ai', source } })
}
const switchMode = (mode: 'software' | 'ai') => {
  stop()
  viewMode.value = mode
  void router.replace({ path: '/recommendations', query: mode == 'ai' ? { mode, source: prefs.source } : { mode } })
}
watch(() => [route.query.mode, route.query.source], ([mode, source]) => { viewMode.value = mode == 'ai' || (mode != 'software' && source) ? 'ai' : 'software' })
watch(viewMode, () => { stop() })
watch(() => route.query.source, value => {
  const source = recommendationSources.find(source => source == value)
  if (source) prefs.source = source
}, { immediate: true })
watch(() => prefs.source, () => { stop(); message.value = ''; persist() })
watch(seedLists, lists => { if (!lists.some(list => list.id == prefs.listId)) prefs.listId = '' }, { immediate: true })
watch(prefs, persist, { deep: true })

const run = async() => {
  if (loading.value) return
  stop()
  const current = version
  const source = prefs.source
  const hint = prefs.hint.trim()
  const variety = prefs.variety
  const { useProfile, listId, avoidRecent } = prefs
  const signal = (controller = new AbortController()).signal
  loading.value = true
  message.value = ''
  stage.value = 'recommend__preparing'
  const currentJob = jobId = createAiJobId()
  try {
    const config = await getAiRecommendConfig()
    checkCancelled(signal)
    if (!config.configured) { showSettings.value = true; throw new Error('ai_recommend__error_config') }
    checkCancelled(signal)
    const profile = await getRecommendationProfile(useProfile, listId, avoidRecent, signal)
    checkCancelled(signal)
    owned.value = profile.owned
    libraryReady.value = true
    if (!hint && !profile.seeds.length) throw new Error('recommend__need_preference')
    const blocked = new Set([...getBlockedKeys(), ...profile.skipped])
    const seen = new Set([...profile.recent, ...recommendationFeeds[source].seen])
    const result = await generateTracks({
      context: { jobId: currentJob, source, hint, variety, seeds: profile.seeds, recentSeeds: profile.recentSeeds, avoidedSeeds: profile.avoidedSeeds },
      signal,
      blocked,
      seen,
      owned: profile.owned,
      allowed: music => !hasDislike(music),
      onStage: value => { if (current == version) stage.value = value },
    })
    checkCancelled(signal)
    if (!result.pool.length) throw new Error('recommend__empty_filtered')
    if (current != version) return
    const selected = selectAiBatch(result.pool, { source, variety, blocked: getBlockedKeys(), owned: owned.value, allowed, limit: 20 })
    if (!selected.length) throw new Error('recommend__empty_filtered')
    const target = recommendationFeeds[source]
    Object.assign(target, { pool: markRaw(result.pool), ids: selected.map(row => row.music.id), updatedAt: Date.now(), mode: 'ai', notice: result.notice })
    target.seen = [...new Set([...target.seen, ...selected.flatMap(row => [row.music.id, trackSignature(row.music)])])].slice(-160)
    persist()
  } catch (error) {
    if (current != version) return
    const text = error instanceof Error ? error.message : String(error)
    message.value = /^recommend__/.test(text) ? text : /ai_recommend__|bilibili__/.test(text) ? getRecommendationError(error) : 'recommend__error_search'
  } finally {
    if (current == version) { loading.value = false; jobId = ''; controller = null }
  }
}
const cancel = () => { stop(); message.value = 'ai_recommend__cancelled' }
const nextBatch = () => {
  const selected = nextRows.value
  if (!selected.length) return
  feed.value.ids = selected.map(row => row.music.id)
  feed.value.seen = [...new Set([...feed.value.seen, ...selected.flatMap(row => [row.music.id, trackSignature(row.music)])])].slice(-160)
  persist()
}
const dismiss = (row: TrackRecommendation) => {
  blockRecommendation(row)
  feed.value.ids = feed.value.ids.filter(id => id != row.music.id)
  persist()
}
const resetFeedback = () => { blocked.splice(0); message.value = 'recommend__feedback_reset'; persist() }
const play = async(index: number) => {
  const songs = rows.value.map(row => row.music)
  if (!songs[index]) return
  try { await setTempList(`recommendations:${prefs.source}`, songs); playList(LIST_IDS.TEMP, index) } catch { message.value = 'recommend__play_failed' }
}
const collect = (row: TrackRecommendation) => { selectedMusic.value = row.music; showCollect.value = true }
const hideBrokenImage = (event: Event) => { (event.target as HTMLImageElement).style.visibility = 'hidden' }
const openAccountSettings = () => { void router.push({ path: '/setting', query: { name: prefs.source == 'tx' ? 'SettingQQMusic' : 'SettingNeteaseMusic' } }) }
onBeforeUnmount(() => { stop(); libraryController?.abort(); window.app_event.off('myListUpdate', listsChanged); saveRecommendations() })
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.container { height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 0 12px; box-sizing: border-box; button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; } }
.modes { display: flex; flex: none; gap: 20px; padding: 2px 0 12px; button { border: none; border-bottom: 2px solid transparent; padding: 8px 0; background: none; color: var(--color-font-label); font-size: 15px; cursor: pointer; &.selectedMode { color: var(--color-primary); border-bottom-color: var(--color-primary); } } }
.platformHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px; flex: none; }
.platforms { display: flex; gap: 8px; button { display: inline-flex; gap: 7px; align-items: center; padding: 7px 10px; border: none; border-radius: 6px; color: var(--color-font-label); background: transparent; cursor: pointer; font-size: 12px; svg { fill: currentColor; } &:hover { color: var(--color-font); background: var(--color-primary-alpha-900); } &.selected { color: var(--color-primary); background: var(--color-primary-alpha-900); } } }
.panel { flex: none; padding: 0 1px 8px; }
.preference { width: 100%; box-sizing: border-box; }
.presets { display: flex; flex-wrap: wrap; gap: 12px; padding-top: 8px; button { border: none; color: var(--color-700); background: transparent; padding: 2px 0; font-size: 11px; cursor: pointer; &:hover { color: var(--color-primary); } } }
.options { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 12px 0; font-size: 12px; }
.listSelect { width: 140px; max-width: 180px; }
.variety { width: 105px; }
.listSelect, .variety { :global(.label-content) { border-radius: 4px; padding: 0 5px; background: transparent; color: var(--color-font); &:hover { color: var(--color-primary); background: var(--color-primary-alpha-900); } } }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--color-font-label); }
.privacy { margin-top: 8px; font-size: 10px; line-height: 1.5; color: var(--color-700); }
.resultHeader { display: flex; align-items: center; gap: 10px; padding: 12px 1px; border-bottom: 1px solid var(--color-primary-alpha-900); flex: none; > div { flex: 1; min-width: 0; } strong { font-size: 14px; font-weight: 600; } }
.notice { flex: none; padding: 0 0 10px; font-size: 12px; line-height: 1.6; color: var(--color-primary-font); button { border: none; cursor: pointer; color: var(--color-primary); background: none; text-decoration: underline; } }
.results { flex: 1; min-height: 0; overflow: auto; padding-bottom: 8px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; margin: 0; padding: 0; list-style: none; }
.card { position: relative; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px 6px; border-radius: 6px; transition: background-color @transition-fast; &::after { content: ''; position: absolute; left: 31px; right: 6px; bottom: 0; height: 1px; background: var(--color-font); opacity: .08; pointer-events: none; } &:hover, &:focus-within { background: var(--color-primary-alpha-900); .trackActions { opacity: 1; pointer-events: auto; } } }
.order { flex: none; width: 15px; color: var(--color-font-label); opacity: .6; font-size: 9px; font-variant-numeric: tabular-nums; text-align: center; }
.cover { position: relative; flex: none; width: 46px; height: 46px; border: none; padding: 0; border-radius: 6px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; background: var(--color-150); color: var(--color-font-label); img { width: 100%; height: 100%; object-fit: cover; } > svg { width: 22px; height: 22px; fill: currentColor; } &:hover .playOverlay { opacity: 1; } }
.playOverlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .3); color: white; opacity: 0; transition: opacity @transition-fast; svg { width: 22px; height: 22px; fill: currentColor; } }
.track { flex: 1; min-width: 0; }
.name { display: block; max-width: 100%; border: none; padding: 0; font-size: 13px; font-weight: 600; color: var(--color-font); background: none; cursor: pointer; text-align: left; .mixin-ellipsis-1(); &:hover { color: var(--color-primary); } }
.artist { font-size: 11px; color: var(--color-750); margin-top: 4px; .mixin-ellipsis-1(); span { margin-left: 8px; opacity: .8; font-size: 10px; } }
.reason { margin-top: 4px; font-size: 10px; color: var(--color-700); line-height: 1.4; .mixin-ellipsis-1(); }
.trackActions { flex: none; display: flex; flex-direction: column; gap: 3px; opacity: 0; pointer-events: none; transition: opacity @transition-fast; button { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: 5px; background: none; cursor: pointer; color: var(--color-font-label); svg { fill: currentColor; } &:hover { color: var(--color-primary); background: var(--color-100); } } }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 90px; color: var(--color-font-label); gap: 14px; font-size: 13px; text-align: center; svg { width: 30px; height: 30px; opacity: .6; } }
.footer { flex: none; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 8px 0; color: var(--color-font-label); font-size: 11px; button { border: none; background: none; color: var(--color-font-label); cursor: pointer; text-decoration: underline; } }
@media (max-width: 1080px) { .grid { grid-template-columns: minmax(0, 1fr); } }
@media (min-width: 1700px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (hover: none) { .trackActions { opacity: 1; pointer-events: auto; } }
</style>
