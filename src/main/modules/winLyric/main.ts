import path from 'node:path'
import { BrowserWindow } from 'electron'
import { debounce, getPlatform, isLinux, isWin } from '@common/utils'
import { initWindowSize, minHeight, minWidth } from './utils'
import { mainSend } from '@common/mainIpc'
import { encodePath } from '@common/utils/electron'

// require('./event')
// require('./rendererEvent')

let browserWindow: Electron.BrowserWindow | null = null
let isWinBoundsUpdateing = false
let isLyricOverlayOpen = false
let overlayOriginBounds: Electron.Rectangle | null = null
const LYRIC_STRIP_HEIGHT = 120
const LYRIC_OVERLAY_HEIGHT = 400

const saveBoundsConfig = debounce((config: Partial<LX.AppSetting>) => {
  global.lx.event_app.update_config(config)
  if (isWinBoundsUpdateing) isWinBoundsUpdateing = false
}, 500)

const winEvent = () => {
  if (!browserWindow) return

  // browserWindow.on('close', () => {
  //   if (global.lx.appSetting['desktopLyric.enable'] && !global.lx.mainWindowClosed) {
  //     browserWindow = null
  //     global.lx.event_app.update_config({ 'desktopLyric.enable': false })
  //   }
  // })

  browserWindow.on('closed', () => {
    browserWindow = null
  })

  browserWindow.on('move', () => {
    // bounds = browserWindow.getBounds()
    // console.log('move', isWinBoundsUpdateing)
    if (isWinBoundsUpdateing) {
      if (!isLyricOverlayOpen) {
        const bounds = browserWindow!.getBounds()
        saveBoundsConfig({
          'desktopLyric.x': bounds.x,
          'desktopLyric.y': bounds.y,
          'desktopLyric.width': bounds.width,
          'desktopLyric.height': bounds.height,
        })
      }
    } else if (isWin && !isLyricOverlayOpen) { // Linux 不允许将窗口设置出屏幕之外，MacOS未知，故只在Windows下执行强制设置
      // 非主动调整窗口触发的窗口位置变化将重置回设置值
      browserWindow!.setBounds({
        x: global.lx.appSetting['desktopLyric.x'] ?? 0,
        y: global.lx.appSetting['desktopLyric.y'] ?? 0,
        width: global.lx.appSetting['desktopLyric.width'],
        height: global.lx.appSetting['desktopLyric.height'],
      })
    }
  })

  browserWindow.on('resize', () => {
    // bounds = browserWindow.getBounds()
    // console.log(bounds)
    isWinBoundsUpdateing = true
    const bounds = browserWindow!.getBounds()
    if (!isLyricOverlayOpen && bounds.height > 140) {
      bounds.width = 860
      bounds.height = LYRIC_STRIP_HEIGHT
      browserWindow!.setBounds(bounds)
    }
    if (!isLyricOverlayOpen) {
      saveBoundsConfig({
        'desktopLyric.x': bounds.x,
        'desktopLyric.y': bounds.y,
        'desktopLyric.width': bounds.width,
        'desktopLyric.height': bounds.height,
      })
    }
  })

  // browserWindow.on('restore', () => {
  //   browserWindow.webContents.send('restore')
  // })
  // browserWindow.on('focus', () => {
  //   browserWindow.webContents.send('focus')
  // })

  browserWindow.once('ready-to-show', () => {
    showWindow()
    if (global.lx.appSetting['desktopLyric.isLock']) {
      browserWindow!.setIgnoreMouseEvents(true, { forward: !isLinux && global.lx.appSetting['desktopLyric.isHoverHide'] })
    }
    // linux下每次重开时貌似要重新设置置顶
    // if (isLinux && global.lx.appSetting['desktopLyric.isAlwaysOnTop']) {
    //   browserWindow!.setAlwaysOnTop(global.lx.appSetting['desktopLyric.isAlwaysOnTop'], 'screen-saver')
    // }
    if (global.lx.appSetting['desktopLyric.isAlwaysOnTop']) alwaysOnTopTools.startLoop()
    browserWindow!.blur()
  })
}

export const createWindow = () => {
  closeWindow()
  if (!global.envParams.workAreaSize) return
  let x = global.lx.appSetting['desktopLyric.x']
  let y = global.lx.appSetting['desktopLyric.y']
  let width = global.lx.appSetting['desktopLyric.width']
  let height = global.lx.appSetting['desktopLyric.height']
  let isAlwaysOnTop = true
  // 旧版自由面板 / 纵向滚动会一次铺整页歌词，打开时收成网易云式单行条
  // 120：上方工具栏 + 下方当前句，避免工具栏盖住歌词
  width = 860
  height = 120
  x = null
  y = null
  // let isLockScreen = global.lx.appSetting['desktopLyric.isLockScreen']
  let isShowTaskbar = global.lx.appSetting['desktopLyric.isShowTaskbar']
  // let { width: screenWidth, height: screenHeight } = global.envParams.workAreaSize
  const winSize = initWindowSize(x, y, width, height)
  global.lx.event_app.update_config({
    'desktopLyric.x': winSize.x,
    'desktopLyric.y': winSize.y,
    'desktopLyric.width': winSize.width,
    'desktopLyric.height': winSize.height,
    'desktopLyric.isAlwaysOnTop': true,
    'desktopLyric.isAlwaysOnTopLoop': true,
    'desktopLyric.direction': 'horizontal',
  })

  const { shouldUseDarkColors, theme } = global.lx.theme

  /**
   * Initial window options
   */
  browserWindow = new BrowserWindow({
    height: winSize.height,
    width: winSize.width,
    x: winSize.x,
    y: winSize.y,
    minWidth,
    minHeight,
    maxHeight: LYRIC_OVERLAY_HEIGHT,
    useContentSize: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    // enableRemoteModule: false,
    // icon: join(global.__static, isWin ? 'icons/256x256.ico' : 'icons/512x512.png'),
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: false,
    show: false,
    alwaysOnTop: isAlwaysOnTop,
    skipTaskbar: !isShowTaskbar,
    webPreferences: {
      contextIsolation: false,
      webSecurity: false,
      sandbox: false,
      nodeIntegration: true,
      enableWebSQL: false,
      webgl: false,
      spellcheck: false, // 禁用拼写检查器
      backgroundThrottling: false,
    },
  })

  const winURL = process.env.NODE_ENV !== 'production' ? 'http://localhost:9081/lyric.html' : `file://${path.join(encodePath(__dirname), 'lyric.html')}`
  void browserWindow.loadURL(winURL + `?os=${getPlatform()}&dark=${shouldUseDarkColors}&theme=${encodeURIComponent(JSON.stringify(theme))}`)

  winEvent()
  if (isAlwaysOnTop) {
    browserWindow.setAlwaysOnTop(true, 'screen-saver')
    alwaysOnTopTools.startLoop()
  }
  // browserWindow.webContents.openDevTools()
  global.lx.event_app.desktop_lyric_window_created(browserWindow)
}
export const isExistWindow = (): boolean => !!browserWindow
export const isLyricMenuOverlayOpen = (): boolean => isLyricOverlayOpen

export const closeWindow = () => {
  if (!browserWindow) return
  browserWindow.close()
}

export const showWindow = () => {
  if (!browserWindow) return
  browserWindow.show()
}

export const setResizeable = (isResizeable: boolean) => {
  if (!browserWindow) return
  browserWindow.setResizable(isResizeable)
}

export const sendEvent = <T = any>(name: string, params?: T) => {
  if (!browserWindow) return
  mainSend(browserWindow, name, params)
}

export const getBounds = (): Electron.Rectangle | null => {
  if (!browserWindow) return null
  return browserWindow.getBounds()
}

export const setBounds = (bounds: Electron.Rectangle) => {
  if (!browserWindow) return
  isWinBoundsUpdateing = true
  browserWindow.setBounds(bounds)
}


export const setIgnoreMouseEvents = (ignore: boolean, options?: Electron.IgnoreMouseEventsOptions) => {
  if (!browserWindow) return
  browserWindow.setIgnoreMouseEvents(ignore, options)
}

export const setLyricOverlay = (open: boolean) => {
  if (!browserWindow) return
  const bounds = browserWindow.getBounds()
  if (open) {
    if (isLyricOverlayOpen) return
    overlayOriginBounds = { ...bounds }
    isLyricOverlayOpen = true
    isWinBoundsUpdateing = true
    browserWindow.setMaximumSize(Math.max(bounds.width, 860), LYRIC_OVERLAY_HEIGHT)
    const extra = LYRIC_OVERLAY_HEIGHT - bounds.height
    const nearTop = bounds.y <= 48
    browserWindow.setBounds({
      x: bounds.x,
      y: nearTop ? bounds.y : Math.max(0, bounds.y - extra),
      width: bounds.width,
      height: LYRIC_OVERLAY_HEIGHT,
    })
    return
  }
  if (!isLyricOverlayOpen) return
  isLyricOverlayOpen = false
  isWinBoundsUpdateing = true
  const origin = overlayOriginBounds ?? {
    x: bounds.x,
    y: bounds.y + (LYRIC_OVERLAY_HEIGHT - LYRIC_STRIP_HEIGHT),
    width: 860,
    height: LYRIC_STRIP_HEIGHT,
  }
  overlayOriginBounds = null
  browserWindow.setMaximumSize(Math.max(origin.width, 860), 140)
  browserWindow.setBounds(origin)
}

export const setSkipTaskbar = (skip: boolean) => {
  if (!browserWindow) return
  browserWindow.setSkipTaskbar(skip)
}

export const setAlwaysOnTop = (flag: boolean, level?: 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' | 'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver' | undefined, relativeLevel?: number | undefined) => {
  if (!browserWindow) return
  browserWindow.setAlwaysOnTop(flag, level, relativeLevel)
}

export const getMainFrame = (): Electron.WebFrameMain | null => {
  if (!browserWindow) return null
  return browserWindow.webContents.mainFrame
}

interface AlwaysOnTopTools {
  timeout: NodeJS.Timeout | null
  setAlwaysOnTop: (isLoop: boolean) => void
  startLoop: () => void
  clearLoop: () => void
}
export const alwaysOnTopTools: AlwaysOnTopTools = {
  timeout: null,
  setAlwaysOnTop(isLoop) {
    this.clearLoop()
    setAlwaysOnTop(global.lx.appSetting['desktopLyric.isAlwaysOnTop'], 'screen-saver')
    // console.log(isLoop)
    if (isLoop) this.startLoop()
  },
  startLoop() {
    this.clearLoop()
    this.timeout = setInterval(() => {
      if (!isExistWindow()) {
        this.clearLoop()
        return
      }
      setAlwaysOnTop(true, 'screen-saver')
    }, 500)
  },
  clearLoop() {
    if (!this.timeout) return
    clearInterval(this.timeout)
    this.timeout = null
  },
}
