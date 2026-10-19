<template>
  <div :class="$style.container">
    <div :class="$style.controls">
      <base-tab :model-value="mode" :list="modes" item-label="name" @change="changeMode" />
      <div v-if="$slots.actions" :class="$style.actions"><slot name="actions" /></div>
    </div>
    <div :class="$style.controls">
      <base-selection :model-value="tagId" :list="categories" item-key="id" item-name="name" @update:model-value="changeCategory" />
      <base-btn min outline :disabled="loading || page <= 1" @click="changePage(page - 1)">{{ $t('bilibili__previous_batch') }}</base-btn>
      <base-btn min :disabled="loading || !hasMore" @click="changePage(page + 1)">{{ $t('bilibili__next_batch') }}</base-btn>
      <base-btn min outline :disabled="loading" @click="loadBrowse(true)">{{ $t('bilibili__refresh') }}</base-btn>
    </div>
    <p v-if="loading && info.list.length" :class="$style.tip" role="status">{{ $t('bilibili__loading_more', { count: info.list.length }) }}</p>
    <p v-if="notice" :class="$style.notice" role="status">{{ $t(notice) }}</p>
    <SongList :class="$style.cards" :list-info="info" hide-pagination />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowReactive, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { discoveryCategories, discoverPlaylists } from '@renderer/utils/musicSdk/bili/discovery'
import { getRecommendationError } from '@renderer/utils/aiRecommendation'
import { biliBrowseSession } from '@renderer/store/songList/bilibili'
import type { ListInfo } from '@renderer/store/songList/state'
import { useI18n } from '@renderer/plugins/i18n'
import SongList from './SongList.vue'

const props = defineProps<{ tagId: string, sortId: string, page: number }>()
const router = useRouter()
const route = useRoute()
const t = useI18n()
const mode = computed(() => ['hot', 'new'].includes(props.sortId) ? props.sortId : 'hot')
const modes = computed(() => (['hot', 'new'] as const).map(id => ({ id, name: t(`bilibili__mode_${id}`) })))
const categories = computed(() => discoveryCategories.map(item => ({ id: item.id, name: t(`bilibili__category_${item.label}` as Parameters<typeof t>[0]) })))
const loading = ref(false)
const notice = ref('')
const hasMore = ref(false)
const info = shallowReactive<ListInfo>({ list: [], source: 'bili', total: 0, page: 1, limit: 20, key: null, tagId: '', sortId: 'hot', noItemLabel: '' })
let controller: AbortController | null = null
let version = 0
let browseKey = ''

const stop = () => {
  version++
  controller?.abort()
  controller = null
}
const rememberPage = () => {
  Object.assign(biliBrowseSession, { tagId: props.tagId, sortId: mode.value, page: props.page })
}
const navigate = (sortId: string, tagId: string, page = 1) => {
  void router.replace({ path: route.path, query: { sortId, tagId, page } })
}
const changeMode = (id: string) => {
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

watch(() => [mode.value, props.tagId, props.page], () => {
  stop()
  loading.value = false
  rememberPage()
  void loadBrowse()
}, { immediate: true })

onBeforeUnmount(stop)
</script>

<style lang="less" module>
.container { flex: auto; min-height: 0; display: flex; flex-direction: column; }
.controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 5px 12px; font-size: 12px; }
.actions { margin-left: auto; }
.tip, .notice { font-size: 12px; line-height: 1.6; color: var(--color-font-label); padding: 5px 12px; }
.notice { color: var(--color-primary-font); }
.cards { flex: auto; min-height: 0; }
</style>
