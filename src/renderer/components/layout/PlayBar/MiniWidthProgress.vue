<template>
  <div :class="$style.player">
    <div :class="$style.progress">
      <common-progress-bar v-if="!isShowPlayerDetail" edge :progress="progress" :handle-transition-end="handleTransitionEnd" :is-active-transition="isActiveTransition" />
    </div>
    <div :class="$style.left">
      <div :class="$style.picContent" :aria-label="$t('player__pic_tip')" @contextmenu="handleToMusicLocation" @click="showPlayerDetail">
        <img v-if="musicInfo.pic" :class="{[$style.rotating]: isPlay}" :src="musicInfo.pic" decoding="async" @error="imgError">
        <div v-else :class="$style.emptyPic">L<span>X</span></div>
      </div>
      <div :class="$style.infoContent">
        <div :class="$style.titleRow">
          <div :class="$style.title" :aria-label="title + $t('copy_tip')" @click="handleCopy(title)">
            {{ title }}
          </div>
          <button :class="[$style.commentBtn, {[$style.commentActive]: isShowPlayComment}]" :aria-label="$t('comment__show')" :title="$t('comment__show')" ignore-tip @click="toggleVisibleComment">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 24 24" space="preserve">
              <use xlink:href="#icon-comment" />
            </svg>
          </button>
        </div>
        <div :class="$style.status">{{ singer || statusText }}</div>
      </div>
    </div>
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
        <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-play" />
        </svg>
      </div>
      <div :class="$style.playBtn" :aria-label="$t('player__next')" @click="playNext()">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-nextMusic" />
        </svg>
      </div>
    </div>
    <div :class="$style.right">
      <control-btns />
    </div>
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { clipboardWriteText } from '@common/utils/electron'
import ControlBtns from './ControlBtns.vue'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'
// import { lyric } from '@renderer/core/share/lyric'
import {
  statusText,
  musicInfo,
  isShowPlayerDetail,
  isShowPlayComment,
  isPlay,
  playInfo,
  playMusicInfo,
} from '@renderer/store/player/state'
import {
  setMusicInfo,
  setShowPlayerDetail,
  setShowPlayComment,
} from '@renderer/store/player/action'
import { appSetting } from '@renderer/store/setting'
import { togglePlay, playNext, playPrev } from '@renderer/core/player'
import { LIST_IDS } from '@common/constants'
import { formatMusicName } from '@renderer/utils'

export default {
  name: 'CorePlayBar',
  components: {
    ControlBtns,
  },
  setup() {
    const router = useRouter()

    const {
      nowPlayTimeStr,
      maxPlayTimeStr,
      progress,
      isActiveTransition,
      handleTransitionEnd,
    } = usePlayProgress()

    const showPlayerDetail = () => {
      if (!playMusicInfo.musicInfo) return
      setShowPlayerDetail(true)
    }
    const toggleVisibleComment = () => {
      if (!playMusicInfo.musicInfo) return
      if (!isShowPlayerDetail.value) setShowPlayerDetail(true)
      setShowPlayComment(!isShowPlayComment.value)
    }
    const handleCopy = (text) => {
      clipboardWriteText(text)
    }

    const imgError = () => {
      // console.log(e)
      setMusicInfo({ pic: null })
    }

    const handleToMusicLocation = () => {
      const listId = playMusicInfo.listId
      if (!listId || listId == LIST_IDS.DOWNLOAD || !playMusicInfo.musicInfo) return
      if (playInfo.playIndex == -1) return
      void router.push({
        path: '/list',
        query: {
          id: listId,
          scrollIndex: playInfo.playIndex,
        },
      })
    }

    const title = computed(() => {
      return musicInfo.name
        ? formatMusicName(appSetting['download.fileName'], musicInfo.name, musicInfo.singer)
        : ''
    })

    const singer = computed(() => musicInfo.singer || '')

    // onBeforeUnmount(() => {
    // window.eventHub.emit(eventPlayerNames.setTogglePlay)
    // })

    return {
      musicInfo,
      nowPlayTimeStr,
      maxPlayTimeStr,
      progress,
      isActiveTransition,
      handleTransitionEnd,
      handleCopy,
      imgError,
      statusText,
      title,
      singer,
      showPlayerDetail,
      isShowPlayComment,
      toggleVisibleComment,
      isPlay,
      togglePlay,
      playNext,
      playPrev,
      handleToMusicLocation,
      isShowPlayerDetail,
    }
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.player {
  position: relative;
  height: @height-player;
  box-shadow: 0 -10px 28px rgba(0, 0, 0, .06);
  box-sizing: border-box;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  overflow: visible;
  padding: 10px 10px 8px;
  z-index: 2;
  * {
    box-sizing: border-box;
  }

  &:before {
    .mixin-after();
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(180deg, var(--color-000), var(--color-050));
    opacity: .96;
    z-index: -1;
  }
}
.progress {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 14px;
  z-index: 3;
}
.left,
.right {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
}
.right {
  justify-content: flex-end;
}

.picContent {
  height: 100%;
  width: auto;
  max-height: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;

  // color: var(--color-primary);
  // transition: @transition-normal;
  // transition-property: color;
  flex: none;
  opacity: 1;
  transition: opacity @transition-fast;
  // transition-property: opacity;
  display: flex;
  justify-content: center;
  // align-items: center;
  cursor: pointer;

  &:hover {
    opacity: .8;
  }

  // svg {
  //   fill: currentColor;
  // }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 50%;
    border: 3px solid var(--color-950);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
    animation: play-bar-vinyl-rotate 18s linear infinite;
    animation-play-state: paused;
  }

  .rotating {
    animation-play-state: running;
  }

  @keyframes play-bar-vinyl-rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .emptyPic {
    background:
      radial-gradient(120% 120% at 20% 15%, var(--color-primary-light-100) 0%, var(--color-primary) 45%, var(--color-primary-dark-200) 100%);
    border-radius: 50%;
    border: 3px solid var(--color-950);
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, .95);
    user-select: none;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 1px;
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    box-shadow: inset 0 -6px 14px rgba(0, 0, 0, .12), 0 4px 14px var(--color-primary-alpha-600);

    span {
      padding-left: 3px;
      font-weight: 500;
    }
  }
}

.infoContent {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 10px;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: flex-start;
  font-size: 13px;
  color: var(--color-font);
  line-height: 1.5;
}

.titleRow {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  min-width: 0;
}

.title {
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-font);
  cursor: pointer;
  .mixin-ellipsis-1();
}

.commentBtn {
  flex: none;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: @radius-round;
  background-color: transparent;
  color: var(--color-450);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  outline: none;
  transition: @transition-fast;
  transition-property: color, background-color, transform;

  svg {
    fill: currentColor;
  }

  &:hover {
    color: var(--color-primary);
    background-color: var(--color-primary-alpha-900);
  }
  &:active {
    transform: scale(.9);
  }
}

.commentActive {
  color: var(--color-primary);
}
.status {
  margin-top: 1px;
  min-width: 0;
  height: 17px;
  font-size: 11.5px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
  max-width: 100%;
}

// .timeContainer {
//   flex: none;
//   padding: 15px 0;
//   &:hover {
//     .progress {
//       opacity: 1;
//     }
//   }
// }
// .timeContent {
//   // width: 30%;
//   position: relative;
//   // flex: none;
//   color: var(--color-300);
//   font-size: 13px;
//   // padding-left: 10px;
//   // display: flex;
//   // flex-flow: column nowrap;
//   // align-items: center;
//   padding-bottom: 3px;
// }
// .progress {
//   position: absolute;
//   top: 100%;
//   left: 0;
//   width: 100%;
//   flex: auto;
//   // width: 160px;
//   // position: relative;
//   // padding-bottom: 6px;
//   // margin: 0 8px;
//   padding: 2px 0;
//   height: 8px;
//   transition: opacity @transition-normal;
//   opacity: .24;

//   .progressBar {
//     height: 2px;
//     border-radius: 0;
//   }
// }
// .time {
//   display: flex;
//   flex-flow: row nowrap;
//   justify-content: space-between;
// }

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
  height: 36px;
  width: 36px;
  color: #fff;
  background: linear-gradient(145deg, var(--color-primary-light-100), var(--color-primary-dark-100));
  box-shadow: 0 4px 14px var(--color-primary-alpha-500);

  svg {
    height: 17px;
    width: 17px;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .15));
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
