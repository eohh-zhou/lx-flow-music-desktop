import { ref } from '@common/utils/vueTools'
// import { useI18n } from '@renderer/plugins/i18n'
// import { } from '@renderer/store/search/state'
import { getAndSetListDetail } from '@renderer/store/leaderboard/action'
import { listDetailInfo } from '@renderer/store/leaderboard/state'
import { playSongListDetail } from '../action'

export default () => {
  const listRef = ref<any>(null)

  const handlePlayList = (index: number) => {
    void playSongListDetail(listDetailInfo.id, listDetailInfo.list, index)
  }

  const getList = (id: string, page: number) => {
    void getAndSetListDetail(id, page).then(() => {
      setTimeout(() => {
        if (listRef.value) listRef.value.scrollToTop()
      })
    }).catch(() => {
      // 加载失败时 store 已设置「加载失败」提示，此处吞掉异常避免未处理的 rejection 触发 dev overlay
    })
  }

  return {
    listRef,
    listDetailInfo,
    getList,
    handlePlayList,
  }
}
