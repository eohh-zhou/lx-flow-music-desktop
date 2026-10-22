import type { ListeningReport } from '@common/types/listening'
import type { I18n } from '@root/lang/i18n'

export const formatListeningHours = (seconds: number) => {
  const hours = Math.max(0, Number.isFinite(seconds) ? seconds : 0) / 3600
  if (hours > 0 && hours < 0.01) return '<0.01'
  return hours.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export const listeningHourRange = (hours: number[]) => {
  const peak = Math.max(0, ...hours)
  if (!peak) return '—'
  const hour = hours.indexOf(peak)
  return `${String(hour).padStart(2, '0')}:00 — ${String((hour + 1) % 24).padStart(2, '0')}:00`
}

export interface ListeningShareModel {
  period: string
  title: string
  hours: string
  hoursLabel: string
  subtitle: string
  status: string
  metrics: Array<{ value: string, label: string }>
  tracksTitle: string
  tracks: Array<{ title: string, subtitle: string, count: string }>
  emptyTracks: string
  insights: Array<{ label: string, value: string, detail: string }>
  footer: string[]
}

export const buildListeningShareModel = (report: ListeningReport, t: I18n['t'], includeNames: boolean): ListeningShareModel => {
  const busiestDay = [...report.days].sort((a, b) => b.seconds - a.seconds)[0]
  const firstArtist = report.artists[0]
  return {
    period: report.period.replace('-', '.'),
    title: t(report.period.length == 4 ? 'listening__annual_card' : 'listening__monthly_card'),
    hours: formatListeningHours(report.seconds),
    hoursLabel: t('listening__hours'),
    subtitle: t('listening__recap_title'),
    status: t(report.archived ? 'listening__archived' : 'listening__ongoing'),
    metrics: [
      { value: String(report.activeDays), label: t('listening__active_days') },
      { value: String(report.uniqueTracks) + (report.limited ? '+' : ''), label: t('listening__unique') },
      { value: String(report.plays), label: t('listening__plays') },
    ],
    tracksTitle: t('listening__share_tracks'),
    tracks: includeNames ? report.tracks.slice(0, 3).map(item => ({
      title: item.track.name,
      subtitle: item.track.singer || t('listening__unknown'),
      count: t('listening__times', { count: item.plays }),
    })) : [],
    emptyTracks: t(includeNames ? 'listening__no_qualified' : 'listening__names_hidden'),
    insights: [
      { label: t('listening__favorite_hour'), value: listeningHourRange(report.hours), detail: t('listening__streak_days', { days: report.streak }) },
      includeNames && firstArtist
        ? { label: t('listening__favorite_artist'), value: firstArtist.name, detail: `${formatListeningHours(firstArtist.seconds)} ${t('listening__hours')}` }
        : { label: t('listening__busiest_day'), value: busiestDay?.date.replaceAll('-', '.') ?? '—', detail: `${formatListeningHours(busiestDay?.seconds ?? 0)} ${t('listening__hours')}` },
    ],
    footer: [t('listening__share_local'), ...(report.partial ? [t('listening__share_partial')] : []), ...(report.limited ? [t('listening__share_limited')] : [])],
  }
}
