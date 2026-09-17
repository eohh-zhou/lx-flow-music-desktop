<template>
  <div :class="$style.container">
    <div v-show="!listInfo.noItemLabel" ref="listRef" :class="$style.listContent" class="scroll">
      <ul>
        <li v-for="item in listInfo.list" :key="item.source + '_' + item.id" :class="$style.item" @click="toDetail(item)">
          <div :class="$style.avatar">
            <img v-if="item.img" :src="item.img" loading="lazy" decoding="async">
          </div>
          <div :class="$style.info">
            <h4 :class="$style.name">{{ item.name }}</h4>
            <p :class="$style.meta">
              <span v-if="item.alias">{{ item.alias }}</span>
              <span v-if="item.songCount">{{ $t('search__singer_songs', { num: formatCount(item.songCount) }) }}</span>
              <span v-if="item.albumCount">{{ $t('search__singer_albums', { num: formatCount(item.albumCount) }) }}</span>
              <span v-if="item.fansCount">{{ $t('search__singer_fans', { num: formatCount(item.fansCount) }) }}</span>
              <span v-if="sourceId == 'all'">{{ item.source }}</span>
            </p>
          </div>
        </li>
      </ul>
      <div :class="$style.pagination">
        <material-pagination :count="listInfo.total" :limit="listInfo.limit" :page="listInfo.page" @btn-click="togglePage" />
      </div>
    </div>
    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <div v-show="listInfo.noItemLabel" :class="$style.noitem">
        <p v-text="listInfo.noItemLabel" />
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { watch } from '@common/utils/vueTools'
import { searchText } from '@renderer/store/search/state'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { formatPlayCount } from '@renderer/utils'
import useList, { type SearchSource } from './useList'
import type { SingerInfoItem } from '@renderer/store/search/singer'

interface Props {
  sourceId: SearchSource
  page: number
}

const props = defineProps<Props>()
const router = useRouter()
const route = useRoute()

const {
  listRef,
  listInfo,
  search,
} = useList()

const formatCount = (num?: number) => {
  if (!num) return ''
  return formatPlayCount(num)
}

watch(() => [props.sourceId, props.page], ([sourceId, page]) => {
  setTimeout(() => {
    search(searchText.value, sourceId as SearchSource, page as number || 1)
  })
})
watch(searchText, (text) => {
  setTimeout(() => {
    search(text, props.sourceId, props.page)
  })
}, {
  immediate: true,
})

const togglePage = (page: number) => {
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      page,
    },
  })
}

const toDetail = (info: SingerInfoItem) => {
  void router.push({
    path: '/singer/detail',
    query: {
      source: info.source,
      id: info.id,
      name: info.name,
      picUrl: info.img,
      fromName: route.name as string,
    },
  })
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.container {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  padding-top: 5px;
}
.listContent {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  box-sizing: border-box;
  padding: 8px 20px 0;
}
.item {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 14px;
  padding: 10px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color @transition-fast;
  &:hover {
    background-color: var(--color-050);
    .name {
      color: var(--color-primary);
    }
  }
}
.avatar {
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background-color: var(--color-100);
  box-shadow: var(--shadow-card);
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
.info {
  min-width: 0;
  flex: auto;
}
.name {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-font);
  transition: color @transition-fast;
  .mixin-ellipsis-1();
}
.meta {
  margin: 6px 0 0;
  display: flex;
  flex-flow: row wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
.pagination {
  text-align: center;
  padding: 20px 0;
}
.noitem {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;

  p {
    font-size: 24px;
    color: var(--color-font-label);
  }
}
</style>
