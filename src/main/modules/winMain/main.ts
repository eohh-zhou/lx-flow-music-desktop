import { BrowserWindow, dialog, session } from 'electron'
import path from 'node:path'
import { createTaskBarButtons, getWindowSizeInfo } from './utils'
import { getPlatform, isLinux, isWin } from '@common/utils'
import { getProxy, isCmdParamEnabled, openDevTools as handleOpenDevTools } from '@main/utils'
import { mainSend } from '@common/mainIpc'
import { sendFocus, sendTaskbarButtonClick, sendMaximizeChange } from './rendererEvent'
import { encodePath } from '@common/utils/electron'

let browserWindow: Electron.BrowserWindow | null = null
let saveBoundsTimer: NodeJS.Timeout | null = null

const saveWindowBounds = () => {
  if (!browserWindow || browserWindow.isDestroyed()) return
  if (browserWindow.isMaximized() || browserWindow.isFullScreen() || !browserWindow.isVisible()) return
  const { width, height } = browserWindow.getContentBounds()
  const bounds = `${width},${height}`
  if (global.lx.appSetting['common.windowBounds'] == bounds) return
  global.lx.event_app.update_config({ 'common.windowBounds': bounds })
}

const handleWindowResize = () => {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(saveWindowBounds, 600)
}

const winEvent = () => {
  if (!browserWindow) return

  const revealMainWindow = () => {
    if (isCmdParamEnabled(global.envParams.cmdParams.hidden) || !browserWindow || browserWindow.isDestroyed()) return
    showWindow()
    setThumbarButtons()
  }

  browserWindow.on('close', event => {
    if (global.lx.isSkipTrayQuit || !global.lx.appSetting['tray.enable']) {
      browserWindow!.setProgressBar(-1)
      // global.lx.mainWindowClosed = true
      global.lx.event_app.main_window_close()
      return
    }

    event.preventDefault()
    browserWindow!.hide()
  })

  browserWindow.on('closed', () => {
    // global.lx.mainWindowClosed = true
    browserWindow = null
  })

  // browserWindow.on('restore', () => {
  //   browserWindow.webContents.send('restore')
  // })
  browserWindow.on('focus', () => {
    sendFocus()
    global.lx.event_app.main_window_focus()
  })

  browserWindow.on('blur', () => {
    global.lx.event_app.main_window_blur()
  })

  browserWindow.once('ready-to-show', () => {
    revealMainWindow()
    // A second-instance handoff or an update check can hide the window during
    // the first paint. Restore it once more after the renderer has settled.
    setTimeout(revealMainWindow, 500)
    setTimeout(revealMainWindow, 1500)
    global.lx.event_app.main_window_ready_to_show()
  })

  browserWindow.on('show', () => {
    global.lx.event_app.main_window_show()

    // 修复隐藏窗口后再显示时任务栏按钮丢失的问题
    setThumbarButtons()
  })
  browserWindow.on('hide', () => {
    global.lx.event_app.main_window_hide()
  })
  browserWindow.on('resize', handleWindowResize)
  browserWindow.on('maximize', () => { sendMaximizeChange(true) })
  browserWindow.on('unmaximize', () => { sendMaximizeChange(false) })
}


export const createWindow = () => {
  closeWindow()
  const windowSizeInfo = getWindowSizeInfo(global.lx.appSetting['common.windowSizeId'])
  const savedBounds = global.lx.appSetting['common.windowBounds']?.split(',').map(Number) ?? []
  const useSavedBounds = savedBounds.length == 2 && savedBounds[0] >= windowSizeInfo.minWidth && savedBounds[1] >= windowSizeInfo.minHeight

  const { shouldUseDarkColors, theme } = global.lx.theme
  const ses = session.fromPartition('persist:win-main')
  const proxy = getProxy()
  setSesProxy(ses, proxy?.host, proxy?.port)

  // 透明窗口在 Windows 上无法通过边缘拖拽调整大小，且缩放渲染易出现残影，故 Windows 使用不透明窗口
  const useTransparent = !isWin && !global.envParams.cmdParams.dt

  /**
   * Initial window options
   */
  const options: Electron.BrowserWindowConstructorOptions = {
    height: useSavedBounds ? savedBounds[1] : windowSizeInfo.height,
    useContentSize: true,
    width: useSavedBounds ? savedBounds[0] : windowSizeInfo.width,
    minWidth: windowSizeInfo.minWidth,
    minHeight: windowSizeInfo.minHeight,
    frame: false,
    transparent: useTransparent,
    hasShadow: true,
    // enableRemoteModule: false,
    // icon: join(global.__static, isWin ? 'icons/256x256.ico' : 'icons/512x512.png'),
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    roundedCorners: true,
    show: !isCmdParamEnabled(global.envParams.cmdParams.hidden),
    webPreferences: {
      session: ses,
      nodeIntegrationInWorker: true,
      contextIsolation: false,
      webSecurity: false,
      nodeIntegration: true,
      sandbox: false,
      enableWebSQL: false,
      webgl: false,
      spellcheck: false, // 禁用拼写检查器
    },
  }
  if (!useTransparent) options.backgroundColor = theme.colors['--color-primary-light-1000']
  if (global.lx.appSetting['common.startInFullscreen']) {
    options.fullscreen = true
    if (isLinux) options.resizable = true
  }
  browserWindow = new BrowserWindow(options)

  const devPort = process.env.LX_DEV_PORT ?? '9080'
  const winURL = process.env.NODE_ENV !== 'production' ? `http://localhost:${devPort}` : `file://${path.join(encodePath(__dirname), 'index.html')}`
  void browserWindow.loadURL(winURL + `?os=${getPlatform()}&dt=${global.envParams.cmdParams.dt}&transparent=${useTransparent}&dark=${shouldUseDarkColors}&theme=${encodeURIComponent(JSON.stringify(theme))}`)

  winEvent()

  if (global.envParams.cmdParams.odt) handleOpenDevTools(browserWindow.webContents)

  // global.lx.mainWindowClosed = false
  // browserWindow.webContents.openDevTools()
  global.lx.event_app.main_window_created(browserWindow)
}

export const isExistWindow = (): boolean => !!browserWindow
export const isShowWindow = (): boolean => {
  if (!browserWindow) return false
  return browserWindow.isVisible() && (isWin ? true : browserWindow.isFocused())
}

export const closeWindow = () => {
  if (!browserWindow) return
  browserWindow.close()
}

const setSesProxy = (ses: Electron.Session, host?: string, port?: string | number) => {
  if (host) {
    void ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http://${host}:${port}`,
    })
  } else {
    void ses.setProxy({
      mode: 'direct',
    })
  }
}
export const setProxy = () => {
  if (!browserWindow) return
  const proxy = getProxy()
  setSesProxy(browserWindow.webContents.session, proxy?.host, proxy?.port)
}


export const sendEvent = <T = any>(name: string, params?: T) => {
  if (!browserWindow) return
  mainSend(browserWindow, name, params)
}

export const showSelectDialog = async(options: Electron.OpenDialogOptions) => {
  if (!browserWindow) throw new Error('main window is undefined')
  return dialog.showOpenDialog(browserWindow, options)
}
export const showDialog = ({ type, message, detail }: Electron.MessageBoxSyncOptions) => {
  if (!browserWindow) return
  dialog.showMessageBoxSync(browserWindow, {
    type,
    message,
    detail,
  })
}
export const showSaveDialog = async(options: Electron.SaveDialogOptions) => {
  if (!browserWindow) throw new Error('main window is undefined')
  return dialog.showSaveDialog(browserWindow, options)
}
export const minimize = () => {
  if (!browserWindow) return
  browserWindow.minimize()
}
export const maximize = () => {
  if (!browserWindow) return
  browserWindow.maximize()
}
export const unmaximize = () => {
  if (!browserWindow) return
  browserWindow.unmaximize()
}
export const maxWindowToggle = () => {
  if (!browserWindow) return
  if (browserWindow.isMaximized()) browserWindow.unmaximize()
  else browserWindow.maximize()
}
export const toggleHide = () => {
  if (!browserWindow) return
  browserWindow.isVisible()
    ? browserWindow.hide()
    : browserWindow.show()
}
export const toggleMinimize = () => {
  if (!browserWindow) return
  if (browserWindow.isVisible()) {
    if (browserWindow.isMinimized()) browserWindow.restore()
    else browserWindow.minimize()
  } else browserWindow.show()
}
export const showWindow = () => {
  if (!browserWindow) return
  if (browserWindow.isVisible()) {
    if (browserWindow.isMinimized()) browserWindow.restore()
    else browserWindow.focus()
  } else browserWindow.show()
}
export const hideWindow = () => {
  if (!browserWindow) return
  browserWindow.hide()
}
export const setWindowBounds = (options: Partial<Electron.Rectangle>) => {
  if (!browserWindow) return
  browserWindow.setBounds(options)
}
export const setProgressBar = (progress: number, options?: Electron.ProgressBarOptions) => {
  if (!browserWindow) return
  browserWindow.setProgressBar(progress, options)
}
export const setIgnoreMouseEvents = (ignore: boolean, options?: Electron.IgnoreMouseEventsOptions) => {
  if (!browserWindow) return
  browserWindow.setIgnoreMouseEvents(ignore, options)
}
export const toggleDevTools = () => {
  if (!browserWindow) return
  if (browserWindow.webContents.isDevToolsOpened()) {
    browserWindow.webContents.closeDevTools()
  } else {
    handleOpenDevTools(browserWindow.webContents)
  }
}

export const setFullScreen = (isFullscreen: boolean): boolean => {
  if (!browserWindow) return false
  if (isLinux) { // linux 需要先设置为可调整窗口大小才能全屏
    if (isFullscreen) {
      browserWindow.setResizable(isFullscreen)
      browserWindow.setFullScreen(isFullscreen)
    } else {
      browserWindow.setFullScreen(isFullscreen)
      browserWindow.setResizable(isFullscreen)
    }
  } else {
    browserWindow.setFullScreen(isFullscreen)
  }
  return isFullscreen
}

const taskBarButtonFlags: LX.TaskBarButtonFlags = {
  empty: true,
  collect: false,
  play: false,
  next: true,
  prev: true,
}
export const setThumbarButtons = ({ empty, collect, play, next, prev }: LX.TaskBarButtonFlags = taskBarButtonFlags) => {
  if (!isWin || !browserWindow) return
  taskBarButtonFlags.empty = empty
  taskBarButtonFlags.collect = collect
  taskBarButtonFlags.play = play
  taskBarButtonFlags.next = next
  taskBarButtonFlags.prev = prev
  browserWindow.setThumbarButtons(createTaskBarButtons(taskBarButtonFlags, action => {
    sendTaskbarButtonClick(action)
  }))
}

export const setThumbnailClip = (region: Electron.Rectangle) => {
  if (!browserWindow) return
  browserWindow.setThumbnailClip(region)
}


export const clearCache = async() => {
  if (!browserWindow) throw new Error('main window is undefined')
  await browserWindow.webContents.session.clearCache()
}

export const getCacheSize = async() => {
  if (!browserWindow) throw new Error('main window is undefined')
  return browserWindow.webContents.session.getCacheSize()
}

export const getWebContents = (): Electron.WebContents => {
  if (!browserWindow) throw new Error('main window is undefined')
  return browserWindow.webContents
}
