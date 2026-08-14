declare global {
  namespace LX.QQMusic {
    interface Status {
      configured: boolean
    }

    interface LoginResult {
      configured: boolean
    }

    interface DailyRecommend {
      info: {
        name: string
        desc: string
        img: string
      }
      list: Array<Record<string, any>>
      total: number
    }

    interface RadioItem {
      id: number
      name: string
      img: string
      listenCount: number
    }

    interface RadioGroup {
      id: number
      name: string
      list: RadioItem[]
    }

    interface RadarRecommend {
      groups: RadioGroup[]
    }

    interface PlaylistItem {
      id: string
      name: string
      author: string
      img: string
      desc: string
      playCount: number
    }

    interface PlaylistRecommend {
      list: PlaylistItem[]
    }

    interface NewSongRecommend {
      type: number
      name: string
      list: Array<Record<string, any>>
      total: number
    }

    interface PlayReport {
      source: LX.Source
      id: string
      name: string
      singer: string
      albumName: string
      songmid?: string
      songId?: string | number
      albumId?: string | number
    }

    interface PlaylistSyncTrackInput {
      id: string
      source: LX.Source
      name: string
      singer: string
      albumName: string
      interval: string | null
      qqSongMid?: string
      qqSongId?: string | number
    }

    interface PlaylistSyncPreviewRequest {
      name: string
      tracks: PlaylistSyncTrackInput[]
    }

    interface PlaylistSyncUnmatchedTrack {
      id: string
      name: string
      singer: string
    }

    interface PlaylistSyncPreview {
      token: string
      name: string
      total: number
      matched: number
      duplicates: number
      unmatched: PlaylistSyncUnmatchedTrack[]
    }

    interface PlaylistSyncCommitRequest {
      token: string
    }

    interface PlaylistSyncResult {
      playlistId: string
      name: string
      added: number
      duplicates: number
      unmatched: number
    }
  }
}

export {}
