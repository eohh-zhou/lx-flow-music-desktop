import { onMounted, onBeforeUnmount, watch, reactive, ref } from '@common/utils/vueTools'


export default ({ visible, location, onHide }) => {
  let show = false
  const dom_menu = ref(null)
  const menuStyles = reactive({
    left: 0,
    top: 0,
    opacity: 0,
    // Context menus must be immediately hit-testable after Vue mounts them.
    // A CSS transition can remain at its initial frame when the menu is
    // toggled in the same render flush as its Teleport insertion.
    transitionProperty: 'none',
    transform: 'scale(.8, .7) translate(0,0)',
    pointerEvents: 'none',
  })

  const setMenuPosition = (left, top) => {
    menuStyles.left = `${left}px`
    menuStyles.top = `${top}px`
  }

  const handleShow = () => {
    show = true
    setMenuPosition(location.value.x, location.value.y)
    menuStyles.opacity = 1
    menuStyles.transitionProperty = 'none'
    menuStyles.transform = `scale(1) translate(${handleGetOffsetXY(location.value.x, location.value.y)})`
    menuStyles.pointerEvents = 'auto'
    // Re-measure after the menu has entered the DOM. This covers font loading,
    // scrollbar insertion, and window scaling differences between machines.
    window.requestAnimationFrame(updateMenuOffset)
  }
  const handleHide = () => {
    menuStyles.opacity = 0
    menuStyles.transitionProperty = 'none'
    menuStyles.transform = 'scale(.8, .7) translate(0, 0)'
    menuStyles.pointerEvents = 'none'
    show = false
  }
  const handleGetOffsetXY = (left, top) => {
    if (!dom_menu.value) return '0px, 0px'

    const listWidth = dom_menu.value.clientWidth
    const listHeight = dom_menu.value.clientHeight
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight
    const edge = 8
    let x = 0
    let y = 0

    if (left + listWidth > viewportWidth - edge) x = viewportWidth - edge - left - listWidth
    if (top + listHeight > viewportHeight - edge) y = viewportHeight - edge - top - listHeight
    if (left + x < edge) x = edge - left
    if (top + y < edge) y = edge - top

    return `${x}px, ${y}px`
  }
  const updateMenuOffset = () => {
    if (!show) return
    menuStyles.transform = `scale(1) translate(${handleGetOffsetXY(location.value.x, location.value.y)})`
  }
  const handleDocumentClick = (event) => {
    if (!show) return

    if (event.target == dom_menu.value || dom_menu.value.contains(event.target)) return

    onHide()
  }

  watch(visible, visible => {
    visible ? handleShow() : handleHide()
  }, { immediate: true })

  watch(location, location => {
    setMenuPosition(location.x, location.y)
    if (show) {
      updateMenuOffset()
    }
  }, { deep: true })

  onMounted(() => {
    document.addEventListener('click', handleDocumentClick)
    window.addEventListener('resize', updateMenuOffset)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick)
    window.removeEventListener('resize', updateMenuOffset)
  })

  return {
    dom_menu,
    menuStyles,
  }
}
