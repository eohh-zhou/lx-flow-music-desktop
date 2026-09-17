import { markRaw, markRawList } from '@common/utils/vueTools'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import musicSdk from '@renderer/utils/musicSdk'
import { singerDetailInfo } from './state'
import type { SingerAlbumItem } from './state'

const cache = new Map<string, any>()

const getSingerApi = (source: LX.OnlineSource) => musicSdk[source]?.singer

export const clearSingerDetail = () => {
  singerDetailInfo.id = ''
  singerDetailInfo.source = 'kw'
  singerDetailInfo.name = ''
  singerDetailInfo.img = ''
  singerDetailInfo.desc = ''
  singerDetailInfo.songCount = 0
  singerDetailInfo.albumCount = 0
  singerDetailInfo.fansCount = 0
  singerDetailInfo.songs = []
  singerDetailInfo.songPage = 1
  singerDetailInfo.songLimit = 100
  singerDetailInfo.songTotal = 0
  singerDetailInfo.albums = []
  singerDetailInfo.albumPage = 1
  singerDetailInfo.albumLimit = 20
  singerDetailInfo.albumTotal = 0
  singerDetailInfo.key = null
  singerDetailInfo.songKey = null
  singerDetailInfo.albumKey = null
  singerDetailInfo.noItemLabel = ''
  singerDetailInfo.songNoItemLabel = ''
  singerDetailInfo.albumNoItemLabel = ''
}

const applyInfo = (info: any, fallback: { name?: string, img?: string }) => {
  if (!info) return
  singerDetailInfo.name = info.info?.name || fallback.name || singerDetailInfo.name
  singerDetailInfo.img = info.info?.avatar || fallback.img || singerDetailInfo.img
  singerDetailInfo.desc = info.info?.desc || singerDetailInfo.desc
  singerDetailInfo.songCount = info.count?.music || singerDetailInfo.songCount
  singerDetailInfo.albumCount = info.count?.album || singerDetailInfo.albumCount
  singerDetailInfo.fansCount = info.count?.fans || singerDetailInfo.fansCount
}

export const getAndSetSingerSongs = async(id: string, source: LX.OnlineSource, page = 1, fallback: { name?: string, img?: string } = {}) => {
  const api = getSingerApi(source)
  if (!api?.getSongList) throw new Error('source not found: ' + source)
  const key = `singer_songs__${source}__${id}__${page}`
  if (singerDetailInfo.songKey == key && singerDetailInfo.songs.length) return

  singerDetailInfo.songKey = key
  singerDetailInfo.key = key
  singerDetailInfo.id = id
  singerDetailInfo.source = source
  singerDetailInfo.songNoItemLabel = window.i18n.t('list__loading')
  singerDetailInfo.noItemLabel = singerDetailInfo.songNoItemLabel
  if (fallback.name) singerDetailInfo.name = fallback.name
  if (fallback.img) singerDetailInfo.img = fallback.img

  const infoKey = `singer_info__${source}__${id}`
  let loadInfo: Promise<any>
  if (!api.getInfo) {
    loadInfo = Promise.resolve(null)
  } else if (cache.has(infoKey)) {
    loadInfo = Promise.resolve(cache.get(infoKey))
  } else {
    loadInfo = api.getInfo(id).then((info: any) => {
      cache.set(infoKey, info)
      return info
    }).catch(() => null)
  }

  try {
    const [info, songs] = await Promise.all([
      loadInfo,
      api.getSongList(id, page, singerDetailInfo.songLimit),
    ])
    if (singerDetailInfo.songKey != key) return
    applyInfo(info, fallback)
    singerDetailInfo.songs = markRawList(deduplicationList((songs.list || []).map((m: any) => toNewMusicInfo(m)) as LX.Music.MusicInfoOnline[]))
    singerDetailInfo.songPage = page
    singerDetailInfo.songLimit = songs.limit || singerDetailInfo.songLimit
    singerDetailInfo.songTotal = songs.total || singerDetailInfo.songs.length
    if (singerDetailInfo.songCount < singerDetailInfo.songTotal) singerDetailInfo.songCount = singerDetailInfo.songTotal
    singerDetailInfo.songNoItemLabel = singerDetailInfo.songs.length ? '' : window.i18n.t('no_item')
    singerDetailInfo.noItemLabel = singerDetailInfo.songNoItemLabel
  } catch (error) {
    if (singerDetailInfo.songKey != key) return
    singerDetailInfo.songs = []
    singerDetailInfo.songNoItemLabel = window.i18n.t('list__load_failed')
    singerDetailInfo.noItemLabel = singerDetailInfo.songNoItemLabel
    console.log(error)
    throw error
  }
}

export const getAndSetSingerAlbums = async(id: string, source: LX.OnlineSource, page = 1) => {
  const api = getSingerApi(source)
  if (!api?.getAlbumList) {
    singerDetailInfo.albums = []
    singerDetailInfo.albumTotal = 0
    singerDetailInfo.albumNoItemLabel = window.i18n.t('no_item')
    return
  }
  const key = `singer_albums__${source}__${id}__${page}`
  if (singerDetailInfo.albumKey == key && singerDetailInfo.albums.length) return

  singerDetailInfo.albumKey = key
  singerDetailInfo.id = id
  singerDetailInfo.source = source
  singerDetailInfo.albumNoItemLabel = window.i18n.t('list__loading')

  try {
    const result = await api.getAlbumList(id, page, singerDetailInfo.albumLimit)
    if (singerDetailInfo.albumKey != key) return
    singerDetailInfo.albums = markRaw((result.list || []) as SingerAlbumItem[])
    singerDetailInfo.albumPage = page
    singerDetailInfo.albumLimit = result.limit || singerDetailInfo.albumLimit
    singerDetailInfo.albumTotal = result.total || singerDetailInfo.albums.length
    if (singerDetailInfo.albumCount < singerDetailInfo.albumTotal) singerDetailInfo.albumCount = singerDetailInfo.albumTotal
    singerDetailInfo.albumNoItemLabel = singerDetailInfo.albums.length ? '' : window.i18n.t('no_item')
  } catch (error) {
    if (singerDetailInfo.albumKey != key) return
    singerDetailInfo.albums = []
    singerDetailInfo.albumNoItemLabel = window.i18n.t('list__load_failed')
    console.log(error)
    throw error
  }
}
