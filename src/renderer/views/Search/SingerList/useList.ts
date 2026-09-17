import { onBeforeRouteLeave } from '@common/utils/vueRouter'
import { ref, nextTick } from '@common/utils/vueTools'
import { addHistoryWord } from '@renderer/store/search/action'
import type { SearchListInfo, SingerInfoItem } from '@renderer/store/search/singer'
import { search as searchSinger, listInfos } from '@renderer/store/search/singer'

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
    void searchSinger(text, page, source).then((list: SingerInfoItem[]) => {
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
