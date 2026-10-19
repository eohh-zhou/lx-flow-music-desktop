<template>
  <div :class="$style.container">
    <BilibiliDiscovery :tag-id="tagId" :sort-id="sortId" :page="page">
      <template #actions>
        <base-btn outline min @click="visibleOpenSongListModal = true">{{ $t('songlist__import_input_show_btn') }}</base-btn>
      </template>
    </BilibiliDiscovery>
    <OpenListModal v-model="visibleOpenSongListModal" :source-list="sourceList" default-source="bili" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from '@common/utils/vueTools'
import { useRoute } from '@common/utils/vueRouter'
import { useI18n } from '@renderer/plugins/i18n'
import { setVisibleListDetail } from '@renderer/store/songList/action'
import { biliBrowseSession } from '@renderer/store/songList/bilibili'
import BilibiliDiscovery from '@renderer/views/songList/List/components/BilibiliDiscovery.vue'
import OpenListModal from '@renderer/views/songList/List/components/OpenListModal.vue'

const route = useRoute()
const t = useI18n()
const visibleOpenSongListModal = ref(false)
const sourceList = computed(() => [{ id: 'bili', name: t('source_bili') }])
const tagId = computed(() => typeof route.query.tagId == 'string' ? route.query.tagId : biliBrowseSession.tagId)
const sortId = computed(() => {
  const sort = typeof route.query.sortId == 'string' ? route.query.sortId : biliBrowseSession.sortId
  return ['hot', 'new'].includes(sort) ? sort : 'hot'
})
const page = computed(() => {
  const value = typeof route.query.page == 'string' ? Number(route.query.page) : biliBrowseSession.page
  return Number.isInteger(value) && value >= 1 && value <= 50 ? value : 1
})

setVisibleListDetail(false)
</script>

<style lang="less" module>
.container {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
