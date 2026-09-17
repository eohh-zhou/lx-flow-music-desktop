import { httpFetch } from '../../request'

export default {
  _requestObj: null,
  _rawList: null,
  _rawPromise: null,
  async getList(retryNum = 0, type) {
    if (retryNum > 2) return Promise.reject(new Error('try max num'))
    try {
      const rawList = await this.getRawList()
      return { source: 'tx', list: this.filterList(rawList, type) }
    } catch (err) {
      this._rawList = null
      this._rawPromise = null
      return this.getList(retryNum + 1, type)
    }
  },
  async getRawList() {
    if (Array.isArray(this._rawList) && this._rawList.length) return this._rawList
    if (this._rawPromise) return this._rawPromise

    if (this._requestObj) this._requestObj.cancelHttp()
    const _requestObj = httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'post',
      body: {
        comm: {
          ct: '19',
          cv: '1803',
          guid: '0',
          patch: '118',
          psrf_access_token_expiresAt: 0,
          psrf_qqaccess_token: '',
          psrf_qqopenid: '',
          psrf_qqunionid: '',
          tmeAppID: 'qqmusic',
          tmeLoginType: 0,
          uin: '0',
          wid: '0',
        },
        hotkey: {
          method: 'GetHotkeyForQQMusicPC',
          module: 'tencent_musicsoso_hotkey.HotkeyService',
          param: {
            search_id: '',
            uin: 0,
          },
        },
      },
      headers: {
        Referer: 'https://y.qq.com/portal/player.html',
      },
    })
    this._requestObj = _requestObj
    this._rawPromise = _requestObj.promise.then(({ body, statusCode }) => {
      if (statusCode != 200 || body.code !== 0) throw new Error('获取热搜词失败')
      const rawList = body.hotkey?.data?.vec_hotkey
      if (!Array.isArray(rawList)) throw new Error('获取热搜词失败')
      this._rawList = rawList
      return rawList
    }).finally(() => {
      this._rawPromise = null
    })
    return this._rawPromise
  },
  filterList(rawList, type) {
    let list = rawList
    if (type == 'singer') list = rawList.filter(item => item.kind == 1)
    else if (type == 'music') list = rawList.filter(item => item.kind == 2)
    else if (type == 'songlist' || type == 'album') return []
    return list.map(item => item.query).filter(Boolean)
  },
}
