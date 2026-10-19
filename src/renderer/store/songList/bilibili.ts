import { shallowReactive } from '@common/utils/vueTools'

export const biliBrowseSession = shallowReactive({
  tagId: '',
  sortId: 'hot',
  page: 1,
})
