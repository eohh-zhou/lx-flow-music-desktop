export const BILIBILI_HEADERS = {
  Referer: 'https://www.bilibili.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
}

export const BILIBILI_MEDIA_URLS = ['bilivideo.com', 'bilivideo.cn', 'bilivideo.net', 'hdslb.com', 'biliimg.com'].map(domain => `*://*.${domain}/*`)

export const getBilibiliMediaHeaders = (url: string): Record<string, string> => {
  try {
    const parsed = new URL(url)
    if (/^https?:$/.test(parsed.protocol) && /(^|\.)(bilivideo\.(com|cn|net)|hdslb\.com|biliimg\.com)$/.test(parsed.hostname)) return BILIBILI_HEADERS
  } catch {}
  return {}
}
