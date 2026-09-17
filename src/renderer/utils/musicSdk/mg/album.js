import { createHttpFetch } from './utils'
import { filterMusicInfoList, filterMusicInfoListV5 } from './musicInfo'
import { formatPlayCount } from '../../index'
import { createSignature } from './musicSearch'

const pickMgImg = (item) => {
  const pics = item?.imgItems || item?.albumImgs || item?.imgs || []
  const first = Array.isArray(pics) ? (pics.find(pic => pic?.img)?.img || pics[0]?.img) : ''
  let img = first || item?.img || item?.image || item?.img1 || item?.img2 || item?.img3 || ''
  if (img && !/^https?:/i.test(img)) {
    img = img.startsWith('//') ? `https:${img}` : `https://d.musicapp.migu.cn${img.startsWith('/') ? img : `/${img}`}`
  }
  return img
}

const flattenRows = (raw) => Array.isArray(raw?.[0]) ? raw.flat() : (Array.isArray(raw) ? raw : [])

const mapAlbumsFromSongs = (songs) => {
  const list = []
  const seen = new Set()
  for (const song of songs) {
    const album = Array.isArray(song.albums) ? song.albums[0] : null
    const id = String(album?.id || song.albumId || '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    list.push({
      id,
      author: song.singer || song.singerName || (Array.isArray(song.singers) ? song.singers.map(s => s.name).join('、') : '') || '',
      name: album?.name || song.album || song.albumName || '',
      time: song.publishDate || '',
      img: pickMgImg(song),
      songCount: 0,
      source: 'mg',
    })
  }
  return list
}

export default {
  search(text, page, limit = 20) {
    const timeStr = Date.now().toString()
    const signResult = createSignature(timeStr, text)
    const searchSwitch = encodeURIComponent(JSON.stringify({
      song: 1, album: 1, singer: 0, tagSong: 0, mvSong: 0, bestShow: 0, songlist: 0, lyricSong: 0,
    }))
    return createHttpFetch(`https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=1&isCopyright=1&searchSwitch=${searchSwitch}&pageSize=${limit}&text=${encodeURIComponent(text)}&pageNo=${page}&sort=0&sid=USS`, {
      headers: {
        uiVersion: 'A_music_3.6.1',
        deviceId: signResult.deviceId,
        timestamp: timeStr,
        sign: signResult.sign,
        channel: '0146921',
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
      },
    }).then(body => {
      const albumData = body.albumResultData || body.data?.albumResultData || {}
      const songData = body.songResultData || body.data?.songResultData || {}
      const albumRows = flattenRows(albumData.result || albumData.resultList || [])
      let list = albumRows.map(item => ({
        id: String(item.id || item.albumId || item.albumid || ''),
        author: item.singer || item.singerName || (Array.isArray(item.singers) ? item.singers.map(s => s.name).join('、') : '') || '',
        name: item.name || item.title || item.albumName || '',
        time: item.publishDate || item.publishedTime || '',
        img: pickMgImg(item),
        songCount: parseInt(item.songNum || item.songCount || 0) || 0,
        source: 'mg',
      })).filter(item => item.id)
      if (!list.length) {
        list = mapAlbumsFromSongs(flattenRows(songData.result || songData.resultList || []))
      }
      return {
        list,
        limit,
        total: parseInt(albumData.totalCount || list.length) || list.length,
        source: 'mg',
      }
    })
  },
  /**
   * 通过AlbumId获取专辑
   * @param {*} id
   * @param {*} page
   */
  async getAlbumDetail(id, page = 1) {
    const list = await createHttpFetch(`http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryAlbumSong?albumId=${id}&pageNo=${page}`)
    if (!list.songList) return Promise.reject(new Error('Get album list error.'))

    const v5 = filterMusicInfoListV5(list.songList)
    const songList = v5.length ? v5 : filterMusicInfoList(list.songList)
    const listInfo = await this.getAlbumInfo(id)

    return {
      list: songList || [],
      page,
      limit: listInfo.total,
      total: listInfo.total,
      source: 'mg',
      info: {
        name: listInfo.name,
        img: listInfo.image,
        desc: listInfo.desc,
        author: listInfo.author,
        play_count: listInfo.play_count,
      },
    }
  },
  /**
   * 通过AlbumId获取专辑信息
   * @param {*} id
   * @param {*} page
   */
  async getAlbumInfo(id) {
    const info = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM3.0/resource/album/v2.0?albumId=${id}`)
    if (!info) return Promise.reject(new Error('Get album info error.'))

    return {
      name: info.title,
      image: pickMgImg(info),
      desc: info.summary,
      author: info.singer,
      play_count: formatPlayCount(info.opNumItem?.playNum || 0),
      total: info.totalCount,
    }
  },
}
