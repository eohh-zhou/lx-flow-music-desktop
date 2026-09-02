<template>
  <div :class="$style.container">
    <div v-if="searchKeyword" :class="$style.searchBar">
      <svg :class="$style.searchBarIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 30.239 30.239" space="preserve">
        <use xlink:href="#icon-search" />
      </svg>
      <span :class="$style.searchBarText">{{ $t('search__scope_filter_tip', { kw: searchKeyword }) }}</span>
      <button :class="$style.searchBarClear" :title="$t('search__clear_filter')" @click="clearScopeSearch">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-close" />
        </svg>
      </button>
    </div>
    <div :class="$style.songListHeader">
      <div :class="$style.songListHeaderLeft" :style="{ backgroundImage: 'url('+(picUrl || listDetailInfo.info.img)+')' }">
        <!-- <span v-if="listDetailInfo.info.play_count" :class="$style.playNum">{{ listDetailInfo.info.play_count }}</span> -->
      </div>
      <div :class="$style.songListHeaderMiddle">
        <h3 :title="listDetailInfo.info.name">{{ listDetailInfo.info.name }}</h3>
        <p :title="listDetailInfo.info.desc">{{ listDetailInfo.info.desc }}</p>
      </div>
      <div :class="$style.songListHeaderRight">
        <base-btn
          :class="$style.headerRightBtn"
          :disabled="!!listDetailInfo.noItemLabel"
          @click="playSongListDetail(listDetailInfo.id, listDetailInfo.source, listDetailInfo.list)"
        >
          {{ $t('list__play') }}
        </base-btn>
        <base-btn
          :class="$style.headerRightBtn"
          :disabled="!!listDetailInfo.noItemLabel"
          @click="addSongListDetail(listDetailInfo.id, listDetailInfo.source, listDetailInfo.info.name)"
        >
          {{ $t('list__collect') }}
        </base-btn>
        <base-btn :class="$style.headerRightBtn" @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
    </div>
    <div :class="$style.list">
      <material-online-list
        ref="listRef"
        :page="listDetailInfo.page"
        :limit="listDetailInfo.limit"
        :total="listDetailInfo.total"
        :list="displayList"
        :no-item="listDetailInfo.noItemLabel"
        @play-list="handlePlayListScoped"
        @toggle-page="togglePage"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { computed, ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { listDetailInfo } from '@renderer/store/songList/state'
import { setVisibleListDetail } from '@renderer/store/songList/action'
import { addSongListDetail, playSongListDetail } from './action'
import useList from './useList'
import useKeyBack from './useKeyBack'


const source = ref<LX.OnlineSource>('kw')
const id = ref<string>('')
const page = ref<number>(1)
const picUrl = ref<string>('')
const refresh = ref<boolean>(false)


interface Query {
  source?: string
  id?: string
  page?: string
  picUrl?: string
  refresh?: 'true'
  fromName?: string
}

const verifyQueryParams = async function(this: any, to: { query: Query, path: string }, from: any, next: (route?: { path: string, query: Query }) => void) {
  let _source = to.query.source
  let _id = to.query.id
  let _page: string | undefined = to.query.page
  let _picUrl: string | undefined = to.query.picUrl
  let _refresh: 'true' | undefined = to.query.refresh

  if (_source == null || _id == null) {
    if (listDetailInfo.key) {
      _source = listDetailInfo.source
      _id = listDetailInfo.id
      _page = listDetailInfo.page.toString()
      _picUrl = listDetailInfo.info.img
    } else {
      setVisibleListDetail(false)
      next({ path: '/songList/list', query: {} })
      return
    }

    next({
      path: to.path,
      query: { ...to.query, source: _source, id: _id, page: _page, picUrl: _picUrl, refresh: _refresh },
    })
    return
  }
  next()
  setVisibleListDetail(true)
  source.value = _source as LX.OnlineSource
  id.value = _id
  page.value = _page ? parseInt(_page) : 1
  picUrl.value = _picUrl ?? ''
  refresh.value = _refresh ? _refresh == 'true' : false
  if (to.query.fromName) window.lx.songListInfo.fromName = to.query.fromName
}


export default {
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const route = useRoute()
    const router = useRouter()

    const {
      listRef,
      listDetailInfo,
      getListData,
      handlePlayList,
    } = useList()

    const searchKeyword = computed(() => typeof route.query.search === 'string' ? route.query.search : '')
    // 过滤态下同时记录「展示索引 -> 原始索引」映射，play-list 事件需要回查原始索引
    const displayData = computed(() => {
      const kw = searchKeyword.value.trim().toLowerCase()
      if (!kw) return null
      const items: LX.Music.MusicInfoOnline[] = []
      const indexes: number[] = []
      listDetailInfo.list.forEach((m: LX.Music.MusicInfoOnline, i: number) => {
        if ((m.name || '').toLowerCase().includes(kw) ||
            (m.singer || '').toLowerCase().includes(kw) ||
            (m.meta?.albumName || '').toLowerCase().includes(kw)) {
          items.push(m)
          indexes.push(i)
        }
      })
      return { items, indexes }
    })
    const displayList = computed(() => displayData.value ? displayData.value.items : listDetailInfo.list)
    // material-online-list 内部操作均基于传入的 displayList（索引一致），
    // 唯独 play-list 由 useList 按原始 listDetailInfo.list 播放，需要映射回原始索引
    const handlePlayListScoped = (index: number) => {
      const map = displayData.value?.indexes
      handlePlayList(map ? map[index] : index)
    }
    const clearScopeSearch = () => {
      const newQuery = { ...route.query }
      delete newQuery.search
      void router.replace({ path: route.path, query: newQuery }).catch(() => {})
    }


    const togglePage = (page: number) => {
      void getListData(source.value, id.value, page, refresh.value)
    }

    const handleBack = () => {
      setVisibleListDetail(false)
      if (window.lx.songListInfo.fromName) void router.replace({ name: window.lx.songListInfo.fromName })
      else router.back()
    }

    useKeyBack(handleBack)

    watch([source, id, page, refresh], async([_source, _id, _page, _refresh]) => {
      if (!_source || !_id) return router.replace({ path: '/songList/list' })
      // console.log(_source, _id, _page, _refresh, picUrl.value)
      // source.value = _source
      // id.value = _id
      // refresh.value = _refresh
      // page.value = _page ?? 1
      void getListData(_source, _id, _page, _refresh)
    }, {
      immediate: true,
    })

    return {
      source,
      id,
      page,
      picUrl,
      listDetailInfo,
      listRef,
      togglePage,
      addSongListDetail,
      playSongListDetail,
      handlePlayList,
      handlePlayListScoped,
      handleBack,
      searchKeyword,
      displayList,
      clearScopeSearch,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  // position: absolute;
  // left: 0;
  // top: 0;
  // width: 100%;
  // height: 100%;
  display: flex;
  flex-flow: column nowrap;
}

.searchBar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 5px 15px 0;
  padding: 6px 16px;
  border-radius: @radius-border;
  background-color: var(--color-050);
  border-bottom: 1px solid var(--color-100);
  font-size: 12.5px;
  color: var(--color-font);
  user-select: none;
}
.searchBarIcon {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}
.searchBarText {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.searchBarClear {
  flex: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--color-450);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: @transition-fast;
  transition-property: background-color, color;
  svg { width: 12px; height: 12px; }
  &:hover {
    color: var(--color-primary);
    background-color: var(--color-100);
  }
}

.songListHeader {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  height: 80px;
}
.songListHeaderLeft {
  flex: none;
  margin-left: 15px;
  height: 100%;
  aspect-ratio: 1 / 1;
  position: relative;
  overflow: hidden;
  border-radius: @radius-border;
  background-position: center;
  background-size: cover;
  box-shadow: var(--shadow-card);
}
.playNum {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px;
  background-color: rgba(0, 0, 0, 0.4);
  color: #fff;
  font-size: 12px;
  text-align: right;
  .mixin-ellipsis-1();
}

.songListHeaderMiddle {
  flex: auto;
  padding: 2px 7px;
  min-width: 0;
  h3 {
    .mixin-ellipsis-1();
    line-height: 1.2;
    padding-bottom: 5px;
    color: var(--color-font);
  }
  p {
    .mixin-ellipsis(3);
    font-size: 12px;
    line-height: 1.2;
    color: var(--color-font-label);
  }
}
.songListHeaderRight {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 15px;

  .headerRightBtn {
    border-radius: @radius-round;
  }
}

.list {
  position: relative;
  width: 100%;
  min-height: 0;
  flex: auto;
  height: 100%;
}
</style>

