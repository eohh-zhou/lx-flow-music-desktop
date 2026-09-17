import { reactive, markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

// import { deduplicationList } from '@common/utils/renderer'

export type Source = LX.OnlineSource | 'all'
export type HotSearchType = 'music' | 'songlist' | 'singer' | 'album'
type CacheType = HotSearchType | 'default'

const CACHE_TYPES: CacheType[] = ['default', 'music', 'songlist', 'singer', 'album']

interface SourceLists extends Partial<Record<LX.OnlineSource, string[]>> {
  'all': string[]
}

export const sources: Source[] = markRaw([])

export const sourceList: SourceLists = markRaw({
  all: reactive<string[]>([]),
})

const typedCache = new Map<string, string[]>()

const cacheKey = (source: Source, type: CacheType) => `${source}:${type}`

const resolveType = (type?: string | null): CacheType => {
  if (type == 'songlist' || type == 'singer' || type == 'album' || type == 'music') return type
  return 'default'
}


for (const source of music.sources) {
  if (!music[source.id as LX.OnlineSource]?.hotSearch) continue
  sources.push(source.id as LX.OnlineSource)
  sourceList[source.id as LX.OnlineSource] = reactive<string[]>([])
}
sources.push('all')


const setList = (source: LX.OnlineSource, list: string[], type: CacheType): string[] => {
  const words = list.slice(0, 20)
  typedCache.set(cacheKey(source, type), words)
  if (type == 'default') sourceList[source] = words
  return words
}

const setLists = (lists: Array<{ source: LX.OnlineSource, list: string[] }>, type: CacheType): string[] => {
  let wordsMap = new Map<string, number>()
  for (const { source, list } of lists) {
    typedCache.set(cacheKey(source, type), list.slice(0, 20))
    if (type == 'default' && !sourceList[source]?.length) sourceList[source] = list.slice(0, 20)
    for (let item of list) {
      item = item.trim()
      if (!item) continue
      wordsMap.set(item, (wordsMap.get(item) ?? 0) + 1)
    }
  }
  const wordsMapArr = Array.from(wordsMap)
  wordsMapArr.sort((a, b) => a[0].localeCompare(b[0]))
  wordsMapArr.sort((a, b) => b[1] - a[1])
  const words = wordsMapArr.map(item => item[0]).slice(0, sources.length * 10)
  typedCache.set(cacheKey('all', type), words)
  if (type == 'default') sourceList.all = words
  return words
}

const fetchSourceList = async(source: LX.OnlineSource, type: CacheType): Promise<{ source: LX.OnlineSource, list: string[] }> => {
  const key = cacheKey(source, type)
  if (typedCache.has(key)) return { source, list: typedCache.get(key)! }
  const cachedList = sourceList[source]
  if (type == 'default' && cachedList?.length) {
    typedCache.set(key, cachedList)
    return { source, list: cachedList }
  }
  if (!music[source]?.hotSearch) {
    setList(source, [], type)
    return { source, list: [] }
  }
  const sdkType = type == 'default' ? undefined : type
  try {
    const data = await music[source].hotSearch.getList(0, sdkType)
    const list = Array.isArray(data?.list) ? data.list.filter(Boolean) : []
    return { source, list: setList(source, list, type) }
  } catch (err) {
    console.log(err)
    return { source, list: [] }
  }
}

export const getList = async(source: Source, type?: string | null): Promise<string[]> => {
  const searchType = resolveType(type)

  if (source == 'all') {
    const task = []
    for (const item of sources) {
      if (item == 'all') continue
      task.push(fetchSourceList(item, searchType))
    }
    const results = await Promise.all(task)
    const typedResults = searchType == 'default'
      ? results
      : results.filter(item => item.list.length)
    const words = setLists(typedResults.length ? typedResults : results, searchType)
    if (words.length || searchType == 'default') return words
    return getList('all')
  }

  const { list } = await fetchSourceList(source, searchType)
  if (list.length || searchType == 'default') return list
  return getList(source)
}


export const clearList = (source: Source) => {
  sourceList[source] = []
  for (const type of CACHE_TYPES) typedCache.delete(cacheKey(source, type))
  if (source != 'all') {
    sourceList.all = []
    for (const type of CACHE_TYPES) typedCache.delete(cacheKey('all', type))
  }
}
