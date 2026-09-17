<template>
  <div :class="$style.container">
    <div v-show="!listInfo.noItemLabel" ref="listRef" :class="$style.listContent" class="scroll">
      <ul>
        <li v-for="item in listInfo.list" :key="item.source + '_' + item.id" :class="$style.item" @click="toDetail(item)">
          <div :class="$style.image">
            <img v-if="item.img" :class="$style.img" loading="lazy" decoding="async" :src="item.img">
          </div>
          <h4 :class="$style.title">{{ item.name }}</h4>
          <p :class="$style.meta">
            <span v-if="item.author">{{ item.author }}</span>
            <span v-if="item.time">{{ item.time }}</span>
            <span v-if="item.songCount">{{ $t('search__album_songs', { num: item.songCount }) }}</span>
            <span v-if="sourceId == 'all'">{{ item.source }}</span>
          </p>
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
import useList, { type SearchSource } from './useList'
import type { AlbumInfoItem } from '@renderer/store/search/album'

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

const toDetail = (info: AlbumInfoItem) => {
  void router.push({
    path: '/songList/detail',
    query: {
      source: info.source,
      id: `album_${info.id}`,
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
  padding: 18px 20px 0;

  > ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 24px 20px;
  }
}
.item {
  min-width: 0;
  cursor: pointer;
}
.image {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  overflow: hidden;
  background-color: var(--color-100);
  box-shadow: var(--shadow-card);
  transition: transform @transition-normal, box-shadow @transition-normal;
}
.img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform @transition-normal;
}
.title {
  margin-top: 9px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-font);
  transition: color @transition-fast;
  .mixin-ellipsis-2();
}
.meta {
  margin-top: 4px;
  display: flex;
  flex-flow: row nowrap;
  gap: 6px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
.item:hover {
  .image {
    transform: translateY(-4px);
    box-shadow: var(--shadow-card-hover);
  }
  .img {
    transform: scale(1.05);
  }
  .title {
    color: var(--color-primary);
  }
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
