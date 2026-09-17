import { getMusicInfosByList } from './musicInfo'
import { createHttpFetch } from './util'

export default {
  search(text, page, limit = 20) {
    return createHttpFetch(`http://mobilecdn.kugou.com/api/v3/search/singer?keyword=${encodeURIComponent(text)}&page=${page}&pagesize=${limit}`)
      .then(async body => {
        const info = Array.isArray(body)
          ? body
          : (body.info || body.data?.info || body.lists || [])
        const rows = info.filter(item => item.singerid || item.author_id || item.id).slice(0, limit)
        const extras = await Promise.all(rows.map(item => {
          const id = item.singerid || item.author_id || item.id
          if (item.imgurl || item.avatar) return Promise.resolve(item)
          return this.getInfo(id).then(detail => ({
            ...item,
            imgurl: detail.info.avatar,
            songcount: detail.count.music,
            albumcount: detail.count.album,
            fanscount: detail.count.fans,
          })).catch(() => item)
        }))
        const list = extras.map(item => ({
          id: String(item.singerid || item.author_id || item.id || ''),
          name: item.singername || item.author_name || item.singerName || item.name || '',
          img: String(item.imgurl || item.avatar || item.sizable_avatar || '').replace('{size}', '480'),
          alias: '',
          songCount: item.songcount || item.song_count || 0,
          albumCount: item.albumcount || item.album_count || 0,
          fansCount: item.fanscount || item.fans_count || 0,
          source: 'kg',
        })).filter(item => item.id)
        return {
          list,
          limit,
          total: Array.isArray(body) ? list.length : (body.total || body.data?.total || list.length),
          source: 'kg',
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
      source: 'kg',
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
    if (id == 0) throw new Error('歌手不存在') // kg源某些歌曲在歌手没被kg收录时返回的歌手id为0
    return createHttpFetch(`http://mobiles.kugou.com/api/v5/singer/info?singerid=${id}`).then(body => {
      if (!body) throw new Error('get singer info faild.')

      return {
        source: 'kg',
        id: body.singerid,
        info: {
          name: body.singername,
          desc: body.intro,
          avatar: String(body.imgurl || '').replace('{size}', '480'),
          gender: body.grade === 1 ? 'man' : 'woman',
        },
        count: {
          music: body.songcount,
          album: body.albumcount,
          fans: body.fanscount || 0,
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
  getAlbumList(id, page = 1, limit = 10) {
    if (id == 0) throw new Error('歌手不存在')
    return createHttpFetch(`http://mobiles.kugou.com/api/v5/singer/album?singerid=${id}&page=${page}&pagesize=${limit}`).then(body => {
      if (!body.info) throw new Error('get singer album list faild.')

      const list = this.filterAlbumList(body.info)
      return {
        source: 'kg',
        list,
        limit,
        page,
        total: body.total,
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
    if (id == 0) throw new Error('歌手不存在')
    const body = await createHttpFetch(`http://mobiles.kugou.com/api/v5/singer/song?singerid=${id}&page=${page}&pagesize=${limit}`)
    if (!body.info) throw new Error('get singer song list faild.')

    const list = await getMusicInfosByList(body.info)
    return {
      source: 'kg',
      list,
      limit,
      page,
      total: body.total,
    }
  },
  filterAlbumList(raw) {
    return raw.map(item => {
      return {
        id: String(item.albumid),
        count: item.songcount,
        time: item.publishtime ? String(item.publishtime).slice(0, 10) : '',
        info: {
          name: item.albumname,
          author: item.singername,
          img: String(item.imgurl || item.sizable_cover || '').replace('{size}', '480'),
          desc: item.intro,
        },
      }
    })
  },
}
