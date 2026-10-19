import Sortable, { AutoScroll } from 'sortablejs/modular/sortable.core.esm'
import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import { clearDownKeys } from '@renderer/event'

Sortable.mount(new AutoScroll())

const noop = () => {}

export default ({ dom_list, dragingItemClassName, filter, onUpdate, onStart = noop, onEnd = noop }) => {
  let sortable
  let disabled = true

  const stopWatch = watch(dom_list, element => {
    sortable?.destroy()
    sortable = null
    if (!element) return
    sortable = Sortable.create(element, {
      animation: 150,
      disabled,
      forceFallback: false,
      filter: filter ? '.' + filter : null,
      ghostClass: dragingItemClassName,
      onUpdate(event) {
        onUpdate(event.newIndex, event.oldIndex)
      },
      onMove(event) {
        return filter ? !event.related.classList.contains(filter) : true
      },
      onChoose() {
        onStart()
      },
      onUnchoose() {
        onEnd()
        // 处于拖动状态期间，键盘事件无法监听，拖动结束手动清理按下的键
        // window.app_event.emit(eventBaseName.setClearDownKeys)
        clearDownKeys()
      },
      onStart(event) {
        window.app_event.dragStart()
      },
      onEnd(event) {
        window.app_event.dragEnd()
      },
    })
  }, { immediate: true, flush: 'post' })

  onBeforeUnmount(() => {
    stopWatch()
    sortable?.destroy()
    sortable = null
  })

  return {
    setDisabled(enable) {
      disabled = enable
      if (!sortable) return
      sortable.option('disabled', enable)
    },
  }
}
