import { ref } from '@common/utils/vueTools'
import { pickrTools, type PickrTools } from '@renderer/utils/pickrTools'

export default () => {
  const primary_color_ref = ref(null)
  let tools: PickrTools | null

  const initMainColor = (color: string, changed: (color: string) => void) => {
    if (!primary_color_ref.value) return
    tools = pickrTools.create(primary_color_ref.value, color, [
      'rgba(250, 45, 72, 1)',
      'rgba(255, 159, 10, 1)',
      'rgba(255, 214, 10, 1)',
      'rgba(52, 199, 89, 1)',
      'rgba(90, 200, 250, 1)',
      'rgba(10, 132, 255, 1)',
      'rgba(94, 92, 230, 1)',
      'rgba(191, 90, 242, 1)',
      'rgba(255, 55, 95, 1)',
      'rgba(255, 69, 58, 1)',
      'rgba(142, 142, 147, 1)',
      'rgba(174, 174, 178, 1)',
      'rgba(50, 173, 185, 1)',
      'rgba(100, 210, 255, 1)',
      'rgba(156, 220, 254, 1)',
    ], changed, () => {})
  }
  const destroyMainColor = () => {
    if (!tools) return
    tools.destroy()
    tools = null
  }

  return {
    primary_color_ref,
    initMainColor,
    destroyMainColor,
  }
}
