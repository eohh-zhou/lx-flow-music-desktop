<template>
  <div :class="$style.controlBtn">
    <!-- <common-volume-bar /> -->
    <button :class="$style.titleBtn" :aria-label="$t('player__add_music_to')" @click="addMusicTo">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="90%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-add-2" />
      </svg>
    </button>
    <button :class="$style.titleBtn" :aria-label="toggleDesktopLyricBtnTitle" @click="toggleDesktopLyric" @contextmenu="toggleLockDesktopLyric">
      <svg v-show="appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-desktop-lyric-on" />
      </svg>
      <svg v-show="!appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-desktop-lyric-off" />
      </svg>
    </button>
    <button :class="[$style.titleBtn, { [$style.commentActive]: isShowPlayComment }]" :aria-label="$t('comment__show')" :title="$t('comment__show')" ignore-tip @click="toggleVisibleComment">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="72%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-comment" />
      </svg>
    </button>
    <common-volume-btn />
    <common-toggle-play-mode-btn />
    <common-temp-list-btn />
    <common-list-add-modal v-model:show="isShowAddMusicTo" :music-info="playMusicInfo.musicInfo" />
  </div>
</template>

<script>
import { ref } from '@common/utils/vueTools'
import useToggleDesktopLyric from '@renderer/utils/compositions/useToggleDesktopLyric'
import { musicInfo, playMusicInfo, isShowPlayerDetail, isShowPlayComment } from '@renderer/store/player/state'
import { setShowPlayerDetail, setShowPlayComment } from '@renderer/store/player/action'
import { appSetting } from '@renderer/store/setting'

export default {
  setup() {
    const isShowAddMusicTo = ref(false)
    const {
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
    } = useToggleDesktopLyric()
    const addMusicTo = () => {
      if (!musicInfo.id) return
      isShowAddMusicTo.value = true
    }
    const toggleVisibleComment = () => {
      if (!playMusicInfo.musicInfo) return
      // 播放详情页未打开时，先打开详情页再展开评论面板，否则切换面板显隐
      if (!isShowPlayerDetail.value) {
        setShowPlayerDetail(true)
        if (!isShowPlayComment.value) setShowPlayComment(true)
      } else {
        setShowPlayComment(!isShowPlayComment.value)
      }
    }
    return {
      appSetting,
      isShowAddMusicTo,
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
      addMusicTo,
      playMusicInfo,
      isShowPlayComment,
      toggleVisibleComment,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.controlBtn {
  padding-left: 20px;
  padding-right: 10px;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 8px;

  button {
    color: var(--color-550);
  }
}

.titleBtn {
  flex: none;
  height: 26px;
  width: 26px;
  border-radius: @radius-round;
  transition: @transition-fast;
  transition-property: color, opacity, background-color;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  border: none;
  padding: 0;

  opacity: .85;
  cursor: pointer;

  svg {
    filter: none;
  }
  &:hover {
    opacity: 1;
    color: var(--color-900) !important;
    background-color: var(--color-100);
  }
  &:active {
    opacity: 1;
    transform: scale(.94);
  }
}

.commentActive {
  color: var(--color-primary);
  opacity: 1;

  &:hover {
    color: var(--color-primary) !important;
  }
}


</style>
