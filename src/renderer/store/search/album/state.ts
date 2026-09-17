import { reactive, markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

export interface AlbumInfoItem {
  id: string
  name: string
  author: string
  img: string
  time?: string
  songCount?: number
  source: LX.OnlineSource
}

export interface SearchListInfo {
  list: AlbumInfoItem[]
  total: number
  page: number
  limit: number
  key: string | null
  noItemLabel: string
}

export const sources: Array<LX.OnlineSource | 'all'> = markRaw([])

interface ListInfos extends Partial<Record<LX.OnlineSource, SearchListInfo>> {
  all: SearchListInfo
}

export const listInfos: ListInfos = markRaw({
  all: reactive<SearchListInfo>({
    page: 1,
    limit: 20,
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
  }),
})
export const maxPages: Partial<Record<LX.OnlineSource, number>> = {}
for (const source of music.sources) {
  if (!music[source.id as LX.OnlineSource]?.album?.search) continue
  sources.push(source.id as LX.OnlineSource)
  listInfos[source.id as LX.OnlineSource] = reactive<SearchListInfo>({
    page: 1,
    limit: 20,
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
  })
  maxPages[source.id as LX.OnlineSource] = 0
}
sources.push('all')
