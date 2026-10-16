import musicSdk from '@renderer/utils/musicSdk'
import { toNewMusicInfo } from '@common/utils/tools'
import { getMetadataKey, parseTrackMetadata, rankLyricCandidates } from '@renderer/utils/musicSdk/bili/metadata'
import { getCachedLyricInfo, getOnlineOtherSourceLyricInfo } from './utils'
import { saveLyric } from '@renderer/utils/ipc'

type MetadataCallback = (musicInfo: LX.Music.MusicInfoOnline) => void
const searches = new Map<string, Promise<LX.Music.MusicInfoOnline[]>>()
const cache = new Map<string, { expires: number, candidates: LX.Music.MusicInfoOnline[] }>()

const findCandidates = async(musicInfo: LX.Music.MusicInfoOnline, isRefresh: boolean) => {
  const key = getMetadataKey(musicInfo)
  const cached = cache.get(key)
  if (!isRefresh && cached && cached.expires > Date.now()) return cached.candidates
  if (searches.has(key)) return searches.get(key)!
  const { name, singer } = parseTrackMetadata(musicInfo.meta.bilibili?.rawTitle ?? musicInfo.name, musicInfo.meta.albumName)
  let timer: NodeJS.Timeout
  let timedOut = false
  const searchSource = async(source: 'tx' | 'wy' | 'kw') => {
    try {
      return await musicSdk[source].musicSearch.search(`${name} ${singer}`.trim(), 1, 25)
    } catch { return { list: [] } }
  }
  const search = Promise.all([searchSource('tx'), searchSource('wy')]).then(async lists => {
    let candidates = rankLyricCandidates(musicInfo, lists)
    if (!candidates.length && !timedOut) candidates = rankLyricCandidates(musicInfo, [...lists, await searchSource('kw')])
    return candidates.map(toNewMusicInfo) as LX.Music.MusicInfoOnline[]
  })
  const task = Promise.race([
    search,
    new Promise<LX.Music.MusicInfoOnline[]>((resolve, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('Bilibili lyric search timeout')) }, 15_000) }),
  ]).then(candidates => {
    if (cache.size >= 64) cache.delete(cache.keys().next().value!)
    cache.set(key, { candidates, expires: Date.now() + (candidates.length ? 600_000 : 60_000) })
    return candidates
  }).finally(() => {
    clearTimeout(timer)
    searches.delete(key)
  })
  searches.set(key, task)
  return task
}

export const resolveBilibiliMetadata = async(original: LX.Music.MusicInfoOnline, isRefresh = false): Promise<LX.Music.MusicInfoOnline> => {
  if (original.source != 'bili') return original
  const metadata = original.meta.bilibili ? { ...original.meta.bilibili } : { rawTitle: original.name, uploader: original.singer }
  const musicInfo = { ...original, meta: { ...original.meta, bilibili: metadata } }
  let matched = metadata.matchedMusic
  if (!matched || isRefresh) {
    Object.assign(musicInfo, parseTrackMetadata(metadata.rawTitle, original.meta.albumName))
    matched = (await findCandidates(musicInfo, isRefresh))[0]
  }
  if (matched) {
    metadata.matchedMusic = matched
    musicInfo.name = matched.name
    musicInfo.singer = matched.singer
  }
  return musicInfo
}

export const getBilibiliLyricInfo = async({ musicInfo, isRefresh, onMetadata, onToggleSource }: {
  musicInfo: LX.Music.MusicInfoOnline
  isRefresh: boolean
  onMetadata?: MetadataCallback
  onToggleSource: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Music.LyricInfo> => {
  // Upgrade saved entries from the initial importer, which put the uploader in singer.
  const metadata = musicInfo.meta.bilibili ??= { rawTitle: musicInfo.name, uploader: musicInfo.singer }
  if (!metadata.matchedMusic || isRefresh) {
    Object.assign(musicInfo, parseTrackMetadata(metadata.rawTitle, musicInfo.meta.albumName))
    onMetadata?.(musicInfo)
  }
  const cachedLyric = !isRefresh ? await getCachedLyricInfo(musicInfo) : null
  if (cachedLyric && metadata.matchedMusic) return cachedLyric

  const fetchLyric = async(candidates: LX.Music.MusicInfoOnline[]) => {
    if (!candidates.length) throw new Error('No confident Bilibili lyric match')
    const matched = candidates[0]
    metadata.matchedMusic = matched
    musicInfo.name = matched.name
    musicInfo.singer = matched.singer
    onMetadata?.(musicInfo)
    if (cachedLyric && !isRefresh) return cachedLyric
    const { lyricInfo, musicInfo: lyricMusicInfo, isFromCache } = await getOnlineOtherSourceLyricInfo({
      musicInfos: [...candidates], onToggleSource, isRefresh, retryedSource: ['bili'],
    })
    if (metadata.matchedMusic.id != lyricMusicInfo.id) {
      metadata.matchedMusic = lyricMusicInfo
      onMetadata?.(musicInfo)
    }
    if (!isFromCache) void saveLyric(lyricMusicInfo, lyricInfo)
    // Cache by BV + part as well as the lyric provider; playback stays on Bilibili.
    void saveLyric(musicInfo, lyricInfo)
    return lyricInfo
  }
  if (metadata.matchedMusic && !isRefresh) {
    try { return await fetchLyric([metadata.matchedMusic]) } catch { /* Recheck other providers if a saved binding stops working. */ }
  }
  try {
    return await fetchLyric(await findCandidates(musicInfo, isRefresh))
  } catch (error) {
    // Previously saved/custom lyrics remain usable even when the catalogue is unavailable.
    if (cachedLyric) return cachedLyric
    throw error
  }
}
