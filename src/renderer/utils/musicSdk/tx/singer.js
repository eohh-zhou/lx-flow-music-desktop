import { httpFetch } from '../../request'

import { formatPlayTime, sizeFormate } from '../../index'
import { formatSingerName } from '../utils'

export const filterMusicInfoItem = item => {
  if (!item) return null
  const types = []
  const _types = {}
  const file = item.file || {}
  const album = item.album || {}
  if (file.size_128mp3) {
    let size = sizeFormate(file.size_128mp3)
    types.push({ type: '128k', size })
    _types['128k'] = {
      size,
    }
  }
  if (file.size_320mp3) {
    let size = sizeFormate(file.size_320mp3)
    types.push({ type: '320k', size })
    _types['320k'] = {
      size,
    }
  }
  if (file.size_flac) {
    let size = sizeFormate(file.size_flac)
    types.push({ type: 'flac', size })
    _types.flac = {
      size,
    }
  }
  if (file.size_hires) {
    let size = sizeFormate(file.size_hires)
    types.push({ type: 'flac24bit', size })
    _types.flac24bit = {
      size,
    }
  }

  const albumId = album.id ?? ''
  const albumMid = album.mid ?? ''
  const albumName = album.name ?? ''
  return {
    source: 'tx',
    singer: formatSingerName(item.singer, 'name'),
    name: item.title,
    albumName,
    albumId,
    albumMid,
    interval: formatPlayTime(item.interval),
    songId: item.id,
    songmid: item.mid,
    strMediaMid: file.media_mid,
    img: (albumId === '' || albumId === '空')
      ? item.singer?.length ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg` : ''
      : `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`,
    types,
    _types,
    typeUrl: {},
  }
}


/**
 * 创建一个适用于TX的Http请求
 * @param {*} url
 * @param {*} options
 * @param {*} retryNum
 */
const createMusicuFetch = async(data, options, retryNum = 0) => {
  if (retryNum > 2) throw new Error('try max num')

  let result
  try {
    result = await httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      body: {
        comm: {
          cv: 4747474,
          ct: 24,
          format: 'json',
          inCharset: 'utf-8',
          outCharset: 'utf-8',
          uin: 0,
        },
        ...data,
      },
      headers: {
        'User-Angent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
      },
    }).promise
  } catch (err) {
    console.log(err)
    return createMusicuFetch(data, options, ++retryNum)
  }
  if (result.statusCode !== 200 || result.body.code != 0) return createMusicuFetch(data, options, ++retryNum)

  return result.body
}

export default {
  getSearchId() {
    let guid = ''
    for (let i = 0; i < 32; i++) guid += Math.floor(Math.random() * 16).toString(16)
    return guid.toUpperCase() + String(Math.floor(Math.random() * 100000)).padStart(5, '0')
  },
  search(text, page, limit = 20, retryNum = 0) {
    if (retryNum > 5) throw new Error('max retry')
    return httpFetch(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=${page}&n=${limit}&w=${encodeURIComponent(text)}&format=json&inCharset=utf-8&outCharset=utf-8&t=9&cr=1&new_json=1`, {
      headers: {
        Referer: 'https://y.qq.com/',
      },
    }).promise.then(({ body }) => {
      if (!body || body.code != 0) return this.search(text, page, limit, ++retryNum)
      const singer = body.data?.singer || {}
      const rawList = singer.list || []
      const list = rawList.map(item => {
        const info = item.singer || item
        const mid = info.singerMID || info.singer_mid || info.mid || info.singerMid
        const pic = String(info.singerPic || info.pic || (mid ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${mid}.jpg` : '')).replace(/^http:\/\//i, 'https://')
        return {
          id: String(mid || info.singerID || info.id || ''),
          name: info.singerName || info.singer_name || info.name || '',
          img: pic,
          alias: info.singer_title || info.singerTitle || '',
          songCount: info.songNum || info.songnum || info.song_num || 0,
          albumCount: info.albumNum || info.albumnum || info.album_num || 0,
          fansCount: info.concernNum || info.fans || 0,
          source: 'tx',
        }
      }).filter(item => item.id)
      return {
        list,
        limit,
        total: singer.totalnum || singer.total || list.length,
        source: 'tx',
      }
    })
  },
  async getSearchDetail(id, page = 1, limit = 100) {
    const [info, songs] = await Promise.all([
      this.getInfo(id).catch(() => null),
      this.getSongList(id, page, limit),
    ])
    return {
      list: songs.list || [],
      page,
      limit: songs.limit,
      total: songs.total,
      source: 'tx',
      info: {
        name: info?.info?.name ?? '',
        img: info?.info?.avatar ?? '',
        desc: info?.info?.desc ?? '',
        author: info?.info?.name ?? '',
        play_count: info?.count?.music ? String(info.count.music) : '',
      },
    }
  },
  /**
   * 获取歌手信息
   * @param {*} id
   */
  getInfo(id) {
    return createMusicuFetch({
      req_1: {
        module: 'music.musichallSinger.SingerInfoInter',
        method: 'GetSingerDetail',
        param: {
          singer_mid: [id],
          ex_singer: 1,
          wiki_singer: 1,
          group_singer: 0,
          pic: 1,
          photos: 0,
        },
      },
      req_2: {
        module: 'music.musichallAlbum.AlbumListServer',
        method: 'GetAlbumList',
        param: {
          singerMid: id,
          order: 0,
          begin: 0,
          num: 1,
          songNumTag: 0,
          singerID: 0,
        },
      },
      req_3: {
        module: 'musichall.song_list_server',
        method: 'GetSingerSongList',
        param: {
          singerMid: id,
          order: 1,
          begin: 0,
          num: 1,
        },
      },
    }).then(body => {
      if (body.req_1.code != 0 || body.req_2.code != 0 || body.req_3.code != 0) throw new Error('get singer info faild.')

      const info = body.req_1.data.singer_list[0]
      const music = body.req_3.data
      const album = body.req_2.data
      return {
        source: 'tx',
        id: info.basic_info.singer_mid,
        info: {
          name: info.basic_info.name,
          desc: info.ex_info.desc,
          avatar: info.pic.pic,
          gender: info.ex_info.genre === 1 ? 'man' : 'woman',
        },
        count: {
          music: music.totalNum,
          album: album.total,
          fans: info.ex_info?.fans || 0,
        },
      }
    })
  },
  /**
   * 获取歌手专辑列表
   * @param {*} id
   * @param {*} page
   * @param {*} limit
   */
  getAlbumList(id, page = 1, limit = 20) {
    return createMusicuFetch({
      req: {
        module: 'music.musichallAlbum.AlbumListServer',
        method: 'GetAlbumList',
        param: {
          singerMid: id,
          order: 0,
          begin: (page - 1) * limit,
          num: limit,
          songNumTag: 0,
          singerID: 0,
        },
      },
    }).then(body => {
      if (body.req.code != 0) throw new Error('get singer album faild.')

      const list = this.filterAlbumList(body.req.data.albumList)
      return {
        source: 'tx',
        list,
        limit,
        page,
        total: body.req.data.total,
      }
    })
  },
  /**
   * 获取歌手歌曲列表
   * @param {*} id
   * @param {*} page
   * @param {*} limit
   */
  async getSongList(id, page = 1, limit = 100) {
    return createMusicuFetch({
      req: {
        module: 'musichall.song_list_server',
        method: 'GetSingerSongList',
        param: {
          singerMid: id,
          order: 1,
          begin: (page - 1) * limit,
          num: limit,
        },
      },
    }).then(body => {
      if (body.req.code != 0) throw new Error('get singer song list faild.')

      const list = this.filterSongList(body.req.data.songList)
      return {
        source: 'tx',
        list,
        limit,
        page,
        total: body.req.data.totalNum,
      }
    })
  },
  filterAlbumList(raw) {
    return raw.map(item => {
      return {
        id: item.albumMid || String(item.albumID),
        mid: item.albumMid,
        count: item.totalNum,
        time: item.publishDate || item.publicTime || '',
        info: {
          name: item.albumName,
          author: item.singerName,
          img: `https://y.gtimg.cn/music/photo_new/T002R500x500M000${item.albumMid}.jpg`,
          desc: null,
        },
      }
    })
  },
  filterSongList(raw) {
    return (raw || []).map(item => filterMusicInfoItem(item.songInfo || item)).filter(Boolean)
  },
}

