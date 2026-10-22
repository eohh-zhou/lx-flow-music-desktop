<template>
  <section :class="$style.report" :aria-label="$t('listening__reports')" ignore-tip>
    <div :class="$style.preview" :aria-busy="generating">
      <img v-if="imageUrl" :src="imageUrl" :alt="$t('listening__share_preview', { period: report.period, hours: hours(report.seconds) })">
      <p v-else role="status">{{ $t(generating ? 'listening__share_generating' : 'listening__share_error') }}</p>
    </div>
    <aside :class="$style.actions">
      <p :class="$style.eyebrow">{{ report.period }} · LX FLOW</p>
      <h2>{{ $t('listening__share_title') }}</h2>
      <p :class="$style.intro">{{ $t('listening__report_intro') }}</p>
      <dl :class="$style.summary">
        <div><dt>{{ $t('listening__hours') }}</dt><dd>{{ hours(report.seconds) }}</dd></div>
        <div><dt>{{ $t('listening__active_days') }}</dt><dd>{{ report.activeDays }}</dd></div>
        <div><dt>{{ $t('listening__unique') }}</dt><dd>{{ report.uniqueTracks }}{{ report.limited ? '+' : '' }}</dd></div>
      </dl>
      <label :class="$style.option"><input v-model="includeNames" type="checkbox" :disabled="exporting">{{ $t('listening__include_names') }}</label>
      <div :class="$style.buttons">
        <button type="button" :class="$style.primary" :disabled="!imageUrl || generating || exporting" @click="save">{{ $t(exporting ? 'listening__share_saving' : 'listening__share_save') }}</button>
        <button type="button" :disabled="!imageUrl || generating || exporting" @click="copy">{{ $t('listening__share_copy') }}</button>
      </div>
      <p :class="$style.format">PNG · 1080 × 1440</p>
      <p v-if="message" :class="$style.message" :role="failed ? 'alert' : 'status'">{{ message }}</p>
      <button v-if="failed && !imageUrl" type="button" :class="$style.retry" @click="generate">{{ $t('listening__share_retry') }}</button>
      <p :class="$style.note">{{ $t('listening__share_hint') }}</p>
      <button type="button" :class="$style.details" @click="$emit('overview')">{{ $t('listening__view_details') }} →</button>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from '@common/utils/vueTools'
import type { ListeningReport } from '@common/types/listening'
import { useI18n } from '@renderer/plugins/i18n'
import { buildListeningShareModel, formatListeningHours as hours } from './report'
import { renderListeningShareImage } from './shareImage'
import { copyListeningShareImage, saveListeningShareImage } from './shareExport'

const props = defineProps<{ report: ListeningReport }>()
defineEmits<(event: 'overview') => void>()
const t = useI18n()
const includeNames = ref(true)
const imageUrl = ref('')
const generating = ref(false)
const exporting = ref(false)
const message = ref('')
const failed = ref(false)
const model = computed(() => buildListeningShareModel(props.report, t, includeNames.value))
let revision = 0
let disposed = false

const generate = async() => {
  const token = ++revision
  imageUrl.value = ''
  message.value = ''
  failed.value = false
  generating.value = true
  const snapshot = model.value
  try {
    await document.fonts.ready
    if (disposed || token != revision) return
    imageUrl.value = renderListeningShareImage(snapshot)
  } catch {
    if (!disposed && token == revision) { failed.value = true; message.value = t('listening__share_error') }
  } finally { if (!disposed && token == revision) generating.value = false }
}
watch(model, generate, { immediate: true })

const save = async() => {
  if (!imageUrl.value || generating.value || exporting.value) return
  const token = revision
  const dataUrl = imageUrl.value
  const period = props.report.period
  exporting.value = true
  message.value = ''
  failed.value = false
  try {
    const saved = await saveListeningShareImage(dataUrl, period, t('listening__share_save'))
    if (!disposed && token == revision && saved) message.value = t('listening__share_saved')
  } catch {
    if (!disposed && token == revision) { failed.value = true; message.value = t('listening__share_error') }
  } finally { exporting.value = false }
}
const copy = () => {
  if (!imageUrl.value || generating.value || exporting.value) return
  message.value = ''
  failed.value = false
  try { copyListeningShareImage(imageUrl.value); message.value = t('listening__share_copied') } catch {
    failed.value = true
    message.value = t('listening__share_error')
  }
}
onBeforeUnmount(() => { disposed = true; revision++; imageUrl.value = '' })
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.report { display: grid; grid-template-columns: minmax(250px, 1.25fr) minmax(215px, 1fr); gap: 30px; align-items: start; }
.preview { overflow: hidden; border-radius: 12px; background: #faf7f3; box-shadow: 0 10px 32px rgba(0, 0, 0, .12); aspect-ratio: 3 / 4; img { display: block; width: 100%; height: auto; } > p { padding: 28px; color: #777079; font-size: 13px; } }
.actions { padding: 15px 0; min-width: 0; h2 { font-size: 24px; font-weight: 600; line-height: 1.4; margin: 12px 0; } }
.eyebrow { font-size: 10px; letter-spacing: 1.6px; color: var(--color-primary); }
.intro, .note { font-size: 12px; line-height: 1.9; color: var(--color-600); }
.summary { display: flex; flex-wrap: wrap; gap: 18px; padding: 22px 0; div { display: flex; flex-direction: column-reverse; gap: 8px; } dt { color: var(--color-600); font-size: 11px; } dd { font-size: 25px; font-weight: 600; } }
.option { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 1.5; cursor: pointer; margin: 8px 0 18px; input { accent-color: var(--color-primary); } }
.actions .buttons { display: flex; gap: 10px; flex-wrap: wrap; button { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--color-primary-alpha-500); font-size: 12px; color: var(--color-primary); &.primary { background: var(--color-primary); color: #fff; border-color: transparent; } } }
.format { font-size: 10px; color: var(--color-500); margin: 12px 0 20px; }
.message { font-size: 12px; line-height: 1.6; color: var(--color-primary); margin-bottom: 12px; overflow-wrap: anywhere; }
.actions .details, .actions .retry { font-size: 12px; color: var(--color-primary); margin-top: 18px; padding: 6px 0; }
@media (max-width: 1000px) { .report { grid-template-columns: minmax(240px, 1fr) minmax(195px, 1fr); gap: 20px; } .actions h2 { font-size: 20px; } }
@media (max-width: 960px) { .report { grid-template-columns: 1fr; } .preview { max-width: 420px; } .actions { grid-row: 1; } .summary { padding: 12px 0; } }
</style>
