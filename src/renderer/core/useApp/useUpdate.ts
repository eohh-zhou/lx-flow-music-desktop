import { nextTick, onBeforeUnmount, watch } from '@common/utils/vueTools'
import {
  onUpdateAvailable,
  onUpdateDownloaded,
  onUpdateError,
  onUpdateNotAvailable,
  onUpdateProgress,
  getIgnoreVersion,
  getLastStartInfo,
  saveLastStartInfo,
} from '@renderer/utils/ipc'
import { compareVer, isWin } from '@common/utils'
import { isShowChangeLog, versionInfo } from '@renderer/store'
import { dialog } from '@renderer/plugins/Dialog'
import { appSetting } from '@renderer/store/setting'
import type { UpdateInfo } from 'electron-updater'

export default () => {
  let isShowedChangeLog = false

  // 更新超时定时器
  let updateTimeout: number | null = null
  const startUpdateTimeout = () => {
    if (window.lx.isProd && !(isWin && process.arch.includes('arm'))) {
      updateTimeout = window.setTimeout(() => {
        updateTimeout = null
        void nextTick(() => {
          showUpdateModal()
          setTimeout(() => {
            void dialog({
              message: window.i18n.t('update__timeout_top'),
              confirmButtonText: window.i18n.t('alert_button_text'),
            })
          }, 500)
        })
      }, 60 * 60 * 1000)
    }
  }

  const clearUpdateTimeout = () => {
    if (!updateTimeout) return
    clearTimeout(updateTimeout)
    updateTimeout = null
  }

  const handleShowChangeLog = () => {
    isShowedChangeLog = true
    void getLastStartInfo().then((version) => {
      if (version == process.versions.app) return
      saveLastStartInfo(process.versions.app)
      if (!appSetting['common.showChangeLog']) return
      if (version) {
        if (compareVer(process.versions.app, version) < 0) {
          void dialog({
            message: window.i18n.t('update__downgrade_tip', { ver: `${version} → ${process.versions.app}` }),
            confirmButtonText: window.i18n.t('update__ignore_confirm_tip_confirm'),
          })
          return
        }

        if (compareVer(version, versionInfo.newVersion!.version) >= 0) return
      } else if (
        // 如果当前版本不在已发布的版本中，则不需要显示更新日志
        ![{ version: versionInfo.newVersion!.version, desc: '' }, ...(versionInfo.newVersion!.history ?? [])]
          .some(i => i.version == process.versions.app)
      ) return
      isShowChangeLog.value = true
    })
  }

  const getReleaseNotes = (releaseNotes: UpdateInfo['releaseNotes']) => {
    if (Array.isArray(releaseNotes)) return releaseNotes.map(note => note.note ?? '').filter(Boolean).join('\n\n')
    return releaseNotes ?? ''
  }

  const setUpdateInfo = (info: UpdateInfo) => {
    versionInfo.newVersion = {
      version: info.version,
      desc: getReleaseNotes(info.releaseNotes),
    }
  }

  const showUpdateModal = (status?: LX.UpdateStatus) => {
    const result = versionInfo.newVersion
    versionInfo.reCheck = false
    if (!result) {
      versionInfo.isUnknown = true
      versionInfo.status = 'error'
      versionInfo.showModal = true
      return
    }

    versionInfo.isUnknown = false
    if (compareVer(versionInfo.version, result.version) != -1) {
      versionInfo.status = 'idle'
      versionInfo.isLatest = true
      handleShowChangeLog()
      return
    }

    void getIgnoreVersion().then((ignoreVersion) => {
      versionInfo.isLatest = false
      let preStatus = versionInfo.status
      if (status) versionInfo.status = status
      if (result.version === ignoreVersion) return
      void nextTick(() => {
        versionInfo.showModal = true
        if (status == 'error' && preStatus == 'downloading' && !localStorage.getItem('update__download_failed_tip')) {
          setTimeout(() => {
            void dialog({
              message: window.i18n.t('update__error_top'),
              confirmButtonText: window.i18n.t('alert_button_text'),
            }).finally(() => {
              localStorage.setItem('update__download_failed_tip', '1')
            })
          }, 500)
        }
      })
    })
  }

  const rUpdateAvailable = onUpdateAvailable(({ params: info }) => {
    setUpdateInfo(info)
    const status: LX.UpdateStatus = appSetting['common.tryAutoUpdate'] ? 'downloading' : 'idle'
    if (status == 'downloading') {
      startUpdateTimeout()
    }
    void nextTick(() => {
      showUpdateModal(status)
    })
  })
  const rUpdateNotAvailable = onUpdateNotAvailable(({ params: info }) => {
    clearUpdateTimeout()
    setUpdateInfo(info)
    versionInfo.isLatest = true
    versionInfo.isUnknown = false
    versionInfo.status = 'idle'
    handleShowChangeLog()
  })
  const rUpdateError = onUpdateError(() => {
    clearUpdateTimeout()
    // versionInfo.status = 'error'
    void nextTick(() => {
      showUpdateModal('error')
    })
  })
  const rUpdateProgress = onUpdateProgress(({ params: progress }) => {
    versionInfo.downloadProgress = progress
  })
  const rUpdateDownloaded = onUpdateDownloaded(({ params: info }) => {
    clearUpdateTimeout()
    // versionInfo.status = 'downloaded'
    void nextTick(() => {
      showUpdateModal('downloaded')
    })
  })

  watch(() => versionInfo.showModal, (visible) => {
    if (visible || isShowedChangeLog || versionInfo.status == 'downloaded') return
    setTimeout(() => {
      handleShowChangeLog()
    }, 1000)
  })

  onBeforeUnmount(() => {
    clearUpdateTimeout()
    rUpdateAvailable()
    rUpdateNotAvailable()
    rUpdateError()
    rUpdateProgress()
    rUpdateDownloaded()
  })
}
