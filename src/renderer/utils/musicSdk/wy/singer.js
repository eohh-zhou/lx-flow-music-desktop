import { eapiRequest } from './utils/index'
import { formatPlayTime, sizeFormate } from '../../index'
import { formatSingerName } from '../utils'

export default {
  search(text, page, limit = 20) {
    return eapiRequest('/api/cloudsearch/pc', {
      s: text,
      type: 100,
      limit,
      total: page == 1,
      offset: limit * (page - 1),
    }).promise.then(({ body }) => {
      if (body.code != 200) throw new Error('search singer failed')
      const artists = body.result?.artists ?? []
      return {
        list: artists.map(item => ({
          id: String(item.id),
          name: item.name,
          img: item.picUrl || item.img1v1Url || '',
          alias: item.alias?.[0] || item.trans || '',
          songCount: item.musicSize || 0,
          albumCount: item.albumSize || 0,
          fansCount: item.fansCount || item.followCount || 0,
          source: 'wy',
        })),
        limit,
        total: body.result?.artistCount ?? artists.length,
        source: 'wy',
      }
    })
  },
  async getSearchDetail(id, page = 1, limit = 100) {
    const [info, songs] = await Promise.all([
      this.getInfo(id).catch(() => null),
      this.getSongList(id, page, limit),
    ])
    return {
      list: songs.list,
      page,
      limit: songs.limit,
      total: songs.total,
      source: 'wy',
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
    return eapiRequest('/api/artist/head/info/get', { id }).promise.then(({ body }) => {
      if (!body || body.code != 200) throw new Error('get singer info faild.')
      return {
        source: 'wy',
        id: body.artist.id,
        info: {
          name: body.artist.name,
          desc: body.artist.briefDesc,
          avatar: body.user?.avatarUrl || body.artist.cover || body.artist.picUrl || body.artist.img1v1Url || '',
          gender: body.user?.gender === 1 ? 'man' : 'woman',
        },
        count: {
          music: body.artist.musicSize,
          album: body.artist.albumSize,
          fans: body.artist.fansCount || body.user?.followeds || 0,
        },
      }
    })
  },
  /**
   * 获取歌手歌曲列表
   * @param {*} id
   * @param {*} page
   * @param {*} limit
   */
  getSongList(id, page = 1, limit = 100) {
    return eapiRequest('/api/v2/artist/songs', {
      id,
      limit,
      offset: limit * (page - 1),
    }).promise.then(({ body }) => {
      if (!body.songs || body.code != 200) throw new Error('get singer song list faild.')

      const list = this.filterSongList(body.songs)
      return {
        list,
        limit,
        page,
        total: body.total,
        source: 'wy',
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
    return eapiRequest(`/api/artist/albums/${id}`, {
      limit,
      offset: limit * (page - 1),
    }).promise.then(({ body }) => {
      if (!body.hotAlbums || body.code != 200) throw new Error('get singer album list faild.')

      const list = this.filterAlbumList(body.hotAlbums)
      return {
        source: 'wy',
        list,
        limit,
        page,
        total: body.artist.albumSize,
      }
    })
  },
  filterAlbumList(raw) {
    const list = []
    raw.forEach(item => {
      if (!item.id) return
      list.push({
        id: String(item.id),
        count: item.size,
        time: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : '',
        info: {
          name: item.name,
          author: formatSingerName(item.artists),
          img: item.picUrl,
          desc: null,
        },
      })
    })
    return list
  },
  filterSongList(raw) {
    const list = []
    raw.forEach(item => {
      if (!item.id) return

      const types = []
      const _types = {}
      let size
      const duration = Number(item.duration || item.dt || 0)
      ;(item.privilege?.chargeInfoList || []).forEach(i => {
        switch (i.rate) {
          case 128000:
            size = item.lMusic ? sizeFormate(item.lMusic.size) : (item.l ? sizeFormate(item.l.size) : null)
            types.push({ type: '128k', size })
            _types['128k'] = {
              size,
            }
            break
          case 320000:
            size = item.hMusic ? sizeFormate(item.hMusic.size) : (item.h ? sizeFormate(item.h.size) : null)
            types.push({ type: '320k', size })
            _types['320k'] = {
              size,
            }
            break
          case 999000:
            size = item.sqMusic ? sizeFormate(item.sqMusic.size) : (item.sq ? sizeFormate(item.sq.size) : null)
            types.push({ type: 'flac', size })
            _types.flac = {
              size,
            }
            break
          case 1999000:
            size = item.hrMusic ? sizeFormate(item.hrMusic.size) : (item.hr ? sizeFormate(item.hr.size) : null)
            types.push({ type: 'flac24bit', size })
            _types.flac24bit = {
              size,
            }
            break
        }
      })
      if (!types.length) {
        const maxbr = item.privilege?.maxbr || item.privilege?.maxBrLevel
        if (item.hrMusic || item.hr || maxbr == 1999000 || maxbr == 'hires') {
          size = item.hrMusic ? sizeFormate(item.hrMusic.size) : (item.hr ? sizeFormate(item.hr.size) : null)
          types.push({ type: 'flac24bit', size })
          _types.flac24bit = { size }
        }
        if (item.sqMusic || item.sq || maxbr == 999000) {
          size = item.sqMusic ? sizeFormate(item.sqMusic.size) : (item.sq ? sizeFormate(item.sq.size) : null)
          types.push({ type: 'flac', size })
          _types.flac = { size }
        }
        if (item.hMusic || item.h || maxbr == 320000) {
          size = item.hMusic ? sizeFormate(item.hMusic.size) : (item.h ? sizeFormate(item.h.size) : null)
          types.push({ type: '320k', size })
          _types['320k'] = { size }
        }
        if (item.lMusic || item.l || maxbr == 128000 || !types.length) {
          size = item.lMusic ? sizeFormate(item.lMusic.size) : (item.l ? sizeFormate(item.l.size) : null)
          types.push({ type: '128k', size })
          _types['128k'] = { size }
        }
        types.reverse()
      }

      list.push({
        singer: formatSingerName(item.artists || item.ar),
        name: item.name,
        albumName: item.album?.name ?? item.al?.name ?? '',
        albumId: item.album?.id ?? item.al?.id ?? '',
        songmid: item.id,
        source: 'wy',
        interval: formatPlayTime(duration > 1000 ? duration / 1000 : duration),
        img: item.album?.picUrl ?? item.al?.picUrl ?? null,
        lrc: null,
        otherSource: null,
        types,
        _types,
        typeUrl: {},
      })
    })
    return list
  },
}
