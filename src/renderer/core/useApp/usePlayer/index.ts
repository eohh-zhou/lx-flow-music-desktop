import {
  createAudio,
} from '@renderer/plugins/player'
import useMediaDevice from './useMediaDevice'
import usePlayerEvent from './usePlayerEvent'
import usePlayer from './usePlayer'
import usePlayStatus from './usePlayStatus'
import usePlayHistory from './usePlayHistory'

export default () => {
  createAudio()

  usePlayerEvent()
  useMediaDevice() // 初始化音频驱动输出设置
  usePlayer()
  usePlayHistory() // 记录播放过的歌曲到试听列表
  const initPlayStatus = usePlayStatus()

  return () => {
    void initPlayStatus()
  }
}

