const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
export const getMetadataKey = musicInfo => JSON.stringify([musicInfo.id, musicInfo.meta.bilibili?.rawTitle ?? musicInfo.name, musicInfo.meta.albumName, musicInfo.interval])
const noise = /(?:\b(?:4k|8k|1080p|720p|60fps)+\b|\b(?:hi-res|hifi|mv|pv)\b|高音质|高音質|无损音质|無損音質|无损|無損|超清|高清|完整版|官方音源|官方音乐视频|动态歌词|動態歌詞|歌词版|歌詞版|中英字幕|中文字幕)/gi
const clean = value => String(value ?? '').normalize('NFKC')
  .replace(/【[^】]*】|\[[^\]]*\]/g, part => part.replace(noise, '').replace(/[【】[\]\s]/g, '') ? part : '')
  .replace(noise, '').replace(/^\s*(?:P\s*)?\d{1,3}\s*[.、:：)-]\s*/i, '')
  .replace(/^[\s|:：\-—]+|[\s|:：\-—]+$/g, '').trim()

// An uploader identifies the video publisher, never the performer of a song.
export const parseTrackMetadata = (rawTitle, context = '') => {
  const title = clean(rawTitle)
  const quoted = /《([^》]+)》/.exec(title)
  if (quoted) {
    const prefix = clean(title.slice(0, quoted.index))
    return { name: quoted[1].trim(), singer: prefix.length <= 40 && !/[,，。!！?？:：]|翻唱|cover|原唱|这首|這首|保证|保證|只要|爱上|愛上|前奏/i.test(prefix) ? prefix : '' }
  }
  const divided = /^(.{1,40}?)\s+[-–—|]\s+(.+)$/.exec(title) ?? /^([^-]{1,20})-(.+)$/.exec(title)
  if (divided) return { name: divided[2].trim(), singer: divided[1].trim() }
  const artist = /(?:^|【|\[)([^【】[\]\n]{1,24}?)(?:歌曲合集|音乐合集|音樂合集|金曲精选|金曲精選|精选|精選)/.exec(context)?.[1]
  return { name: title || String(rawTitle ?? '').trim(), singer: artist && !/音质|音質|单曲|單曲|中文|华语|華語|经典|經典|值得|首|流行|热门|熱門/.test(artist) ? clean(artist) : '' }
}

const seconds = interval => String(interval ?? '').split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0)
const version = value => {
  const text = String(value ?? '')
  return [/(?:\blive\b|现场|現場|演唱会|演唱會)/i, /(?:\bdj\b|remix|混音)/i, /(?:伴奏|纯音乐|純音樂|instrumental|无人声|無人聲)/i]
    .map(pattern => pattern.test(text))
}
const baseTitle = value => normalize(String(value ?? '').replace(/\([^)]*\)|（[^）]*）|《|》/g, ''))

export const rankLyricCandidates = (musicInfo, lists) => {
  const rawTitle = musicInfo.meta.bilibili?.rawTitle ?? musicInfo.name
  const parsed = parseTrackMetadata(rawTitle, musicInfo.meta.albumName)
  const names = new Set([baseTitle(parsed.name), baseTitle(rawTitle)])
  // Some uploads use “song - artist” instead of “artist - song”. Catalogue metadata disambiguates it.
  if (parsed.singer) names.add(baseTitle(parsed.singer))
  const titleContext = normalize(rawTitle + ' ' + musicInfo.meta.albumName)
  const duration = seconds(musicInfo.interval)
  const inputVersion = version(rawTitle)
  const ranked = []
  const seen = new Set()
  for (const result of lists) {
    for (const candidate of (result?.list ?? []).slice(0, 30)) {
      const id = `${candidate.source}_${candidate.songmid}`
      if (seen.has(id) || !candidate.singer || !names.has(baseTitle(candidate.name))) continue
      seen.add(id)
      const candidateVersion = version(candidate.name)
      if (inputVersion.some((value, index) => value != candidateVersion[index])) continue
      const candidateDuration = seconds(candidate.interval)
      const difference = duration && candidateDuration ? Math.abs(duration - candidateDuration) : Infinity
      const artist = normalize(candidate.singer)
      const artistHint = artist.length > 1 && titleContext.includes(artist)
      if (parsed.singer && !artistHint) continue
      if (difference > (artistHint ? 20 : 10)) continue
      const exactTitle = normalize(candidate.name) == normalize(parsed.name) || normalize(candidate.name) == normalize(rawTitle)
      const score = (artistHint ? 60 : 0) + (difference <= 4 ? 50 : difference <= 10 ? 30 : 10) + (exactTitle ? 20 : 0)
      ranked.push({ candidate, score, artist, artistHint })
    }
  }
  const artistSources = new Map()
  for (const item of ranked) {
    if (!artistSources.has(item.artist)) artistSources.set(item.artist, new Set())
    artistSources.get(item.artist).add(item.candidate.source)
  }
  // Count agreement across providers once per artist; duplicate albums are not extra evidence.
  for (const item of ranked) item.score += (artistSources.get(item.artist).size - 1) * 15
  ranked.sort((a, b) => b.score - a.score)
  const first = ranked[0]
  if (!first) return []
  if (!first.artistHint && artistSources.get(first.artist).size < 2) return []
  const competitor = ranked.find(item => item.artist != first.artist)
  if (competitor && first.score - competitor.score < 15) return []
  return ranked.filter(item => item.artist == first.artist).map(item => item.candidate)
}
