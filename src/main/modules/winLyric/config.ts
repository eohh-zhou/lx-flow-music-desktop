import { isLinux } from '@common/utils'
import { closeWindow, createWindow, getBounds, isExistWindow, isLyricMenuOverlayOpen, alwaysOnTopTools, setBounds, setIgnoreMouseEvents, setSkipTaskbar } from './main'
import { sendConfigChange, sendMouseLeave } from './rendererEvent'
import { buildLyricConfig, getLyricWindowBounds, initWindowSize, watchConfigKeys } from './utils'
import { mouseCheckTools } from './mouseCheckTools'

let isLock: boolean
let isEnable: boolean
let isAlwaysOnTop: boolean
let isAlwaysOnTopLoop: boolean
let isShowTaskbar: boolean
let isLockScreen: boolean
let isHoverHide: boolean
let isCollapsingLyricWindow = false


export const setLrcConfig = (keys: Array<keyof LX.AppSetting>, setting: Partial<LX.AppSetting>) => {
  if (!watchConfigKeys.some(key => keys.includes(key))) return

  if (isExistWindow()) {
    sendConfigChange(buildLyricConfig(setting))
    if (keys.includes('desktopLyric.isLock') && isLock != global.lx.appSetting['desktopLyric.isLock']) {
      isLock = global.lx.appSetting['desktopLyric.isLock']
      if (global.lx.appSetting['desktopLyric.isLock']) {
        setIgnoreMouseEvents(true, { forward: !isLinux && global.lx.appSetting['desktopLyric.isHoverHide'] })
        mouseCheckTools.runCheck(sendMouseLeave)
      } else {
        setIgnoreMouseEvents(false, { forward: !isLinux && global.lx.appSetting['desktopLyric.isHoverHide'] })
        mouseCheckTools.cacnelCheck()
      }
    }
    if (keys.includes('desktopLyric.isHoverHide') && isHoverHide != global.lx.appSetting['desktopLyric.isHoverHide']) {
      isHoverHide = global.lx.appSetting['desktopLyric.isHoverHide']
      if (!isLinux) {
        setIgnoreMouseEvents(global.lx.appSetting['desktopLyric.isLock'], { forward: isHoverHide })
        if (isHoverHide) {
          mouseCheckTools.runCheck(sendMouseLeave)
        } else {
          mouseCheckTools.cacnelCheck()
        }
      }
    }
    if (keys.includes('desktopLyric.isAlwaysOnTop') && isAlwaysOnTop != global.lx.appSetting['desktopLyric.isAlwaysOnTop']) {
      isAlwaysOnTop = global.lx.appSetting['desktopLyric.isAlwaysOnTop']
      alwaysOnTopTools.setAlwaysOnTop(true)
      if (isAlwaysOnTop) alwaysOnTopTools.startLoop()
      else alwaysOnTopTools.clearLoop()
    }
    if (keys.includes('desktopLyric.isShowTaskbar') && isShowTaskbar != global.lx.appSetting['desktopLyric.isShowTaskbar']) {
      isShowTaskbar = global.lx.appSetting['desktopLyric.isShowTaskbar']
      setSkipTaskbar(!global.lx.appSetting['desktopLyric.isShowTaskbar'])
    }
    if (keys.includes('desktopLyric.isAlwaysOnTopLoop') && isAlwaysOnTopLoop != global.lx.appSetting['desktopLyric.isAlwaysOnTopLoop']) {
      isAlwaysOnTopLoop = global.lx.appSetting['desktopLyric.isAlwaysOnTopLoop']
      if (!global.lx.appSetting['desktopLyric.isAlwaysOnTop']) return
      if (isAlwaysOnTopLoop) {
        alwaysOnTopTools.startLoop()
      } else {
        alwaysOnTopTools.clearLoop()
      }
    }
    if (keys.includes('desktopLyric.isLockScreen') && isLockScreen != global.lx.appSetting['desktopLyric.isLockScreen']) {
      isLockScreen = global.lx.appSetting['desktopLyric.isLockScreen']
      if (global.lx.appSetting['desktopLyric.isLockScreen']) {
        setBounds(getLyricWindowBounds(getBounds()!, {
          x: 0,
          y: 0,
          w: global.lx.appSetting['desktopLyric.width'],
          h: global.lx.appSetting['desktopLyric.height'],
        }))
      }
    }
    if (keys.includes('desktopLyric.x') && setting['desktopLyric.x'] == null) {
      setBounds(initWindowSize(
        global.lx.appSetting['desktopLyric.x'],
        global.lx.appSetting['desktopLyric.y'],
        global.lx.appSetting['desktopLyric.width'],
        global.lx.appSetting['desktopLyric.height'],
      ))
    }
    const bounds = getBounds()
    const needCollapse = !isCollapsingLyricWindow && !isLyricMenuOverlayOpen() && (
      (bounds != null && bounds.height > 140) ||
      global.lx.appSetting['desktopLyric.height'] > 140 ||
      global.lx.appSetting['desktopLyric.height'] < 110 ||
      global.lx.appSetting['desktopLyric.direction'] != 'horizontal'
    )
    if (needCollapse) {
      isCollapsingLyricWindow = true
      const winSize = initWindowSize(bounds?.x ?? null, bounds?.y ?? null, 860, 120)
      global.lx.event_app.update_config({
        'desktopLyric.x': winSize.x,
        'desktopLyric.y': winSize.y,
        'desktopLyric.width': winSize.width,
        'desktopLyric.height': winSize.height,
        'desktopLyric.direction': 'horizontal',
        'desktopLyric.isAlwaysOnTop': true,
        'desktopLyric.isAlwaysOnTopLoop': true,
      })
      setBounds(winSize)
      alwaysOnTopTools.setAlwaysOnTop(true)
      alwaysOnTopTools.startLoop()
      isCollapsingLyricWindow = false
    }
  }
  if (keys.includes('desktopLyric.enable') && isEnable != global.lx.appSetting['desktopLyric.enable']) {
    isEnable = global.lx.appSetting['desktopLyric.enable']
    if (global.lx.appSetting['desktopLyric.enable']) {
      createWindow()
    } else {
      alwaysOnTopTools.clearLoop()
      mouseCheckTools.cacnelCheck()
      closeWindow()
    }
  }
}
