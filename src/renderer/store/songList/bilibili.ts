import { shallowReactive, markRaw } from '@common/utils/vueTools'
import type { ListInfoItem } from './state'

export const biliBrowseSession = shallowReactive({
  tagId: '',
  sortId: 'hot',
  page: 1,
})

// Results survive a visit to a playlist detail, without triggering a new model call.
export const biliAiSession = shallowReactive({
  hint: '',
  useProfile: false,
  list: markRaw<ListInfoItem[]>([]),
  notice: '',
})
