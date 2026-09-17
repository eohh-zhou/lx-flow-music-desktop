import { getMusicInfosByList } from './musicInfo'
import { createHttpFetch } from './util'

export default {
  search(text, page, limit = 20) {
    return createHttpFetch(`http://msearchretry.kugou.com/api/v3/search/album?keyword=${encodeURIComponent(text)}&page=${page}&pagesize=${limit}&showtype=10`)
      .then(body => {
        const info = Array.isArray(body)
          ? body
          : (body.info || body.data?.info || body.lists || [])
        const list = info.map(item => ({
          id: String(item.albumid || item.album_id || item.id || ''),
          author: item.singername || item.author_name || '',
          name: item.albumname || item.album_name || item.name || '',
          time: item.publishtime ? String(item.publishtime).slice(0, 10) : '',
          img: String(item.imgurl || item.sizable_cover || '').replace('{size}', '240'),
          songCount: item.songcount || item.song_count || 0,
          source: 'kg',
        })).filter(item => item.id)
        return {
          list,
          limit,
          total: body.total || body.data?.total || list.length,
          source: 'kg',
        }
      })
  },
  /**
   * 通过AlbumId获取专辑信息
   * @param {*} id
   */
  async getAlbumInfo(id) {
    const albumInfoRequest = await createHttpFetch('http://kmrserviceretry.kugou.com/container/v1/album?dfid=1tT5He3kxrNC4D29ad1MMb6F&mid=22945702112173152889429073101964063697&userid=0&appid=1005&clientver=11589', {
      method: 'POST',
      body: {
        appid: 1005,
        clienttime: 1681833686,
        clientver: 11589,
        data: [{ album_id: id }],
        fields: 'language,grade_count,intro,mix_intro,heat,category,sizable_cover,cover,album_name,type,quality,publish_company,grade,special_tag,author_name,publish_date,language_id,album_id,exclusive,is_publish,trans_param,authors,album_tag',
        isBuy: 0,
        key: 'e6f3306ff7e2afb494e89fbbda0becbf',
        mid: '22945702112173152889429073101964063697',
        show_album_tag: 0,
      },
    })
    if (!albumInfoRequest) return Promise.reject(new Error('get album info failed.'))
    const albumInfo = albumInfoRequest[0]

    return {
      name: albumInfo.album_name,
      image: String(albumInfo.sizable_cover || albumInfo.cover || '').replace('{size}', '240'),
      desc: albumInfo.intro,
      authorName: albumInfo.author_name,
      // play_count: this.formatPlayCount(info.count),
    }
  },
  /**
   * 通过AlbumId获取专辑
   * @param {*} id
   * @param {*} page
   */
  async getAlbumDetail(id, page = 1, limit = 200) {
    const albumList = await createHttpFetch(`http://mobiles.kugou.com/api/v3/album/song?version=9108&albumid=${id}&plat=0&pagesize=${limit}&area_code=0&page=${page}&with_res_tag=0`)
    if (!albumList.info) return Promise.reject(new Error('Get album list failed.'))

    let result = await getMusicInfosByList(albumList.info)

    const info = await this.getAlbumInfo(id)

    return {
      list: result || [],
      page,
      limit,
      total: albumList.total,
      source: 'kg',
      info: {
        name: info.name,
        img: info.image,
        desc: info.desc,
        author: info.authorName,
        // play_count: this.formatPlayCount(info.count),
      },
    }
  },
}
