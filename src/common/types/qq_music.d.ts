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
  }
}

export {}
