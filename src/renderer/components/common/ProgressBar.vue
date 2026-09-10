<template>
  <div :class="[$style.wrap, {[$style.edge]: edge, [$style.hovering]: hovering, [$style.dragging]: dragging}]">
    <div :class="[$style.progress, className, {[$style.dragging]: dragging}]">
      <div :class="[$style.progressBar, $style.progressBar2, {[$style.barTransition]: isActiveTransition && !dragging}]" :style="{ transform: `scaleX(${barProgress})` }" @transitionend="handleTransitionEnd" />
      <div v-show="dragging" :class="[$style.progressBar, $style.progressBar3]" :style="{ transform: `scaleX(${dragProgress || 0})` }" />
      <div :class="$style.knob" :style="{ left: `${barProgress * 100}%` }" />
    </div>
    <div ref="dom_progress" :class="$style.progressMask" @mousedown="handleMsDown" @mousemove="handleHoverMove" @mouseenter="hovering = true" @mouseleave="hovering = false" />
    <div v-if="edge && (hovering || dragging)" :class="$style.timeTip" :style="{ left: `${tipProgress * 100}%` }">{{ hoverTimeStr }}</div>
  </div>
</template>

<script>
import { computed, ref, onBeforeUnmount } from '@common/utils/vueTools'
import { playProgress } from '@renderer/store/player/playProgress'
import { formatPlayTime2 } from '@common/utils/common'

export default {
  props: {
    className: {
      type: String,
      default: '',
    },
    progress: {
      type: Number,
      required: true,
    },
    isActiveTransition: {
      type: Boolean,
      required: true,
    },
    handleTransitionEnd: {
      type: Function,
      required: true,
    },
    edge: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const msEvent = {
      isMsDown: false,
      msDownX: 0,
      msDownProgress: 0,
    }
    const dom_progress = ref(null)
    const dragging = ref(false)
    const dragProgress = ref(0)
    const hovering = ref(false)
    const hoverProgress = ref(0)

    const getRatio = (event) => {
      const width = dom_progress.value?.clientWidth || 1
      let val = event.offsetX / width
      if (val < 0) val = 0
      if (val > 1) val = 1
      return val
    }

    const handleMsDown = event => {
      msEvent.isMsDown = true
      msEvent.msDownX = event.clientX

      const val = getRatio(event)
      dragProgress.value = msEvent.msDownProgress = val
      hoverProgress.value = val
    }
    const handleMsUp = () => {
      if (msEvent.isMsDown) setProgress(dragProgress.value * playProgress.maxPlayTime)
      msEvent.isMsDown = false
      dragging.value = false
    }
    const handleMsMove = event => {
      if (!msEvent.isMsDown) return
      dragging.value ||= true

      let progress = msEvent.msDownProgress + (event.clientX - msEvent.msDownX) / dom_progress.value.clientWidth
      if (progress > 1) progress = 1
      else if (progress < 0) progress = 0
      dragProgress.value = progress
      hoverProgress.value = progress
    }
    const handleHoverMove = event => {
      hoverProgress.value = getRatio(event)
    }

    document.addEventListener('mousemove', handleMsMove)
    document.addEventListener('mouseup', handleMsUp)
    onBeforeUnmount(() => {
      document.removeEventListener('mousemove', handleMsMove)
      document.removeEventListener('mouseup', handleMsUp)
    })

    const setProgress = num => {
      window.app_event.setProgress(num)
    }

    const barProgress = computed(() => {
      const value = dragging.value ? dragProgress.value : props.progress
      if (value < 0) return 0
      if (value > 1) return 1
      return value || 0
    })
    const tipProgress = computed(() => {
      const value = dragging.value ? dragProgress.value : hoverProgress.value
      if (value < 0) return 0
      if (value > 1) return 1
      return value || 0
    })
    const hoverTimeStr = computed(() => {
      const current = formatPlayTime2((tipProgress.value || 0) * playProgress.maxPlayTime)
      return `${current} / ${playProgress.maxPlayTimeStr}`
    })

    return {
      dom_progress,
      dragging,
      dragProgress,
      barProgress,
      hovering,
      tipProgress,
      hoverTimeStr,
      handleMsDown,
      handleHoverMove,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.progress {
  width: 100%;
  height: 5px;
  overflow: visible;
  transition: height .15s ease, background-color @transition-normal;
  background-color: var(--color-primary-light-100-alpha-800);
  position: relative;
  border-radius: 40px;

  &:hover,
  &.dragging {
    height: 6px;
  }
}
.edge .progress {
  position: absolute;
  left: 0;
  top: 0;
  height: 3px;
  border-radius: 0;
}
.edge.hovering .progress,
.edge.dragging .progress {
  height: 4px;
}
.progressMask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.progressBar {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0;
  border-radius: inherit;
}
.progressBar1 {
  background-color: var(--color-primary-light-100-alpha-600);
}

.progressBar2 {
  background-color: var(--color-primary);
  will-change: transform;
}

.progressBar3 {
  background-color: var(--color-primary-light-100-alpha-200);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
  opacity: 0.5;
}

.knob {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border-radius: 50%;
  background-color: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, .28);
  transform: translateY(-50%) scale(.4);
  opacity: 0;
  pointer-events: none;
  z-index: 2;
  transition: opacity .15s ease, transform .15s ease;
}

.progress:hover .knob,
.dragging .knob,
.hovering .knob {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}

.timeTip {
  position: absolute;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  padding: 3px 8px;
  border-radius: 10px;
  background-color: #fff;
  color: var(--color-font);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .14);
  pointer-events: none;
  z-index: 5;
}

.barTransition {
  transition-property: transform;
  transition-timing-function: ease-out;
  transition-duration: 0.2s;
}

</style>
