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
