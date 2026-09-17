import { createSignature } from './musicSearch'
import { createHttpFetch } from './utils/index'
import { filterMusicInfoList, filterMusicInfoListV5 } from './musicInfo'

const pickMgImg = (item) => {
  const pics = item?.singerPicUrl || item?.imgItems || item?.imgs || item?.albumPicUrl || []
  const first = Array.isArray(pics) ? (pics.find(pic => pic?.img)?.img || pics[0]?.img) : ''
  let img = first || item?.img || item?.pic || item?.image || item?.artis5gImg || ''
  if (img && !/^https?:/i.test(img)) {
    img = img.startsWith('//') ? `https:${img}` : `https://d.musicapp.migu.cn${img.startsWith('/') ? img : `/${img}`}`
  }
  return img
}

const collectBmwSongs = (contents) => {
  const songs = []
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (node?.songItem) songs.push(node.songItem)
      if (Array.isArray(node?.contents)) walk(node.contents)
    }
  }
  walk(contents)
  return songs
}

const searchSwitch = encodeURIComponent(JSON.stringify({
  song: 0, album: 0, singer: 1, tagSong: 0, mvSong: 0, bestShow: 0, songlist: 0, lyricSong: 0,
}))

export default {
  search(text, page, limit = 20) {
    const timeStr = Date.now().toString()
    const signResult = createSignature(timeStr, text)
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
      const data = body.singerResultData || body.data?.singerResultData || body
      const raw = data.result || data.resultList || []
      const rows = Array.isArray(raw[0]) ? raw.flat() : raw
      const list = rows.map(item => ({
        id: String(item.id || item.singerId || item.singerid || ''),
        name: item.name || item.title || item.singerName || '',
        img: pickMgImg(item),
        alias: item.aliasName || '',
        songCount: parseInt(item.songNum || item.songCount || 0) || 0,
        albumCount: parseInt(item.albumNum || item.albumCount || 0) || 0,
        fansCount: parseInt(item.fansNum || item.followNum || item.followNums || 0) || 0,
        source: 'mg',
      })).filter(item => item.id)
      return {
        list,
        limit,
        total: parseInt(data.totalCount || list.length) || list.length,
        source: 'mg',
      }
    })
  },
  async getInfo(id) {
    const body = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?resourceType=2002&resourceId=${id}`)
    const info = Array.isArray(body.resource) ? body.resource[0] : (body.resource || body)
    return {
      source: 'mg',
      id,
      info: {
        name: info?.singer || info?.title || info?.name || '',
        desc: info?.summary || info?.intro || '',
        avatar: pickMgImg(info),
        gender: '',
      },
      count: {
        music: parseInt(info?.songNum || info?.songList?.length || 0) || 0,
        album: parseInt(info?.albumNum || 0) || 0,
        fans: parseInt(info?.followNums || 0) || 0,
      },
      _raw: info,
    }
  },
  async getSongList(id, page = 1, limit = 50) {
    const data = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM3.0/bmw/singer/song/v1.0?singerId=${id}&pageNo=${page}&pageSize=${limit}&type=1`)
    const songs = collectBmwSongs(data?.contents)
    const v5 = filterMusicInfoListV5(songs)
    const list = v5.length ? v5 : filterMusicInfoList(songs)
    const apiTotal = parseInt(data?.totalCount || data?.total || data?.songNum || 0) || 0
    const loaded = (page - 1) * limit + list.length
    return {
      list,
      page,
      limit,
      total: apiTotal || (list.length < limit ? loaded : loaded + 1),
      source: 'mg',
    }
  },
  async getAlbumList(id, page = 1, limit = 20) {
    const [info, songData] = await Promise.all([
      this.getInfo(id).catch(() => null),
      createHttpFetch(`https://app.c.nf.migu.cn/MIGUM3.0/bmw/singer/song/v1.0?singerId=${id}&pageNo=${page}&pageSize=50&type=1`).catch(() => ({ contents: [] })),
    ])
    const songs = collectBmwSongs(songData?.contents)
    const albums = []
    const seen = new Set()
    for (const song of songs) {
      const albumId = String(song.albumId || '')
      if (!albumId || seen.has(albumId)) continue
      seen.add(albumId)
      albums.push({
        id: albumId,
        count: 0,
        time: '',
        info: {
          name: song.album || '',
          author: info?.info?.name || '',
          img: pickMgImg(song),
          desc: null,
        },
      })
    }
    return {
      source: 'mg',
      list: albums,
      limit: Math.max(albums.length, 1),
      page,
      total: albums.length,
    }
  },
  async getSearchDetail(id, page = 1) {
    const [info, songs] = await Promise.all([
      this.getInfo(id).catch(() => null),
      this.getSongList(id, page),
    ])
    return {
      list: songs.list,
      page,
      limit: songs.limit,
      total: songs.total,
      source: 'mg',
      info: {
        name: info?.info?.name ?? '',
        img: info?.info?.avatar ?? '',
        desc: info?.info?.desc ?? '',
        author: info?.info?.name ?? '',
        play_count: '',
      },
    }
  },
}
