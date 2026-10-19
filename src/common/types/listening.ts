export interface ListeningTrack {
  id: string
  name: string
  singer: string
  source: string
}

// One row per listening session; checkpoints replace the row rather than counting another play.
export interface ListeningCheckpoint {
  sessionId: string
  revision: number
  track: ListeningTrack
  startedAt: number
  updatedAt: number
  duration: number
  listened: number
  coverage: number
  completed: boolean
  skipped: boolean
}

export const isQualifiedListen = (entry: Pick<ListeningCheckpoint, 'listened' | 'coverage' | 'duration'>) =>
  entry.listened >= 30 || (entry.duration > 0 && entry.coverage / entry.duration >= 0.9)

export interface ListeningPreferences {
  recording: boolean
  personalize: boolean
  recordingSince: number
  preferenceSince: number
  startedAt: number
  ignored: ListeningTrack[]
}

export interface ListeningTotals {
  seconds: number
  plays: number
  completed: number
  skipped: number
}

export interface ListeningReport extends ListeningTotals {
  period: string
  generatedAt: number
  firstAt: number
  lastAt: number
  archived: boolean
  partial: boolean
  limited: boolean
  uniqueTracks: number
  activeDays: number
  streak: number
  tracks: Array<ListeningTotals & { track: ListeningTrack }>
  artists: Array<ListeningTotals & { name: string }>
  days: Array<{ date: string, seconds: number }>
  hours: number[]
  sources: Array<{ source: string, seconds: number }>
}

export interface ListeningOverview {
  preferences: ListeningPreferences
  periods: string[]
  storedBytes: number
  sessions: number
}

export type ListeningCommand =
  | { type: 'recording' | 'personalize', value: boolean }
  | { type: 'resetPreferences' | 'clear' }
  | { type: 'ignore', track: ListeningTrack }
  | { type: 'restore', key: string }

export const listeningTrackKey = (track: Pick<ListeningTrack, 'source' | 'id'>) => `${track.source}:${track.id}`

// Calendar periods use the computer's local time, like the player and report UI.
export const listeningDate = (time: number) => {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
