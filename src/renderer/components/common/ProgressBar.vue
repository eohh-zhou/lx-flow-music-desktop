<template>
  <div :class="[$style.progress, className, {[$style.dragging]: dragging}]">
    <div :class="[$style.progressBar, $style.progressBar2, {[$style.barTransition]: isActiveTransition && !dragging}]" :style="{ transform: `scaleX(${barProgress})` }" @transitionend="handleTransitionEnd" />
    <div v-show="dragging" :class="[$style.progressBar, $style.progressBar3]" :style="{ transform: `scaleX(${dragProgress || 0})` }" />
    <div :class="$style.knob" :style="{ left: `${barProgress * 100}%` }" />
  </div>
  <div ref="dom_progress" :class="$style.progressMask" @mousedown="handleMsDown" />
</template>

<script>
import { computed, ref, onBeforeUnmount } from '@common/utils/vueTools'
import { playProgress } from '@renderer/store/player/playProgress'

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

    const handleMsDown = event => {
      msEvent.isMsDown = true
      msEvent.msDownX = event.clientX

      let val = event.offsetX / dom_progress.value.clientWidth
      if (val < 0) val = 0
      if (val > 1) val = 1

      dragProgress.value = msEvent.msDownProgress = val
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

    return {
      dom_progress,
      dragging,
      dragProgress,
      barProgress,
      handleMsDown,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

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
.dragging .knob {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}

.barTransition {
  transition-property: transform;
  transition-timing-function: ease-out;
  transition-duration: 0.2s;
}

</style>
