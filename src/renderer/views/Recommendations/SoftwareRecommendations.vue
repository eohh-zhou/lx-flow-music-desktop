<template>
  <section :class="$style.container">
    <section :class="$style.panel">
      <div :class="$style.options">
        <div :class="$style.field">
          <label>{{ $t('software__sources') }}</label>
          <base-selection v-model="prefs.source" :class="$style.selection" :list="sources" :disabled="loading" item-key="id" item-name="name" :aria-disabled="loading" :aria-label="$t('software__sources')" />
        </div>
        <div :class="$style.field">
          <label>{{ $t('recommend__variety') }}</label>
          <base-selection v-model="prefs.variety" :class="$style.selection" :list="varieties" :disabled="loading" item-key="id" item-name="name" :aria-disabled="loading" :aria-label="$t('recommend__variety')" />
        </div>
        <div :class="$style.actions">
          <button type="button" :class="$style.update" :disabled="loading" @click="run"><svg :class="{ [$style.spinning]: loading }" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5m-3.6-4a7 7 0 0 1 11.8-2L20 9M4 15l2.8 3A7 7 0 0 0 18.6 16" /></svg>{{ $t(loading ? 'software__updating' : 'software__update') }}</button>
          <button v-if="loading" type="button" :class="$style.cancel" @click="cancel">{{ $t('ai_recommend__cancel') }}</button>
        </div>
      </div>
      <div :class="$style.secondary">
        <details :class="$style.lists">
          <summary><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 10h16M4 15h9M4 20h9m5-5v6m-3-3h6" /></svg>{{ $t('software__reference_lists') }}<span>{{ prefs.lists == null ? $t('software__all_lists') : $t('software__selected_lists', { count: selectedCount }) }}</span><svg :class="$style.chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg></summary>
          <div :class="$style.listOptions">
            <button type="button" :disabled="loading" @click="prefs.lists = null">{{ $t('software__all_lists') }}</button>
            <label v-for="list in userLists" :key="list.id"><input type="checkbox" :checked="prefs.lists?.includes(list.id) ?? true" :disabled="loading" @change="toggleList(list.id)">{{ list.name }}</label>
            <span v-if="!userLists.length">{{ $t('software__no_lists') }}</span>
            <button v-if="blocked.length" type="button" :class="$style.reset" @click="resetFeedback">{{ $t('recommend__reset_feedback', { count: blocked.length }) }}</button>
          </div>
        </details>
        <base-checkbox id="software-avoid-recent" v-model="prefs.avoidRecent" :disabled="loading" :label="$t('software__avoid_recent')" />
      </div>
    </section>
    <div :class="$style.resultHeader">
      <div :class="$style.resultTitle"><strong>{{ $t('recommend__your_results') }}</strong><span v-if="rows.length" :class="$style.count">{{ $t('software__track_count', { count: rows.length }) }}</span></div>
      <button v-if="rows.length" type="button" :class="$style.resultAction" @click="play(0)"><svg-icon name="play-outline" />{{ $t('list__play') }}</button>
      <button v-if="rows.length" type="button" :class="$style.resultAction" :disabled="loading || !nextRows.length" @click="nextBatch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h12m-3-3 3 3-3 3M20 17H8m3-3-3 3 3 3" /></svg>{{ $t('recommend__next_batch') }}</button>
    </div>
    <p v-if="message" :class="$style.notice" role="status">{{ translate(message) }}</p>
    <main ref="resultsContainer" :class="[$style.results, 'scroll']" :aria-busy="loading">
      <ul v-if="rows.length" :class="$style.grid">
        <li v-for="(row, index) in rows" :key="row.music.id" :class="$style.card" :data-recommendation-id="row.music.id">
          <span :class="$style.order" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <button type="button" :class="$style.cover" :aria-label="$t('recommend__play_song', { name: row.music.name })" @click="play(index)">
            <img v-if="row.music.meta.picUrl" :src="row.music.meta.picUrl" loading="lazy" decoding="async" alt="" @error="hideBrokenImage"><svg-icon v-else name="music" />
            <span :class="$style.playOverlay"><svg-icon name="play-outline" /></span>
          </button>
          <div :class="$style.track">
            <div :class="$style.trackHeading"><button type="button" :class="$style.name" :title="row.music.name" @click="play(index)">{{ row.music.name }}</button><small v-if="prefs.source == 'all'" :class="$style.source">{{ row.music.source == 'bili' ? 'bilibili' : $t(row.music.source == 'tx' ? 'source_tx' : 'source_wy') }}</small></div>
            <p :class="$style.artist"><span :class="$style.artistName" :title="row.music.singer">{{ row.music.singer || $t('unknown_singer') }}</span><span v-if="row.music.interval" :class="$style.duration">{{ row.music.interval }}</span></p>
            <p :class="$style.reason" :title="row.reason"><svg-icon name="recommendation-sparkles" /><span>{{ row.reason }}</span></p>
          </div>
          <div :class="$style.trackActions">
            <button type="button" :aria-label="$t('recommend__collect_song', { name: row.music.name })" :title="$t('software__add_to_list')" @click="collect(row)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h13M4 10h13M4 15h7m6-1v7m-3-3.5h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button>
            <button type="button" :aria-label="$t('recommend__dismiss_song', { name: row.music.name })" :title="$t('recommend__not_interested')" @click="dismiss(row)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button>
          </div>
        </li>
      </ul>
      <div v-else :class="$style.empty"><svg-icon name="recommendation-sparkles" /><p>{{ $t(loading ? 'recommend__waiting' : 'software__empty') }}</p></div>
    </main>
    <common-list-add-modal v-if="selectedMusic" v-model:show="showCollect" :music-info="selectedMusic" teleport="#view" />
  </section>
</template>

<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, watch } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { userLists } from '@renderer/store/list/state'
import { setTempList } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { playList } from '@renderer/core/player/action'
import { hasDislike } from '@renderer/core/dislikeList'
import { blockRecommendation, getBlockedKeys, recommendationBlocked as blocked, saveRecommendations } from '@renderer/utils/recommendation/session'
import { softwarePreferences as prefs, softwareFeeds, saveSoftwareRecommendations } from '@renderer/utils/recommendation/softwareSession'
import { getOwnedLibraryKeys, getSoftwareProfile } from '@renderer/utils/recommendation/softwareData'
import { isOwnedTrack } from '@renderer/utils/recommendation/softwareProfile'
import { generateSoftwareTracks } from '@renderer/utils/recommendation/softwareEngine'
import { selectSoftwareBatch } from '@renderer/utils/recommendation/softwareMmr'
import { trackSignature } from '@renderer/utils/recommendation/ranking'
import useVisibleArtists from '@renderer/utils/recommendation/useVisibleArtists'
import type { TrackRecommendation } from '@renderer/utils/recommendation/ranking'
import type { PreferenceBasis } from '@renderer/utils/recommendation/softwareProfile'

const t = useI18n()
const translate = (key: string) => t(key as Parameters<typeof t>[0])
const sources = computed(() => [{ id: 'all', name: t('software__all_sources') }, { id: 'tx', name: t('source_tx') }, { id: 'wy', name: t('source_wy') }, { id: 'bili', name: 'bilibili' }])
const varieties = computed(() => (['familiar', 'balanced', 'explore'] as const).map(id => ({ id, name: t(`recommend__variety_${id}`) })))
const selectedCount = computed(() => userLists.filter(list => prefs.lists?.includes(list.id)).length)
const feed = computed(() => softwareFeeds[prefs.source])
const loading = ref(false)
const message = ref('')
const selectedMusic = ref<LX.Music.MusicInfoOnline | null>(null)
const showCollect = ref(false)
const resultsContainer = ref<HTMLElement | null>(null)
const owned = ref<Set<string>>(new Set())
const libraryReady = ref(false)
const allowed = (row: TrackRecommendation) => libraryReady.value && !isOwnedTrack(row.music, owned.value) && !getBlockedKeys().has(row.music.id) && !getBlockedKeys().has(trackSignature(row.music)) && !hasDislike(row.music)
const rows = computed(() => selectSoftwareBatch(feed.value.ids.flatMap(id => { const row = feed.value.pool.find(row => row.music.id == id); return row ? [row] : [] }), { variety: prefs.variety, allowed }))
const nextRows = computed(() => selectSoftwareBatch(feed.value.pool, { variety: prefs.variety, seen: new Set(feed.value.seen), allowed }))
let controller: AbortController | null = null
let version = 0
let libraryController: AbortController | null = null
const refreshOwned = async() => {
  libraryController?.abort()
  const signal = (libraryController = new AbortController()).signal
  try {
    const keys = await getOwnedLibraryKeys(signal)
    if (!signal.aborted) { owned.value = keys; libraryReady.value = true }
  } catch { /* Hide cached results until the local library can be checked. */ }
}
const listsChanged = (ids: string[]) => { if (ids.some(id => userLists.some(list => list.id == id))) void refreshOwned() }
watch(() => userLists.map(list => list.id).join(','), () => { void refreshOwned() }, { immediate: true })
window.app_event.on('myListUpdate', listsChanged)
const persist = () => { if (!saveSoftwareRecommendations()) message.value = 'recommend__storage_failed' }
const cancel = () => { version++; controller?.abort(); controller = null; loading.value = false }
watch(() => prefs.source, () => { cancel(); message.value = '' })
watch(prefs, persist, { deep: true })
const toggleList = (id: string) => {
  const selected = new Set(prefs.lists ?? userLists.map(list => list.id))
  if (selected.has(id)) selected.delete(id); else selected.add(id)
  prefs.lists = [...selected]
}
const markSeen = (selected: TrackRecommendation[]) => { feed.value.seen = [...new Set([...feed.value.seen, ...selected.flatMap(row => [row.music.id, trackSignature(row.music)])])].slice(-160) }
const run = async() => {
  if (loading.value) return
  cancel()
  const current = version
  const source = prefs.source
  const generation = feed.value.generation ?? 0
  const seen = new Set(feed.value.seen)
  const signal = (controller = new AbortController()).signal
  loading.value = true; message.value = ''
  try {
    const profile = await getSoftwareProfile(prefs.lists, signal)
    if (signal.aborted || current != version) return
    owned.value = profile.owned
    libraryReady.value = true
    if (!profile.seeds.length) throw new Error('software__need_seeds')
    const reason = (basis: PreferenceBasis, name: string) => t(`software__reason_${basis}`, { name })
    const result = await generateSoftwareTracks(profile, {
      source,
      blocked: getBlockedKeys(),
      avoidRecent: prefs.avoidRecent,
      variety: prefs.variety,
      rotation: generation,
      seen,
      reason,
      signal,
      allowed: music => !hasDislike(music),
      onResults: pool => {
        if (signal.aborted || current != version || feed.value.ids.length || !pool.length) return
        Object.assign(softwareFeeds[source], { pool: markRaw(pool), ids: selectSoftwareBatch(pool, { variety: prefs.variety }).map(row => row.music.id), updatedAt: Date.now() })
      },
    })
    if (signal.aborted || current != version) return
    if (!result.pool.length) throw new Error(result.partial ? 'software__error' : 'software__no_results')
    const target = softwareFeeds[source]
    const selected = selectSoftwareBatch(result.pool, { variety: prefs.variety })
    Object.assign(target, { pool: markRaw(result.pool), ids: selected.map(row => row.music.id), updatedAt: Date.now(), generation: (generation + 1) % 1000000 })
    markSeen(selected)
    message.value = result.partial ? 'software__partial' : ''
    persist()
  } catch (error) {
    if (current != version) return
    const key = error instanceof Error ? error.message : ''
    message.value = /^software__/.test(key) ? key : 'software__error'
  } finally { if (current == version) { loading.value = false; controller = null } }
}
const nextBatch = () => { const selected = nextRows.value; if (!selected.length) return; feed.value.ids = selected.map(row => row.music.id); markSeen(selected); persist() }
const dismiss = (row: TrackRecommendation) => { blockRecommendation(row); feed.value.ids = feed.value.ids.filter(id => id != row.music.id); persist() }
const resetFeedback = () => { blocked.splice(0); saveRecommendations(); persist() }
const play = async(index: number) => {
  const songs = rows.value.map(row => row.music)
  if (!songs[index]) return
  try { await setTempList(`software-recommendations:${prefs.source}`, songs); playList(LIST_IDS.TEMP, index) } catch { message.value = 'recommend__play_failed' }
}
const collect = (row: TrackRecommendation) => { selectedMusic.value = row.music; showCollect.value = true }
const hideBrokenImage = (event: Event) => { (event.target as HTMLImageElement).style.visibility = 'hidden' }
useVisibleArtists(resultsContainer, rows, music => { const target = softwareFeeds[prefs.source]; target.pool = markRaw(target.pool.map(row => row.music.id == music.id ? { ...row, music } : row)); persist() })
onBeforeUnmount(() => { cancel(); libraryController?.abort(); window.app_event.off('myListUpdate', listsChanged); saveSoftwareRecommendations() })
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.container { display: flex; flex-direction: column; flex: 1; min-height: 0; button:focus-visible, summary:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; } }
.panel { flex: none; position: relative; z-index: 2; padding: 0 1px 10px; }
.options { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px; font-size: 12px; }
.field { display: flex; align-items: center; gap: 9px; label { flex: none; color: var(--color-700); font-size: 11px; } }
.selection { width: 125px; :global(.label-content) { padding: 0 5px; border-radius: 4px; background: transparent; color: var(--color-font); &:hover { background: var(--color-primary-alpha-900); color: var(--color-primary); } } :global(.label-content) :global(.icon) { color: var(--color-font-label); font-size: 10px; } &[aria-disabled="true"] { pointer-events: none; opacity: .6; } }
.actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.update { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 30px; box-sizing: border-box; padding: 6px 12px; border: 1px solid var(--color-primary-alpha-700); border-radius: 8px; background: var(--color-button-background); color: var(--color-button-font); font-size: 12px; font-weight: 600; cursor: pointer; transition: background-color @transition-fast; svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; } &:hover:not(:disabled) { background: var(--color-button-background-hover); } &:disabled { opacity: .65; cursor: default; } }
.cancel { border: none; padding: 5px 0; color: var(--color-font-label); background: none; font-size: 11px; cursor: pointer; &:hover { color: var(--color-primary); } }
.secondary { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 20px; margin-top: 7px; font-size: 11px; color: var(--color-font-label); > :last-child { margin-left: auto; } }
.lists { font-size: 11px; summary { display: flex; align-items: center; gap: 6px; cursor: pointer; list-style: none; color: var(--color-font); &::-webkit-details-marker { display: none; } > svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; } > span { color: var(--color-font-label); } } &[open] .chevron { transform: rotate(180deg); } }
.chevron { transition: transform @transition-fast; }
.listOptions { position: absolute; left: 0; top: calc(100% + 12px); z-index: 10; display: flex; gap: 10px 14px; flex-wrap: wrap; box-sizing: border-box; width: 420px; max-width: 100%; max-height: 200px; overflow: auto; padding: 14px; align-items: center; border: 1px solid var(--color-150); border-radius: 10px; background: var(--color-050); box-shadow: 0 8px 24px rgba(0, 0, 0, .1); label { display: inline-flex; align-items: center; gap: 5px; } input { accent-color: var(--color-primary); } button { border: none; padding: 2px 0; color: var(--color-primary); background: none; cursor: pointer; font-size: 11px; } .reset { flex-basis: 100%; padding-top: 9px; border-top: 1px solid var(--color-100); text-align: left; color: var(--color-font-label); } }
.resultHeader { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 1px 12px; border-bottom: 1px solid var(--color-primary-alpha-900); }
.resultTitle { display: flex; align-items: center; flex: 1; min-width: 0; gap: 8px; strong { font-size: 14px; font-weight: 600; } }
.count { color: var(--color-font-label); font-size: 10px; white-space: nowrap; }
.resultAction { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 4px; border: none; padding: 4px 0; color: var(--color-font-label); background: none; font-size: 11px; cursor: pointer; svg { width: 14px; height: 14px; fill: currentColor; } path { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; } &:hover:not(:disabled) { color: var(--color-primary); } &:disabled { opacity: .4; cursor: default; } }
.notice { flex: none; font-size: 12px; line-height: 1.5; padding-bottom: 10px; color: var(--color-primary-font); }
.results { flex: 1; min-height: 0; overflow: auto; padding-bottom: 8px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; row-gap: 0; margin: 0; padding: 0; list-style: none; }
.card { position: relative; display: flex; align-items: center; gap: 10px; padding: 10px 6px; min-width: 0; border-radius: 6px; transition: background-color @transition-fast; &::after { content: ''; position: absolute; left: 31px; right: 6px; bottom: 0; height: 1px; background: var(--color-font); opacity: .08; pointer-events: none; } &:hover, &:focus-within { background: var(--color-primary-alpha-900); .trackActions { opacity: 1; pointer-events: auto; } } }
.order { flex: none; width: 15px; color: var(--color-font-label); font-size: 9px; font-variant-numeric: tabular-nums; opacity: .6; text-align: center; }
.cover { width: 46px; height: 46px; position: relative; flex: none; display: flex; align-items: center; justify-content: center; border: none; padding: 0; border-radius: 6px; overflow: hidden; cursor: pointer; background: var(--color-150); color: var(--color-font-label); img { width: 100%; height: 100%; object-fit: cover; } > svg { width: 22px; height: 22px; fill: currentColor; } &:hover .playOverlay { opacity: 1; } }
.playOverlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: white; background: rgba(0, 0, 0, .3); opacity: 0; transition: opacity @transition-fast; svg { width: 22px; height: 22px; fill: currentColor; } }
.track { flex: 1; min-width: 0; }
.trackHeading { display: flex; align-items: center; gap: 7px; min-width: 0; }
.name { display: block; flex: 1; min-width: 0; max-width: 100%; border: none; padding: 0; text-align: left; cursor: pointer; background: none; color: var(--color-font); font-size: 13px; font-weight: 600; line-height: 1.4; .mixin-ellipsis-1(); &:hover { color: var(--color-primary); } }
.artist { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 11px; color: var(--color-750); line-height: 1.35; }
.artistName { min-width: 0; .mixin-ellipsis-1(); }
.duration { flex: none; padding-left: 8px; border-left: 1px solid var(--color-200); font-size: 10px; font-variant-numeric: tabular-nums; }
.reason { display: flex; align-items: center; gap: 4px; margin-top: 4px; color: var(--color-700); font-size: 9px; line-height: 1.4; svg { flex: none; width: 10px; height: 10px; fill: var(--color-primary); opacity: .65; } span { min-width: 0; .mixin-ellipsis-1(); } }
.source { display: inline-block; flex: none; font-size: 9px; line-height: 1.3; color: var(--color-font-label); white-space: nowrap; }
.trackActions { display: flex; flex-direction: column; gap: 3px; opacity: 0; pointer-events: none; transition: opacity @transition-fast; button { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: 6px; background: none; padding: 3px; color: var(--color-font-label); cursor: pointer; &:hover { color: var(--color-primary); background: var(--color-primary-alpha-900); } } }
.empty { min-height: 170px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--color-font-label); font-size: 13px; svg { width: 35px; height: 35px; fill: currentColor; opacity: .65; } }
.spinning { animation: software-spin 1.2s linear infinite; }
@keyframes software-spin { to { transform: rotate(360deg); } }
@media (max-width: 1000px) { .options { gap: 10px 12px; } .selection { width: 112px; } .field { gap: 6px; } .grid { column-gap: 18px; } }
@media (max-width: 1080px) { .grid { grid-template-columns: minmax(0, 1fr); } }
@media (min-width: 1700px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (hover: none) { .trackActions { opacity: 1; pointer-events: auto; } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
</style>
