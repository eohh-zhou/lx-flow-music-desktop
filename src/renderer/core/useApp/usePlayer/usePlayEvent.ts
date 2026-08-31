import { onBeforeUnmount } from '@common/utils/vueTools'
import { useI18n } from '@renderer/plugins/i18n'
import { musicInfo, playMusicInfo } from '@renderer/store/player/state'
import { setStop, isEmpty } from '@renderer/plugins/player'
import { playNext, setMusicUrl } from '@renderer/core/player'
import { setAllStatus } from '@renderer/store/player/action'
import { appSetting } from '@renderer/store/setting'
import { reportQQMusicPlay } from '@renderer/utils/ipc'
import { dialog } from '@renderer/plugins/Dialog'

export default () => {
  const t = useI18n()
  let retryNum = 0
  let prevTimeoutId: string | null = null
  let isQQMusicLoginAlertShown = false
  let reportedMusicId = ''

  let loadingTimeout: NodeJS.Timeout | null = null
  let delayNextTimeout: NodeJS.Timeout | null = null
  const startLoadingTimeout = () => {
    // console.log('start load timeout')
    clearLoadingTimeout()
    loadingTimeout = setTimeout(() => {
      if (window.lx.isPlayedStop) {
        prevTimeoutId = null
        setAllStatus('')
        return
      }

      // 如果加载超时，则尝试刷新URL
      if (prevTimeoutId == musicInfo.id) {
        prevTimeoutId = null
        void playNext(true)
      } else {
        prevTimeoutId = musicInfo.id
        if (playMusicInfo.musicInfo) setMusicUrl(playMusicInfo.musicInfo, true)
      }
    }, 25000)
  }
  const clearLoadingTimeout = () => {
    if (!loadingTimeout) return
    // console.log('clear load timeout')
    clearTimeout(loadingTimeout)
    loadingTimeout = null
  }

  const clearDelayNextTimeout = () => {
    // console.log(this.delayNextTimeout)
    if (!delayNextTimeout) return
    clearTimeout(delayNextTimeout)
    delayNextTimeout = null
  }
  const addDelayNextTimeout = () => {
    clearDelayNextTimeout()
    delayNextTimeout = setTimeout(() => {
      if (window.lx.isPlayedStop) {
        setAllStatus('')
        return
      }
      void playNext(true)
    }, 5000)
  }

  const handleLoadstart = () => {
    if (window.lx.isPlayedStop) return
    if (appSetting['player.autoSkipOnError']) startLoadingTimeout()
    setAllStatus(t('player__loading'))
  }

  const handleLoadeddata = () => {
    setAllStatus(t('player__loading'))
  }

  const handlePlaying = () => {
    setAllStatus('')
    clearLoadingTimeout()
    if (!appSetting['qqMusic.enabled']) return
    const current = playMusicInfo.musicInfo
    if (!current) return
    const info = 'progress' in current ? current.metadata.musicInfo : current
    const reportKey = `${info.source}:${info.id}`
    if (reportedMusicId == reportKey) return
    reportedMusicId = reportKey
    void reportQQMusicPlay({
      source: info.source,
      id: info.id,
      name: info.name,
      singer: info.singer,
      albumName: info.meta.albumName,
      songmid: info.source === 'tx' ? String(info.meta.songId) : undefined,
      songId: info.source === 'tx' ? info.meta.id : undefined,
      albumId: info.source === 'tx' ? info.meta.albumId : undefined,
    }).then(result => {
      if (!result.reported && result.reason == 'song-not-resolved') {
        console.warn('企鹅音乐 play report skipped: song not resolved')
      }
    }).catch(error => {
      if (reportedMusicId == reportKey) reportedMusicId = ''
      console.warn('企鹅音乐 play report failed', error)
      const message = error instanceof Error ? error.message : String(error)
      if (isQQMusicLoginAlertShown || !/企鹅音乐登录状态已失效|module code 1000/i.test(message)) return
      isQQMusicLoginAlertShown = true
      void dialog({
        message: '企鹅音乐登录状态已失效，播放记录无法同步。请前往“设置 → 企鹅音乐登录”重新登录。',
        confirmButtonText: t('alert_button_text'),
      })
    })
  }

  const handleEmpied = () => {
    clearDelayNextTimeout()
    clearLoadingTimeout()
  }

  const handleWating = () => {
    setAllStatus(t('player__buffering'))
  }

  const handleError = (errCode?: number) => {
    if (!musicInfo.id) return
    clearLoadingTimeout()
    if (window.lx.isPlayedStop) return
    if (!isEmpty()) setStop()
    if (playMusicInfo.musicInfo && errCode !== 1 && retryNum < 2) { // 若音频URL无效则尝试刷新2次URL
      // console.log(this.retryNum)
      retryNum++
      setMusicUrl(playMusicInfo.musicInfo, true)
      setAllStatus(t('player__refresh_url'))
      return
    }

    if (appSetting['player.autoSkipOnError']) {
      if (document.hidden) {
        console.warn('error skip to next')
        void playNext(true)
      } else {
        setAllStatus(t('player__error'))
        setTimeout(addDelayNextTimeout)
      }
    }
  }

  const handleSetPlayInfo = () => {
    reportedMusicId = ''
    retryNum = 0
    prevTimeoutId = null
    clearDelayNextTimeout()
    clearLoadingTimeout()
  }

  // const handlePlayedStop = () => {
  //   clearDelayNextTimeout()
  //   clearLoadingTimeout()
  // }


  window.app_event.on('playerLoadstart', handleLoadstart)
  window.app_event.on('playerLoadeddata', handleLoadeddata)
  window.app_event.on('playerPlaying', handlePlaying)
  window.app_event.on('playerWaiting', handleWating)
  window.app_event.on('playerEmptied', handleEmpied)
  window.app_event.on('playerError', handleError)
  window.app_event.on('musicToggled', handleSetPlayInfo)

  onBeforeUnmount(() => {
    window.app_event.off('playerLoadstart', handleLoadstart)
    window.app_event.off('playerLoadeddata', handleLoadeddata)
    window.app_event.off('playerPlaying', handlePlaying)
    window.app_event.off('playerWaiting', handleWating)
    window.app_event.off('playerEmptied', handleEmpied)
    window.app_event.off('playerError', handleError)
    window.app_event.off('musicToggled', handleSetPlayInfo)
  })
}
