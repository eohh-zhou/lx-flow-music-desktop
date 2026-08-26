declare global {
  namespace LX.NeteaseMusic {
    interface Status {
      configured: boolean
    }

    interface LoginResult {
      configured: boolean
    }

    interface SongRecommend {
      info: {
        name: string
        desc: string
        img: string
      }
      list: Array<Record<string, any>>
      total: number
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

    interface AccountPlaylistItem extends PlaylistItem {
      trackCount: number
      subscribed: boolean
      specialType: number
    }

    interface AccountPlaylists {
      list: AccountPlaylistItem[]
    }

    interface AccountPlaylistDetailRequest {
      id: string
    }

    interface AccountPlaylistDetail {
      info: {
        name: string
        desc: string
        img: string
        author: string
        playCount: number
      }
      list: Array<Record<string, any>>
      total: number
    }

    interface PlaylistSyncTrackInput {
      id: string
      source: LX.Source
      name: string
      singer: string
      albumName: string
      interval: string | null
      neteaseSongId?: string
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
      skipped: number
    }
  }
}

export {}
