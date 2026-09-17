import { eapiRequest } from './utils/index'
import { formatPlayCount } from '../../index'
import musicDetailApi from './musicDetail'

export default {
  search(text, page, limit = 20) {
    return eapiRequest('/api/cloudsearch/pc', {
      s: text,
      type: 10,
      limit,
      total: page == 1,
      offset: limit * (page - 1),
    }).promise.then(({ body }) => {
      if (body.code != 200) throw new Error('search album failed')
      const albums = body.result?.albums ?? []
      return {
        list: albums.map(item => ({
          id: String(item.id),
          author: (item.artists || []).map(artist => artist.name).join('、') || item.artist?.name || '',
          name: item.name,
          time: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : '',
          img: item.picUrl || item.blurPicUrl || '',
          songCount: item.size || 0,
          source: 'wy',
        })),
        limit,
        total: body.result?.albumCount ?? albums.length,
        source: 'wy',
      }
    })
  },
  async getAlbumDetail(id, page = 1) {
    const { body } = await eapiRequest(`/api/v1/album/${id}`, {}).promise
    if (body.code != 200 || !body.album) throw new Error('get album detail failed')
    let list = []
    if (body.songs?.length) {
      try {
        list = (await musicDetailApi.getList(body.songs.map(song => song.id))).list
      } catch {
        list = []
      }
    }
    return {
      list,
      page,
      limit: Math.max(list.length, 1),
      total: list.length,
      source: 'wy',
      info: {
        name: body.album.name,
        img: body.album.picUrl,
        desc: body.album.description || '',
        author: (body.album.artists || []).map(artist => artist.name).join('、') || body.album.artist?.name || '',
        play_count: body.album.size ? formatPlayCount(body.album.size) : '',
      },
    }
  },
}
