<template>
  <div :class="$style.playBtnContent">
    <div :class="$style.playBtn" :aria-label="$t('player__prev')" @click="playPrev()">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
        <use xlink:href="#icon-prevMusic" />
      </svg>
    </div>
    <div :class="[$style.playBtn, $style.mainBtn]" :aria-label="isPlay ? $t('player__pause') : $t('player__play')" @click="togglePlay">
      <svg v-if="isPlay" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
        <use xlink:href="#icon-pause" />
      </svg>
      <svg v-else :class="$style.playGlyph" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
        <use xlink:href="#icon-play" />
      </svg>
    </div>
    <div :class="$style.playBtn" :aria-label="$t('player__next')" @click="playNext()">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
        <use xlink:href="#icon-nextMusic" />
      </svg>
    </div>
  </div>
</template>

<script>
import { isPlay } from '@renderer/store/player/state'
import { togglePlay, playNext, playPrev } from '@renderer/core/player'

export default {
  setup() {
    return {
      isPlay,
      togglePlay,
      playNext,
      playPrev,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.playBtnContent {
  height: 100%;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  gap: 14px;
}

.playBtn {
  flex: none;
  height: 30px;
  width: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: @radius-round;
  transition: @transition-fast;
  transition-property: color, background-color, opacity, transform;
  color: var(--color-700);
  opacity: 1;
  cursor: pointer;

  svg {
    display: block;
    fill: currentColor;
    height: 15px;
    width: 15px;
  }
  &:hover {
    color: var(--color-1000);
    background-color: var(--color-100);
    transform: scale(1.05);
  }
  &:active {
    transform: scale(.95);
  }
}

.mainBtn {
  height: 40px;
  width: 40px;
  color: #fff;
  background: linear-gradient(145deg, var(--color-primary-light-100), var(--color-primary-dark-100));
  box-shadow: 0 4px 14px var(--color-primary-alpha-500);

  svg {
    height: 15px;
    width: 15px;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .15));
  }
  .playGlyph {
    transform: translateX(1.5px);
  }
  &:hover {
    color: #fff;
    background: linear-gradient(145deg, var(--color-primary), var(--color-primary-dark-100));
    box-shadow: 0 6px 18px var(--color-primary-alpha-400);
    transform: scale(1.06);
  }
  &:active {
    transform: scale(.94);
  }
}
</style>
