// 滚动条悬停显示控制
//
// 背景：自定义 ::-webkit-scrollbar 的滑块颜色如果依赖 :hover 状态
// （尤其是 *:hover 通配选择器），Chromium 在状态变化时不一定会重绘滚动条，
// 导致滑块停留在旧的显示/隐藏状态（例如鼠标移开后侧边栏滑块仍显示、
// 悬停列表时滑块却不出现）。
//
// 方案：在文档层面监听鼠标位置，找到当前所在的滚动容器并挂 sb-hover 类。
// 类切换属于元素自身样式变化，会强制滚动条重新解析样式并重绘，
// 配合 CSS 中的 .sb-hover::-webkit-scrollbar-thumb 规则，
// 保证「悬停所在滚动区域显示、移开隐藏」行为稳定可靠。
let installed = false
let lastScrollEl: HTMLElement | null = null

const isScrollable = (el: Element) => {
  const overflowY = window.getComputedStyle(el).overflowY
  return overflowY == 'auto' || overflowY == 'scroll' || overflowY == 'overlay'
}

// 从事件目标向上找最近的滚动容器（不含 body / html）
const findScrollAncestor = (start: Element | null): HTMLElement | null => {
  let el: Element | null = start
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement && isScrollable(el)) return el
    el = el.parentElement
  }
  return null
}

const clearScrollbarHover = () => {
  if (lastScrollEl) {
    lastScrollEl.classList.remove('sb-hover')
    lastScrollEl = null
  }
}

const handleMouseOver = (event: MouseEvent) => {
  const target = event.target
  const scrollEl = target instanceof Element ? findScrollAncestor(target) : null
  if (scrollEl == lastScrollEl) return
  clearScrollbarHover()
  if (scrollEl) {
    scrollEl.classList.add('sb-hover')
    lastScrollEl = scrollEl
  }
}

export default () => {
  if (installed) return
  installed = true
  document.addEventListener('mouseover', handleMouseOver, true)
  // 鼠标离开窗口或窗口失焦时清除，避免滑块滞留
  document.documentElement.addEventListener('mouseleave', clearScrollbarHover)
  window.addEventListener('blur', clearScrollbarHover)
}
