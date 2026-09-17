import { httpFetch } from '../../request'
import { decodeName } from '../../index'
import { normalizeKwPicUrl, parseKwSearchBody } from './util'

export default {
  search(text, page, limit = 20) {
    return httpFetch(`http://search.kuwo.cn/r.s?all=${encodeURIComponent(text)}&pn=${page - 1}&rn=${limit}&rformat=json&encoding=utf8&ver=mbox&vipver=MUSIC_8.7.7.0_BCS37&plat=pc&devid=28156413&ft=artist&pay=0&needliveshow=0`)
      .promise.then(({ body }) => {
        body = parseKwSearchBody(body)
        const rawList = body.abslist || body.artistlist || []
        const basePic = body.BASEPICPATH || 'https://img2.kuwo.cn/star/starheads/'
        const list = rawList.map(item => {
          const pic = item.hts_PICPATH || item.pic || ''
          const relativePic = item.PICPATH || item.picpath || (!/^https?:/i.test(pic) ? pic : '')
          const img = (/^https?:/i.test(pic)
            ? normalizeKwPicUrl(pic)
            : relativePic
              ? normalizeKwPicUrl(`${String(basePic).replace(/\/$/, '')}/${String(relativePic).replace(/^\//, '')}`)
              : '') || ''
          return {
            id: String(item.ARTISTID || item.artistid || item.DC_TARGETID || ''),
            name: decodeName(item.ARTIST || item.artist),
            img,
            alias: decodeName(item.FARTIST || item.COUNTRY || ''),
            songCount: parseInt(item.SONGNUM || item.songnum || 0) || 0,
            albumCount: parseInt(item.ALBUMNUM || item.albumnum || 0) || 0,
            fansCount: parseInt(item.FANS || item.fans || item.FANSNUM || 0) || 0,
            source: 'kw',
          }
        }).filter(item => item.id)
        return {
          list,
          limit,
          total: parseInt(body.TOTAL || body.total || list.length) || list.length,
          source: 'kw',
        }
      })
  },
  getSongList(id, page = 1, limit = 100) {
    return httpFetch(`http://search.kuwo.cn/r.s?stype=artist2music&artistid=${id}&pn=${page - 1}&rn=${limit}&show_copyright_off=0&encoding=utf8&vipver=MUSIC_9.1.0`)
      .promise.then(({ body }) => {
        const data = parseKwSearchBody(body)
        const songs = data.musiclist || data.abslist || []
        const name = decodeName(data.artist || data.name || '')
        return {
          list: songs.map(item => ({
            singer: decodeName(item.artist || item.ARTIST || name),
            name: decodeName(item.name || item.SONGNAME || ''),
            albumName: decodeName(item.album || item.ALBUM || ''),
            albumId: item.albumid || item.ALBUMID || '',
            songmid: String(item.id || item.MUSICRID || '').replace('MUSIC_', ''),
            source: 'kw',
            interval: item.duration ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}` : null,
            img: normalizeKwPicUrl(item.hts_img || item.img) || '',
            lrc: null,
            otherSource: null,
            types: [{ type: '128k', size: null }],
            _types: { '128k': { size: null } },
            typeUrl: {},
          })),
          page,
          limit,
          total: parseInt(data.TOTAL || data.songnum || songs.length) || songs.length,
          source: 'kw',
        }
      })
  },
  getSearchDetail(id, page = 1, limit = 100) {
    return Promise.all([
      this.getInfo(id).catch(() => null),
      this.getSongList(id, page, limit),
    ]).then(([info, songs]) => {
      return {
        list: songs.list,
        page,
        limit: songs.limit,
        total: songs.total,
        source: 'kw',
        info: {
          name: info?.info?.name ?? '',
          img: info?.info?.avatar ?? '',
          desc: info?.info?.desc ?? '',
          author: info?.info?.name ?? '',
          play_count: info?.count?.music ? String(info.count.music) : '',
        },
      }
    })
  },
  getInfo(id) {
    return httpFetch(`http://search.kuwo.cn/r.s?stype=artistinfo&artistid=${id}&show_copyright_off=0&encoding=utf8&vipver=MUSIC_9.1.0`)
      .promise.then(({ body }) => {
        const infoBody = parseKwSearchBody(body)
        const name = decodeName(infoBody.name || infoBody.artist || '')
        return {
          source: 'kw',
          id,
          info: {
            name,
            desc: decodeName(infoBody.info || infoBody.intro || ''),
            avatar: normalizeKwPicUrl(infoBody.hts_pic || infoBody.pic) || '',
            gender: '',
          },
          count: {
            music: parseInt(infoBody.songnum || infoBody.SONGNUM || 0) || 0,
            album: parseInt(infoBody.albumnum || infoBody.ALBUMNUM || 0) || 0,
            fans: parseInt(infoBody.fans || infoBody.FANS || 0) || 0,
          },
        }
      })
  },
  getAlbumList(id, page = 1, limit = 20) {
    return httpFetch(`http://search.kuwo.cn/r.s?stype=albumlist&artistid=${id}&pn=${page - 1}&rn=${limit}&show_copyright_off=0&encoding=utf8&vipver=MUSIC_9.1.0`)
      .promise.then(({ body }) => {
        const data = parseKwSearchBody(body)
        const albums = data.albumlist || data.abslist || []
        return {
          source: 'kw',
          list: albums.map(item => ({
            id: String(item.albumid || item.ALBUMID || item.id),
            count: parseInt(item.songnum || item.SONGNUM || 0) || 0,
            time: String(item.releasedate || item.RELEASEDATE || '').slice(0, 10),
            info: {
              name: decodeName(item.name || item.ALBUM || item.album || ''),
              author: decodeName(item.artist || item.ARTIST || ''),
              img: normalizeKwPicUrl(item.hts_img || item.img || item.PICPATH || item.pic) || '',
              desc: null,
            },
          })).filter(item => item.id),
          limit,
          page,
          total: parseInt(data.TOTAL || data.total || data.albumnum || albums.length) || albums.length,
        }
      })
  },
}
