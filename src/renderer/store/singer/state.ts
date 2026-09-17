import { reactive } from '@common/utils/vueTools'

export interface SingerAlbumItem {
  id: string
  count?: number
  time?: string
  info: {
    name: string
    author: string
    img: string
    desc?: string | null
  }
}

export interface SingerDetailInfo {
  id: string
  source: LX.OnlineSource
  name: string
  img: string
  desc: string
  songCount: number
  albumCount: number
  fansCount: number
  songs: LX.Music.MusicInfoOnline[]
  songPage: number
  songLimit: number
  songTotal: number
  albums: SingerAlbumItem[]
  albumPage: number
  albumLimit: number
  albumTotal: number
  key: string | null
  songKey: string | null
  albumKey: string | null
  noItemLabel: string
  songNoItemLabel: string
  albumNoItemLabel: string
}

export const singerDetailInfo = reactive<SingerDetailInfo>({
  id: '',
  source: 'kw',
  name: '',
  img: '',
  desc: '',
  songCount: 0,
  albumCount: 0,
  fansCount: 0,
  songs: [],
  songPage: 1,
  songLimit: 100,
  songTotal: 0,
  albums: [],
  albumPage: 1,
  albumLimit: 20,
  albumTotal: 0,
  key: null,
  songKey: null,
  albumKey: null,
  noItemLabel: '',
  songNoItemLabel: '',
  albumNoItemLabel: '',
})
