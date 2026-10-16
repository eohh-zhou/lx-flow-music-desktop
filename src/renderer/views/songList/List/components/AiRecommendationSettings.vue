<template>
  <material-modal :show="modelValue" teleport="#view" width="560px" max-height="92%" @close="emit('update:model-value', false)">
    <div :class="$style.content">
      <div :class="$style.fields" class="scroll">
      <h2>{{ $t('ai_recommend__settings') }}</h2>
      <p>{{ $t('ai_recommend__settings_tip') }}</p>
      <label>
        <span>{{ $t('ai_recommend__base_url') }}</span>
        <base-input v-model="baseUrl" placeholder="https://your-service.example/v1" :disabled="busy" :auto-paste="false" />
      </label>
      <label>
        <span>{{ $t('ai_recommend__model') }}</span>
        <base-input v-model="model" :placeholder="$t('ai_recommend__model_placeholder')" :disabled="busy" :auto-paste="false" />
      </label>
      <label>
        <span>API Key</span>
        <base-input v-model="apiKey" type="password" :placeholder="$t(hasKey ? 'ai_recommend__key_saved' : 'ai_recommend__key_placeholder')" :disabled="busy" :auto-paste="false" autocomplete="new-password" />
      </label>
      <p :class="$style.status" role="status">{{ status ? $t(status) : '' }}</p>
      </div>
      <div :class="$style.buttons">
        <base-btn min :disabled="busy" @click="save(false)">{{ $t('ai_recommend__save') }}</base-btn>
        <base-btn min :disabled="busy" @click="save(true)">{{ $t('ai_recommend__test') }}</base-btn>
        <base-btn min outline :disabled="busy" @click="clear">{{ $t('ai_recommend__clear') }}</base-btn>
      </div>
    </div>
  </material-modal>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from '@common/utils/vueTools'
import { cancelAiRecommendation, createAiJobId, getAiRecommendConfig, getRecommendationError, setAiRecommendConfig, testAiRecommendConnection } from '@renderer/utils/aiRecommendation'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits(['update:model-value'])
const baseUrl = ref('')
const model = ref('')
const apiKey = ref('')
const hasKey = ref(false)
const status = ref('')
const busy = ref(false)
let version = 0
const activeJob = { id: '' }

watch(() => props.modelValue, async(visible) => {
  const current = ++version
  apiKey.value = ''
  status.value = ''
  if (!visible) {
    if (activeJob.id) void cancelAiRecommendation(activeJob.id).catch(() => {})
    return
  }
  busy.value = true
  try {
    const config = await getAiRecommendConfig()
    if (current != version) return
    baseUrl.value = config.baseUrl
    model.value = config.model
    hasKey.value = config.hasKey
  } catch (error) {
    if (current == version) status.value = getRecommendationError(error)
  } finally {
    if (current == version) busy.value = false
  }
}, { immediate: true })

const save = async(test: boolean) => {
  if (busy.value) return
  const current = version
  let testJob = ''
  busy.value = true
  status.value = 'ai_recommend__saving'
  try {
    const config = await setAiRecommendConfig({ baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value })
    if (current != version) return
    baseUrl.value = config.baseUrl
    hasKey.value = config.hasKey
    apiKey.value = ''
    if (test) {
      status.value = 'ai_recommend__testing'
      testJob = activeJob.id = createAiJobId()
      await testAiRecommendConnection(testJob)
    }
    if (current == version) status.value = test ? 'ai_recommend__test_ok' : 'ai_recommend__saved'
  } catch (error) {
    if (current == version) status.value = getRecommendationError(error)
  } finally {
    if (activeJob.id == testJob) activeJob.id = ''
    if (current == version) busy.value = false
  }
}

const clear = async() => {
  if (busy.value) return
  busy.value = true
  const current = version
  try {
    await setAiRecommendConfig({ baseUrl: '', model: '', clearKey: true })
    if (current != version) return
    baseUrl.value = model.value = apiKey.value = ''
    hasKey.value = false
    status.value = 'ai_recommend__cleared'
  } catch (error) {
    if (current == version) status.value = getRecommendationError(error)
  } finally {
    if (current == version) busy.value = false
  }
}

onBeforeUnmount(() => {
  version++
  apiKey.value = ''
  if (activeJob.id) void cancelAiRecommendation(activeJob.id).catch(() => {})
})
</script>

<style lang="less" module>
.content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  max-height: min(65vh, calc(100vh - 280px));
  box-sizing: border-box;
  h2 { font-size: 19px; margin-bottom: 12px; }
  p { font-size: 12px; line-height: 1.6; color: var(--color-font-label); }
  label { display: flex; flex-direction: column; gap: 7px; margin-top: 16px; font-size: 13px; }
  input { width: 100%; box-sizing: border-box; }
}
.fields { flex: 1; min-height: 0; overflow-y: auto; }
.status { min-height: 38px; padding-top: 12px; }
.buttons { flex: none; display: flex; flex-wrap: wrap; gap: 10px; padding-top: 12px; }
</style>
