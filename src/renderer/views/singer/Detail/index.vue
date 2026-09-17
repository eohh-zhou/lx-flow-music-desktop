<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <div :class="$style.avatar" :style="{ backgroundImage: singerDetailInfo.img ? 'url(' + singerDetailInfo.img + ')' : '' }" />
      <div :class="$style.headerMiddle">
        <h3 :title="singerDetailInfo.name">{{ singerDetailInfo.name }}</h3>
        <p :class="$style.meta">
          <span v-if="singerDetailInfo.songCount">{{ $t('search__singer_songs', { num: formatCount(singerDetailInfo.songCount) }) }}</span>
          <span v-if="singerDetailInfo.albumCount">{{ $t('search__singer_albums', { num: formatCount(singerDetailInfo.albumCount) }) }}</span>
          <span v-if="singerDetailInfo.fansCount">{{ $t('search__singer_fans', { num: formatCount(singerDetailInfo.fansCount) }) }}</span>
        </p>
        <p v-if="singerDetailInfo.desc" :class="$style.desc" :title="singerDetailInfo.desc">{{ singerDetailInfo.desc }}</p>
      </div>
      <div :class="$style.headerRight">
        <base-btn
          :class="$style.headerRightBtn"
          :disabled="!singerDetailInfo.songs.length"
          @click="playSongListDetail('singer_' + singerDetailInfo.id, singerDetailInfo.source, singerDetailInfo.songs)"
        >
          {{ $t('list__play') }}
        </base-btn>
        <base-btn
          :class="$style.headerRightBtn"
          :disabled="!singerDetailInfo.songs.length"
          @click="addSongListDetail('singer_' + singerDetailInfo.id, singerDetailInfo.source, singerDetailInfo.name)"
        >
          {{ $t('list__collect') }}
        </base-btn>
        <base-btn :class="$style.headerRightBtn" @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
    </div>
    <div :class="$style.tabs">
      <base-tab v-model="activeTab" :list="tabs" />
    </div>
    <div :class="$style.list">
      <material-online-list
        v-if="activeTab == 'songs'"
        ref="listRef"
        :page="singerDetailInfo.songPage"
        :limit="singerDetailInfo.songLimit"
        :total="singerDetailInfo.songTotal"
        :list="singerDetailInfo.songs"
        :no-item="singerDetailInfo.songNoItemLabel"
        @play-list="handlePlayList"
        @toggle-page="toggleSongPage"
      />
      <div v-else v-show="!singerDetailInfo.albumNoItemLabel || singerDetailInfo.albums.length" :class="$style.albumContent" class="scroll">
        <ul>
          <li v-for="item in singerDetailInfo.albums" :key="item.id" :class="$style.albumItem" @click="toAlbum(item)">
            <div :class="$style.image">
              <img v-if="item.info.img" :src="item.info.img" loading="lazy" decoding="async">
            </div>
            <h4>{{ item.info.name }}</h4>
            <p>
              <span v-if="item.time">{{ item.time }}</span>
              <span v-if="item.count">{{ $t('search__album_songs', { num: item.count }) }}</span>
            </p>
          </li>
        </ul>
        <div :class="$style.pagination">
          <material-pagination :count="singerDetailInfo.albumTotal" :limit="singerDetailInfo.albumLimit" :page="singerDetailInfo.albumPage" @btn-click="toggleAlbumPage" />
        </div>
      </div>
      <transition v-if="activeTab == 'albums'" enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
        <div v-show="singerDetailInfo.albumNoItemLabel && !singerDetailInfo.albums.length" :class="$style.noitem">
          <p v-text="singerDetailInfo.albumNoItemLabel" />
        </div>
      </transition>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { formatPlayCount } from '@renderer/utils'
import { singerDetailInfo } from '@renderer/store/singer/state'
import { clearSingerDetail, getAndSetSingerAlbums, getAndSetSingerSongs } from '@renderer/store/singer/action'
import { addSongListDetail, playSongListDetail } from '@renderer/views/songList/Detail/action'
import useKeyBack from '@renderer/views/songList/Detail/useKeyBack'
import type { SingerAlbumItem } from '@renderer/store/singer/state'

interface Query {
  source?: string
  id?: string
  name?: string
  picUrl?: string
  fromName?: string
  tab?: string
}

const source = ref<LX.OnlineSource>('kw')
const id = ref('')
const picUrl = ref('')
const singerName = ref('')
const activeTab = ref<'songs' | 'albums'>('songs')
const backName = ref('')
const backQuery = ref<Record<string, string | Array<string | null> | null | undefined> | null>(null)

const verifyQueryParams = async(to: { query: Query, path: string }, from: { name?: unknown, query?: Record<string, unknown> }, next: (route?: { path: string, query: Query }) => void) => {
  let _source = to.query.source
  let _id = to.query.id
  if (_source == null || _id == null) {
    next({ path: '/search', query: {} })
    return
  }
  next()
  source.value = _source as LX.OnlineSource
  id.value = _id
  picUrl.value = to.query.picUrl ?? ''
  singerName.value = to.query.name ?? ''
  if (to.query.tab == 'albums') activeTab.value = 'albums'
  // Returning from album detail must not overwrite the original search back target.
  if (from?.name && from.name !== 'SingerDetail' && from.name !== 'SongListDetail') {
    backName.value = to.query.fromName ?? String(from.name)
    backQuery.value = { ...(from.query as Record<string, string | Array<string | null> | null | undefined> | undefined) }
  } else if (!backName.value && to.query.fromName) {
    backName.value = to.query.fromName
  }
}

const leaveDetail = (to: { name?: unknown }, _from: unknown, next: () => void) => {
  if (to?.name !== 'SongListDetail') clearSingerDetail()
  next()
}

export default {
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  beforeRouteLeave: leaveDetail,
  setup() {
    const router = useRouter()
    const route = useRoute()
    const listRef = ref<any>(null)

    const tabs = computed(() => [
      { id: 'songs', label: window.i18n.t('singer__tab_songs') },
      { id: 'albums', label: window.i18n.t('singer__tab_albums') },
    ])

    const formatCount = (num?: number) => {
      if (!num) return ''
      return formatPlayCount(num)
    }

    const handlePlayList = (index: number) => {
      void playSongListDetail('singer_' + singerDetailInfo.id, singerDetailInfo.source, singerDetailInfo.songs, index)
    }

    const toggleSongPage = (page: number) => {
      void getAndSetSingerSongs(id.value, source.value, page, { name: singerName.value, img: picUrl.value }).then(() => {
        listRef.value?.scrollToTop?.()
      }).catch(() => {})
    }

    const toggleAlbumPage = (page: number) => {
      void getAndSetSingerAlbums(id.value, source.value, page).catch(() => {})
    }

    const toAlbum = (item: SingerAlbumItem) => {
      const singerQuery = {
        source: source.value,
        id: id.value,
        name: singerName.value,
        picUrl: picUrl.value,
        tab: 'albums',
        fromName: backName.value || window.lx.songListInfo.fromName,
      }
      window.lx.songListInfo.fromName = 'SingerDetail'
      window.lx.songListInfo.fromQuery = singerQuery
      void router.push({
        path: '/songList/detail',
        query: {
          source: source.value,
          id: `album_${item.id}`,
          picUrl: item.info.img,
          fromName: 'SingerDetail',
          returnSource: source.value,
          returnId: id.value,
          returnName: singerName.value,
          returnPicUrl: picUrl.value,
          returnTab: 'albums',
          returnFromName: singerQuery.fromName,
        },
      })
    }

    const handleBack = () => {
      const fromName = backName.value && backName.value !== 'SingerDetail' ? backName.value : ''
      const fromQuery = backQuery.value
      if (fromName) {
        void router.replace({ name: fromName, query: fromQuery ?? {} }).catch(() => { router.back() })
      } else {
        router.back()
      }
    }

    useKeyBack(handleBack)

    watch([source, id], ([_source, _id]) => {
      if (!_source || !_id) return
      const tab = route.query.tab == 'albums' ? 'albums' : 'songs'
      activeTab.value = tab
      if (tab == 'albums') {
        void getAndSetSingerAlbums(_id, _source, singerDetailInfo.albumPage || 1).catch(() => {})
        return
      }
      void getAndSetSingerSongs(_id, _source, singerDetailInfo.songPage || 1, { name: singerName.value, img: picUrl.value }).catch(() => {})
    }, { immediate: true })

    watch(activeTab, (tab) => {
      if (!id.value || !source.value) return
      if (tab == 'albums') {
        void getAndSetSingerAlbums(id.value, source.value, singerDetailInfo.albumPage || 1).catch(() => {})
        return
      }
      void getAndSetSingerSongs(id.value, source.value, singerDetailInfo.songPage || 1, { name: singerName.value, img: picUrl.value }).catch(() => {})
    })

    return {
      source,
      id,
      activeTab,
      tabs,
      listRef,
      singerDetailInfo,
      formatCount,
      handlePlayList,
      toggleSongPage,
      toggleAlbumPage,
      toAlbum,
      handleBack,
      addSongListDetail,
      playSongListDetail,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  display: flex;
  flex-flow: column nowrap;
}
.header {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  height: 96px;
  align-items: center;
}
.avatar {
  flex: none;
  margin-left: 15px;
  height: 80px;
  width: 80px;
  border-radius: 50%;
  overflow: hidden;
  background-position: center;
  background-size: cover;
  background-color: var(--color-100);
  box-shadow: var(--shadow-card);
}
.headerMiddle {
  flex: auto;
  padding: 2px 12px;
  min-width: 0;
  h3 {
    .mixin-ellipsis-1();
    line-height: 1.2;
    padding-bottom: 6px;
    color: var(--color-font);
  }
}
.meta {
  display: flex;
  flex-flow: row wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--color-font-label);
}
.desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
.headerRight {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 15px;
  .headerRightBtn {
    border-radius: @radius-round;
  }
}
.tabs {
  flex: none;
  padding: 4px 15px 0;
}
.list {
  position: relative;
  width: 100%;
  min-height: 0;
  flex: auto;
  height: 100%;
}
.albumContent {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 18px 20px 0;
  > ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 24px 20px;
  }
}
.albumItem {
  min-width: 0;
  cursor: pointer;
  .image {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 10px;
    overflow: hidden;
    background-color: var(--color-100);
    box-shadow: var(--shadow-card);
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  h4 {
    margin-top: 9px;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-font);
    .mixin-ellipsis-2();
  }
  p {
    margin-top: 4px;
    display: flex;
    gap: 6px;
    font-size: 12px;
    color: var(--color-font-label);
    .mixin-ellipsis-1();
  }
  &:hover h4 {
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
  justify-content: center;
  align-items: center;
  p {
    font-size: 24px;
    color: var(--color-font-label);
  }
}
</style>
