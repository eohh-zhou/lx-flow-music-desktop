import { httpFetch } from '../../request'

export default {
  _requestObj: null,
  _rawData: null,
  _rawPromise: null,
  async getList(retryNum = 0, type) {
    if (retryNum > 2) return Promise.reject(new Error('try max num'))
    try {
      const data = await this.getRawData()
      return { source: 'mg', list: this.filterList(data, type) }
    } catch (err) {
      this._rawData = null
      this._rawPromise = null
      return this.getList(retryNum + 1, type)
    }
  },
  async getRawData() {
    if (this._rawData) return this._rawData
    if (this._rawPromise) return this._rawPromise

    if (this._requestObj) this._requestObj.cancelHttp()
    const _requestObj = httpFetch('http://jadeite.migu.cn:7090/music_search/v3/search/hotword')
    this._requestObj = _requestObj
    this._rawPromise = _requestObj.promise.then(({ body, statusCode }) => {
      if (statusCode != 200 || body.code !== '000000') throw new Error('获取热搜词失败')
      this._rawData = body.data || {}
      return this._rawData
    }).finally(() => {
      this._rawPromise = null
    })
    return this._rawPromise
  },
  filterList(data, type) {
    if (type == 'singer') {
      return (data.discovery || []).map(item => item.word).filter(Boolean)
    }
    if (type == 'songlist' || type == 'album') return []
    const rawList = data.hotwords?.[0]?.hotwordList || []
    return rawList.filter(item => item.resourceType == 'song').map(item => item.word).filter(Boolean)
  },
}
