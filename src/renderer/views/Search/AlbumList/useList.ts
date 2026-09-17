import { onBeforeRouteLeave } from '@common/utils/vueRouter'
import { ref, nextTick } from '@common/utils/vueTools'
import { addHistoryWord } from '@renderer/store/search/action'
import type { SearchListInfo, AlbumInfoItem } from '@renderer/store/search/album'
import { search as searchAlbum, listInfos } from '@renderer/store/search/album'

export type SearchSource = LX.OnlineSource | 'all'

export default () => {
  const listRef = ref<any>(null)

  const listInfo = ref<SearchListInfo>({
    page: 1,
    limit: 20,
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
  })

  const search = (text: string, source: SearchSource, page: number) => {
    listInfo.value = listInfos[source] as SearchListInfo
    if (text.length) void addHistoryWord(text)
    void searchAlbum(text, page, source).then((list: AlbumInfoItem[]) => {
      if (list.length && listRef.value) {
        void nextTick(() => {
          listRef.value.scrollTo({ top: 0 })
        })
      }
    })
  }

  onBeforeRouteLeave(() => {})


  return {
    listRef,
    listInfo,
    search,
  }
}
