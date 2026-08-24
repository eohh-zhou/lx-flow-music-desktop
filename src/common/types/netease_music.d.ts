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
  }
}

export {}
