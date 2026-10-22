<template>
  <div :class="$style.page">
    <nav :class="$style.tabs" :aria-label="$t('listening__title')">
      <button v-for="item in tabs" :key="item.id" type="button" :class="{ [$style.selected]: tab == item.id }" :aria-pressed="tab == item.id" @click="switchTab(item.id)">{{ item.name }}</button>
      <button type="button" :class="$style.refresh" :disabled="busy || loading" @click="reload">{{ $t('listening__refresh') }}</button>
    </nav>
    <main ref="contentElement" :class="[$style.content, 'scroll']" :aria-busy="loading">
      <p v-if="error" :class="$style.notice" role="alert">{{ error }}</p>
      <template v-if="tab != 'preferences'">
        <div :class="$style.filters">
          <div :class="$style.segment">
            <button type="button" :class="{ [$style.chosen]: periodKind == 'month' }" :aria-pressed="periodKind == 'month'" @click="switchKind('month')">{{ $t('listening__monthly') }}</button>
            <button type="button" :class="{ [$style.chosen]: periodKind == 'year' }" :aria-pressed="periodKind == 'year'" @click="switchKind('year')">{{ $t('listening__yearly') }}</button>
          </div>
          <select v-model="period" :aria-label="$t('listening__period')"><option v-for="item in periods" :key="item" :value="item">{{ formatPeriod(item) }}</option></select>
          <button v-if="tab == 'overview' && snapshot && report.seconds > 0" type="button" :class="$style.shareEntry" :disabled="loading" @click="tab = 'reports'">{{ $t('listening__create_share') }}</button>
          <span v-if="snapshot && !loading" :class="$style.periodState">{{ $t(report.archived ? 'listening__archived' : 'listening__ongoing') }}</span>
        </div>
        <p v-if="tab == 'reports'" :class="$style.hint">{{ $t('listening__auto_report') }}</p>
        <div v-if="loading && !snapshot" :class="$style.empty" role="status">{{ $t('listening__loading') }}</div>
        <template v-else-if="report.seconds > 0">
          <ListeningReportCard v-if="tab == 'reports'" :report="report" @overview="tab = 'overview'" />
          <template v-else>
            <section :class="$style.hero">
              <div :class="$style.heroText">
                <p :class="$style.eyebrow">{{ formatPeriod(report.period) }} · LX FLOW</p>
                <h2>{{ $t('listening__overview_title') }}</h2>
                <div :class="$style.bigNumber">{{ hours(report.seconds) }}<span>{{ $t('listening__hours') }}</span></div>
                <p>{{ $t('listening__hero_days', { days: report.activeDays }) }}</p>
              </div>
              <div :class="$style.heroAside"><span>{{ $t('listening__streak') }}</span><strong>{{ report.streak }}</strong><span>{{ $t('listening__days_unit') }}</span></div>
            </section>
            <div :class="$style.metrics">
              <div><strong>{{ report.plays }}</strong><span>{{ $t('listening__plays') }}</span></div>
              <div><strong>{{ report.uniqueTracks }}{{ report.limited ? '+' : '' }}</strong><span>{{ $t('listening__unique') }}</span></div>
              <div><strong>{{ report.completed }}</strong><span>{{ $t('listening__completed') }}</span></div>
              <div><strong>{{ report.skipped }}</strong><span>{{ $t('listening__skips') }}</span></div>
            </div>
            <section :class="$style.activity">
              <div :class="$style.sectionHeading"><h3>{{ $t('listening__rhythm') }}</h3><span>{{ $t('listening__hours') }}</span></div>
              <div :class="$style.bars" role="img" :aria-label="$t('listening__rhythm')">
                <div v-for="item in activity" :key="item.key" :title="`${item.label} · ${hours(item.seconds)} ${$t('listening__hours')}`"><i :style="{ height: `${item.seconds ? Math.max(3, item.seconds / activityMax * 100) : 2}%` }" :class="{ [$style.silent]: !item.seconds }" /><span v-if="item.showLabel">{{ item.short }}</span></div>
              </div>
            </section>
            <div :class="$style.columns">
              <section>
                <div :class="$style.sectionHeading"><h3>{{ $t('listening__top_tracks') }}</h3><span>TOP {{ Math.min(10, report.tracks.length) }}</span></div>
                <ol :class="$style.ranking">
                  <li v-for="(item, index) in report.tracks.slice(0, 10)" :key="listeningTrackKey(item.track)"><span :class="$style.rank">{{ String(index + 1).padStart(2, '0') }}</span><div><strong>{{ item.track.name }}</strong><span>{{ item.track.singer || $t('listening__unknown') }}</span></div><small>{{ $t('listening__times', { count: item.plays }) }}</small></li>
                </ol>
                <p v-if="!report.tracks.length" :class="$style.hint">{{ $t('listening__no_qualified') }}</p>
              </section>
              <section>
                <div :class="$style.sectionHeading"><h3>{{ $t('listening__top_artists') }}</h3></div>
                <ol :class="$style.artists">
                  <li v-for="(item, index) in report.artists.slice(0, 5)" :key="item.name"><div><span>{{ String(index + 1).padStart(2, '0') }} · {{ item.name }}</span><small>{{ hours(item.seconds) }} {{ $t('listening__hours') }}</small></div><i :style="{ width: `${item.seconds / artistMax * 100}%` }" /></li>
                </ol>
                <div :class="$style.timeInsight"><span>{{ $t('listening__favorite_hour') }}</span><strong>{{ favoriteHour }}</strong><p>{{ $t('listening__time_story') }}</p></div>
                <div :class="$style.sources"><span v-for="item in report.sources" :key="item.source">{{ sourceName(item.source) }} <b>{{ Math.round(item.seconds / report.seconds * 100) }}%</b></span></div>
              </section>
            </div>
          </template>
          <p v-if="report.partial" :class="$style.hint">{{ $t('listening__partial', { date: formatDate(overview?.preferences.startedAt || report.firstAt) }) }}</p>
          <p v-if="report.limited" :class="$style.hint">{{ $t('listening__limited') }}</p>
          <details :class="$style.explanation"><summary>{{ $t('listening__counting') }}</summary><p>{{ $t('listening__counting_detail') }}</p></details>
        </template>
        <div v-else-if="!loading" :class="$style.empty"><svg-icon name="listening" /><h2>{{ $t('listening__empty') }}</h2><p>{{ $t('listening__empty_tip') }}</p><router-link to="/list">{{ $t('listening__go_listen') }}</router-link></div>
      </template>
      <template v-else-if="overview">
        <section :class="$style.preferences">
          <div :class="$style.preferenceRow"><div><h3>{{ $t('listening__record') }}</h3><p>{{ $t('listening__record_hint') }}</p></div><button type="button" :class="[$style.toggle, { [$style.on]: prefs.recording }]" role="switch" :aria-label="$t('listening__record')" :aria-checked="prefs.recording" :disabled="busy" @click="change({ type: 'recording', value: !prefs.recording })"><i /></button></div>
          <div :class="$style.preferenceRow"><div><h3>{{ $t('listening__personalize') }}</h3><p>{{ $t('listening__personalize_hint') }}</p></div><button type="button" :class="[$style.toggle, { [$style.on]: prefs.personalize }]" role="switch" :aria-label="$t('listening__personalize')" :aria-checked="prefs.personalize" :disabled="busy" @click="change({ type: 'personalize', value: !prefs.personalize })"><i /></button></div>
          <div :class="$style.preferenceRow"><div><h3>{{ $t('listening__reset') }}</h3><p>{{ $t('listening__reset_hint') }}</p></div><base-btn min outline :disabled="busy" @click="confirmChange('resetPreferences')">{{ $t('listening__reset_button') }}</base-btn></div>
        </section>
        <section :class="$style.taste">
          <div :class="$style.sectionHeading"><h3>{{ $t('listening__recent_taste') }}</h3><span>{{ $t('listening__last_30_days') }}</span></div>
          <p :class="$style.hint">{{ $t('listening__taste_hint') }}</p>
          <ul :class="$style.preferenceTracks"><li v-for="item in taste" :key="listeningTrackKey(item.track)"><div><strong>{{ item.track.name }}</strong><span>{{ item.track.singer }}</span></div><small>{{ basisName(item.basis) }}</small><button type="button" :disabled="busy || prefs.ignored.length >= 100" @click="change({ type: 'ignore', track: item.track })">{{ $t('listening__ignore') }}</button></li></ul>
          <p v-if="!taste.length" :class="$style.hint">{{ $t(prefs.personalize ? 'listening__no_taste' : 'listening__learning_paused') }}</p>
          <template v-if="prefs.ignored.length"><h3 :class="$style.ignoredHeading">{{ $t('listening__ignored') }} · {{ prefs.ignored.length }}/100</h3><ul :class="$style.preferenceTracks"><li v-for="track in prefs.ignored" :key="listeningTrackKey(track)"><div><strong>{{ track.name }}</strong><span>{{ track.singer }}</span></div><button type="button" :disabled="busy" @click="change({ type: 'restore', key: listeningTrackKey(track) })">{{ $t('listening__restore') }}</button></li></ul></template>
        </section>
        <div :class="$style.preferenceRow"><div><h3>{{ $t('listening__dislike') }}</h3><p>{{ $t('listening__dislike_hint') }}</p></div><base-btn min outline @click="showDislikes = true">{{ $t('listening__manage') }}</base-btn></div>
        <section :class="$style.storage">
          <div :class="$style.sectionHeading"><h3>{{ $t('listening__storage') }}</h3><span>{{ formatBytes(overview?.storedBytes ?? 0) }}</span></div>
          <p>{{ $t('listening__storage_hint') }}</p><p>{{ $t('listening__storage_detail') }}</p>
          <base-btn min outline :disabled="busy" @click="confirmChange('clear')">{{ $t('listening__clear') }}</base-btn>
        </section>
      </template>
    </main>
    <DislikeListModal v-model="showDislikes" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from '@common/utils/vueTools'
import { listeningDate, listeningTrackKey } from '@common/types/listening'
import type { ListeningCommand, ListeningOverview, ListeningReport } from '@common/types/listening'
import { useI18n } from '@renderer/plugins/i18n'
import { sourceNames } from '@renderer/store'
import { dialog } from '@renderer/plugins/Dialog'
import { getListening, getListeningReport } from '@renderer/utils/recommendation/listeningIpc'
import { changeListening, listeningPreferences as prefs, refreshListening } from '@renderer/store/listening'
import { buildSoftwareProfile, type PreferenceBasis, type SoftwarePreference } from '@renderer/utils/recommendation/softwareProfile'
import ListeningReportCard from './ListeningReport.vue'
import { formatListeningHours as hours, listeningHourRange } from './report'
import DislikeListModal from '@renderer/views/Setting/components/DislikeListModal.vue'

type Tab = 'overview' | 'reports' | 'preferences'
const t = useI18n()
const tab = ref<Tab>('overview')
const periodKind = ref<'month' | 'year'>('month')
const currentDate = ref(listeningDate(Date.now()))
const period = ref(currentDate.value.slice(0, 7))
const overview = shallowRef<ListeningOverview | null>(null)
const snapshot = shallowRef<ListeningReport | null>(null)
const emptyReport: ListeningReport = { period: '', generatedAt: 0, firstAt: 0, lastAt: 0, archived: false, partial: false, limited: false, uniqueTracks: 0, activeDays: 0, streak: 0, seconds: 0, plays: 0, completed: 0, skipped: 0, tracks: [], artists: [], days: [], hours: [], sources: [] }
const report = computed(() => snapshot.value ?? emptyReport)
const taste = shallowRef<SoftwarePreference[]>([])
const busy = ref(false)
const loading = ref(false)
const error = ref('')
const showDislikes = ref(false)
const contentElement = ref<HTMLElement | null>(null)
let revision = 0
let disposed = false
const tabs = computed(() => ([{ id: 'overview', name: t('listening__overview') }, { id: 'reports', name: t('listening__reports') }, { id: 'preferences', name: t('listening__preferences') }] as Array<{ id: Tab, name: string }>))
const periods = computed(() => [...new Set([currentDate.value.slice(0, periodKind.value == 'month' ? 7 : 4), ...(overview.value?.periods ?? [])])].filter(value => value.length == (periodKind.value == 'month' ? 7 : 4)).sort().reverse())
const formatDate = (time: number) => listeningDate(time).replaceAll('-', '.')
const formatPeriod = (value: string) => value.length == 4 ? t('listening__year_label', { year: value }) : t('listening__month_label', { year: value.slice(0, 4), month: Number(value.slice(5)) })
const formatBytes = (bytes: number) => bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(2) + ' MB'
const sourceName = (source: string) => {
  return source == 'local' ? t('listening__local_source') : sourceNames.value[source as LX.OnlineSource] ?? source
}
const basisName = (basis: PreferenceBasis) => basis == 'complete' ? t('listening__basis_complete') : basis == 'repeat' ? t('listening__basis_repeat') : t('listening__basis_time')
const favoriteHour = computed(() => listeningHourRange(report.value.hours))
const artistMax = computed(() => Math.max(1, ...(report.value?.artists.map(item => item.seconds) ?? [])))
const activity = computed(() => {
  const value = report.value
  if (!value) return []
  const year = Number(value.period.slice(0, 4))
  const monthly = value.period.length == 7
  const month = monthly ? Number(value.period.slice(5)) : 1
  const count = monthly ? new Date(year, month, 0).getDate() : 12
  return Array.from({ length: count }, (_, index) => {
    const key = value.period + '-' + String(index + 1).padStart(2, '0')
    return { key, label: key, short: index + 1, showLabel: !monthly || index % 5 == 0 || index == count - 1, seconds: value.days.filter(day => monthly ? day.date == key : day.date.startsWith(key)).reduce((sum, day) => sum + day.seconds, 0) }
  })
})
const activityMax = computed(() => Math.max(1, ...activity.value.map(item => item.seconds)))

const loadContent = async() => {
  const token = ++revision
  loading.value = true
  error.value = ''
  try {
    if (tab.value == 'preferences') {
      const history = await getListening()
      if (disposed || token != revision) return
      taste.value = buildSoftwareProfile([], history).seeds.slice(0, 12)
    } else {
      const result = await getListeningReport(period.value)
      if (disposed || token != revision) return
      snapshot.value = result
    }
  } catch { if (!disposed && token == revision) error.value = t('listening__error') } finally { if (!disposed && token == revision) loading.value = false }
}
const reload = async() => {
  error.value = ''
  try {
    const result = await refreshListening()
    if (disposed) return
    overview.value = result
    currentDate.value = listeningDate(Date.now())
    await loadContent()
  } catch { if (!disposed) error.value = t('listening__error') }
}
const choosePeriod = () => {
  const current = currentDate.value.slice(0, periodKind.value == 'month' ? 7 : 4)
  period.value = tab.value == 'reports' ? periods.value.find(value => value < current) ?? current : current
}
const switchKind = (kind: 'month' | 'year') => { periodKind.value = kind; choosePeriod() }
const switchTab = (value: Tab) => { tab.value = value; if (value != 'preferences') choosePeriod() }
watch([period, tab], () => {
  if (contentElement.value) contentElement.value.scrollTop = 0
  snapshot.value = null
  void loadContent()
})
const change = async(command: ListeningCommand) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await changeListening(command)
    if (disposed) return
    overview.value = result
    await loadContent()
  } catch { if (!disposed) error.value = t('listening__error') } finally { busy.value = false }
}
const confirmChange = async(type: 'clear' | 'resetPreferences') => {
  const confirmed = await dialog.confirm(t(type == 'clear' ? 'listening__clear_confirm' : 'listening__reset_confirm'))
  if (confirmed && !disposed) await change({ type })
}
void reload()
onBeforeUnmount(() => { disposed = true; revision++; snapshot.value = null; taste.value = [] })
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.page { display: flex; flex-direction: column; box-sizing: border-box; padding: 10px 24px 0; }
.tabs .refresh { margin-left: auto; color: var(--color-primary); }
.page button { cursor: pointer; background: none; border: 0; font: inherit; &:disabled { opacity: .45; cursor: default; } &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; } }
.tabs { display: flex; gap: 26px; border-bottom: 1px solid var(--color-primary-alpha-800); button { padding: 0 0 11px; font-size: 14px; color: var(--color-600); border-bottom: 2px solid transparent; } button.selected { color: var(--color-primary); border-color: var(--color-primary); } }
.content { overflow-y: auto; min-height: 0; flex: 1; padding: 18px 8px 26px 0; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 18px; select { border: 0; border-bottom: 1px solid var(--color-primary-alpha-700); background: transparent; color: var(--color-font); padding: 6px; font: inherit; option { background: var(--color-content-background); } } }
.segment { display: flex; gap: 2px; background: var(--color-primary-alpha-900); padding: 3px; border-radius: 8px; button { padding: 5px 12px; color: var(--color-600); border-radius: 6px; &.chosen { background: var(--color-primary-alpha-700); color: var(--color-font); } } }
.filters .shareEntry { color: var(--color-primary); font-size: 12px; padding: 7px 12px; border: 1px solid var(--color-primary-alpha-500); border-radius: 7px; }
.periodState { color: var(--color-500); margin-left: auto; font-size: 11px; }
.hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 26px 30px; border-radius: 16px; background: linear-gradient(115deg, var(--color-primary-alpha-800), var(--color-primary-alpha-900), transparent); border: 1px solid var(--color-primary-alpha-800); overflow: hidden; }
.heroText { min-width: 0; h2 { font-size: 19px; margin: 10px 0 8px; line-height: 1.5; font-weight: 600; } p { color: var(--color-600); font-size: 12px; line-height: 1.7; } .eyebrow { color: var(--color-primary); font-size: 10px; letter-spacing: 2px; } }
.bigNumber { font-size: 56px; letter-spacing: -2px; font-weight: 700; line-height: 1.3; font-variant-numeric: tabular-nums; span { font-size: 12px; letter-spacing: 0; margin-left: 12px; font-weight: 400; color: var(--color-600); } }
.heroAside { display: flex; flex-direction: column; text-align: center; color: var(--color-600); font-size: 11px; padding: 0 20px; strong { font-size: 34px; color: var(--color-primary); font-weight: 600; padding: 8px; } }
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); margin: 22px 0 28px; div { display: flex; flex-direction: column; gap: 7px; padding-left: 20px; border-left: 1px solid var(--color-primary-alpha-700); &:first-child { padding-left: 0; border: 0; } } strong { font-size: 23px; font-weight: 600; } span { color: var(--color-600); font-size: 11px; } }
.sectionHeading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 18px; h3 { font-size: 14px; font-weight: 600; } > span { color: var(--color-500); font-size: 10px; } }
.activity { margin: 14px 0 28px; }
.bars { display: flex; align-items: end; gap: 5px; height: 108px; padding: 0 0 22px; > div { position: relative; display: flex; flex: 1; align-items: end; height: 100%; min-width: 0; i { width: 100%; border-radius: 3px 3px 0 0; background: var(--color-primary-alpha-400); min-height: 2px; &.silent { background: var(--color-primary-alpha-800); } } span { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--color-500); } } }
.columns { display: grid; grid-template-columns: 1.1fr 1fr; gap: 34px; padding-top: 20px; border-top: 1px solid var(--color-primary-alpha-800); }
.ranking { li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--color-primary-alpha-900); min-width: 0; } div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; strong, span { .mixin-ellipsis-1(); } strong { font-size: 12px; } span { color: var(--color-600); font-size: 10px; } } small { color: var(--color-600); font-size: 10px; flex: none; } }
.rank { font-size: 11px; color: var(--color-primary); width: 19px; }
.artists { li { padding: 10px 0; > div { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; } span { .mixin-ellipsis-1(); } small { font-size: 10px; color: var(--color-600); flex: none; } i { display: block; height: 3px; margin-top: 9px; border-radius: 4px; background: var(--color-primary-alpha-500); max-width: 100%; } } }
.timeInsight { margin: 24px 0 16px; span, strong { display: block; } span { font-size: 11px; color: var(--color-600); } strong { font-size: 21px; font-weight: 500; margin: 12px 0; } p { font-size: 11px; color: var(--color-600); line-height: 1.6; } }
.sources { display: flex; gap: 10px; flex-wrap: wrap; span { font-size: 10px; color: var(--color-600); padding: 5px 0; b { color: var(--color-primary); font-weight: 500; } } }
.hint, .notice { font-size: 11px; color: var(--color-600); line-height: 1.8; margin: 12px 0; }
.notice { color: var(--color-primary); }
.explanation { font-size: 11px; color: var(--color-600); line-height: 1.8; margin-top: 18px; summary { cursor: pointer; } p { padding-top: 10px; } }
.empty { padding: 55px 16px; text-align: center; color: var(--color-600); > svg { width: 40px; height: 40px; color: var(--color-primary); } h2 { font-size: 18px; margin: 18px 0 10px; } p { font-size: 12px; line-height: 1.8; } a { display: inline-block; color: var(--color-primary); margin-top: 20px; } }
.preferenceRow { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--color-primary-alpha-800); h3 { font-size: 13px; font-weight: 600; margin-bottom: 7px; } p { color: var(--color-600); line-height: 1.8; font-size: 11px; max-width: 560px; } > button { flex: none; } }
.page .toggle { flex: none; width: 36px; height: 21px; padding: 3px; border-radius: 20px; background: var(--color-300); i { display: block; width: 15px; height: 15px; border-radius: 50%; background: var(--color-content-background); } &.on { background: var(--color-primary); i { transform: translateX(15px); } } }
.taste { padding: 26px 0 12px; }
.preferenceTracks { li { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--color-primary-alpha-900); } div { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; strong { font-size: 12px; .mixin-ellipsis-1(); } span { font-size: 10px; color: var(--color-600); .mixin-ellipsis-1(); } } button { flex: none; color: var(--color-primary); font-size: 11px; } small { font-size: 10px; color: var(--color-600); } }
.ignoredHeading { font-size: 13px; font-weight: 600; margin: 26px 0 10px; }
.storage { padding-top: 26px; p { color: var(--color-600); font-size: 11px; line-height: 1.8; margin-bottom: 10px; } button { margin-top: 8px; } }
@media (max-width: 900px) { .page { padding-left: 18px; padding-right: 16px; } .columns { gap: 20px; } .hero { padding: 20px; } .bigNumber { font-size: 44px; } }
@media (max-width: 720px) { .columns { grid-template-columns: 1fr; } .metrics div { padding-left: 10px; } }
</style>
