import { app, dialog } from 'electron'
import './utils/logInit'
import '@common/error'
import {
  initGlobalData,
  initSingleInstanceHandle,
  applyElectronEnvParams,
  setUserDataPath,
  registerDeeplink,
  listenerAppEvent,
} from './app'
import { isLinux, log } from '@common/utils'
import { initAppSetting } from '@main/app'
import registerModules from '@main/modules'
import { isExistWindow } from '@main/modules/winMain'

app.setName('LX Flow Music')
if (process.platform == 'win32') app.setAppUserModelId('io.lxflowmusic.desktop')

let initPromise: Promise<void> | null = null
let modulesRegistered = false

// 初始化应用。多个入口（ready、activate、deep link、second-instance）可能同时触发启动。
const init = () => {
  if (modulesRegistered) {
    if (!isExistWindow()) global.lx.event_app.app_inited()
    return
  }
  if (initPromise) return

  console.log('init')
  initPromise = initAppSetting()
    .then(() => {
      registerModules()
      modulesRegistered = true
      global.lx.event_app.app_inited()
    })
    .catch(error => {
      initPromise = null
      log.error(error)
      const detail = error instanceof Error ? error.stack ?? error.message : String(error)
      // Do not leave a background-only process when settings or the database cannot open.
      dialog.showErrorBox('LX Flow Music 启动失败', `${detail}\n\n请检查数据目录权限后重新启动。`)
      app.quit()
    })
}

initGlobalData()
applyElectronEnvParams()
setUserDataPath()
// Resolve the final user-data directory before taking the single-instance lock.
// This is required for portable builds and prevents an older instance from
// swallowing a newly launched build into the background.
initSingleInstanceHandle(init)
registerDeeplink(init)
listenerAppEvent(init)


// https://github.com/electron/electron/issues/16809
void app.whenReady().then(() => {
  isLinux ? setTimeout(init, 300) : init()
})
