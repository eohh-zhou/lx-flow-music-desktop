<template>
  <button
    type="button"
    :class="[$style.indicator, { [$style.playing]: isPlay, [$style.cover]: cover }]"
    :aria-label="isPlay ? $t('player__pause') : $t('player__play')"
    @click.stop="togglePlay"
  >
    <span :class="$style.bars" aria-hidden="true">
      <i /><i /><i />
    </span>
    <span :class="$style.hoverIcon" aria-hidden="true">
      <svg
        v-if="isPlay"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xlink="http://www.w3.org/1999/xlink"
        viewBox="0 0 1024 1024"
        space="preserve"
      >
        <use xlink:href="#icon-pause" />
      </svg>
      <svg
        v-else
        :class="$style.playGlyph"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xlink="http://www.w3.org/1999/xlink"
        viewBox="0 0 1024 1024"
        space="preserve"
      >
        <use xlink:href="#icon-play" />
      </svg>
    </span>
  </button>
</template>

<script setup lang="ts">
import { isPlay } from '@renderer/store/player/state'
import { togglePlay } from '@renderer/core/player'

defineProps({
  cover: {
    type: Boolean,
    default: false,
  },
})
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.indicator {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: inherit;
  background: transparent;
  color: var(--color-button-font);
  cursor: pointer;
  outline: none;
}

.bars,
.hoverIcon {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity .2s ease, transform .2s ease;
}

.bars {
  align-items: flex-end;
  gap: 1.5px;
  height: 12px;
  opacity: 0;
  pointer-events: none;

  i {
    display: block;
    width: 2px;
    height: 12px;
    border-radius: 1px;
    background-color: currentColor;
    transform: scaleY(.28);
    transform-origin: center bottom;
    animation: playing-eq .6s ease-in-out infinite alternate;
    animation-play-state: paused;
    will-change: transform;

    &:nth-child(1) { animation-duration: .48s; }
    &:nth-child(2) { animation-duration: .72s; animation-delay: -.2s; }
    &:nth-child(3) { animation-duration: .56s; animation-delay: -.36s; }
  }
}

.hoverIcon {
  width: 14px;
  height: 14px;
  opacity: 1;
  transform: scale(1);

  svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: currentColor;
  }
}

.playGlyph {
  transform: translateX(0.8px);
}

.playing {
  .bars {
    opacity: 1;
    transform: scale(1);

    i {
      animation-play-state: running;
    }
  }
  .hoverIcon {
    opacity: 0;
    transform: scale(.86);
  }
}

.indicator:hover,
.indicator:focus-visible {
  .bars {
    opacity: 0;
    transform: scale(.86);
  }
  .hoverIcon {
    opacity: 1;
    transform: scale(1);
  }
}

.cover {
  z-index: 1;
  background-color: rgba(0, 0, 0, .38);
  color: #fff;
  backdrop-filter: blur(2px);

  .bars {
    height: 11px;
    gap: 1.5px;

    i {
      width: 1.8px;
      height: 11px;
    }
  }

  .hoverIcon {
    width: 12px;
    height: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bars i {
    animation: none;

    &:nth-child(1) { transform: scaleY(.35); }
    &:nth-child(2) { transform: scaleY(1); }
    &:nth-child(3) { transform: scaleY(.55); }
  }
}

@keyframes playing-eq {
  0% { transform: scaleY(.22); }
  100% { transform: scaleY(1); }
}
</style>
