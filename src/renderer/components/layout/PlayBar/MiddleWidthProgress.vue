<template>
  <div :class="$style.player">
    <div :class="$style.picContent" :aria-label="$t('player__pic_tip')" @contextmenu="handleToMusicLocation" @click="showPlayerDetail">
      <img v-if="musicInfo.pic" :src="musicInfo.pic" decoding="async" @error="imgError">
      <div v-else :class="$style.emptyPic">L<span>X</span></div>
    </div>
    <div :class="$style.infoContent">
      <div :class="$style.title" :aria-label="title + $t('copy_tip')" @click="handleCopy(title)">
        {{ title }}
      </div>
      <div :class="$style.status">{{ statusText }}</div>
    </div>
    <div :class="$style.timeContent">
      <span>{{ nowPlayTimeStr }}</span>
      <div :class="$style.progress">
        <common-progress-bar v-if="!isShowPlayerDetail" :class-name="$style.progressBar" :progress="progress" :handle-transition-end="handleTransitionEnd" :is-active-transition="isActiveTransition" />
      </div>
      <!-- <span style="margin: 0 1px;">/</span> -->
      <span>{{ maxPlayTimeStr }}</span>
    </div>
    <!-- <play-progress /> -->
    <control-btns />
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
  </div>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { clipboardWriteText } from '@common/utils/electron'
import ControlBtns from './ControlBtns.vue'
// import PlayProgress from './PlayProgress'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'
// import { lyric } from '@renderer/core/share/lyric'
import {
  statusText,
  musicInfo,
  isShowPlayerDetail,
  isPlay,
  playInfo,
  playMusicInfo,
} from '@renderer/store/player/state'
import {
  setMusicInfo,
  setShowPlayerDetail,
} from '@renderer/store/player/action'
import { appSetting } from '@renderer/store/setting'
import { togglePlay, playNext, playPrev } from '@renderer/core/player'
import { LIST_IDS } from '@common/constants'
import { formatMusicName } from '@renderer/utils'

export default {
  name: 'CorePlayBar',
  components: {
    ControlBtns,
    // PlayProgress,
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
      showPlayerDetail,
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
  border-top: 1px solid var(--color-100);
  box-sizing: border-box;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  contain: strict;
  padding: 6px;
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
    opacity: .92;
    z-index: -1;
  }
}

.picContent {
  height: 100%;
  aspect-ratio: 1 / 1;

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
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    max-width: 100%;
    max-height: 100%;
    transition: @transition-normal;
    transition-property: border-color, transform, box-shadow;
    border-radius: @radius-border;
  }

  &:hover img {
    transform: scale(1.02);
  }

  .emptyPic {
    background:
      radial-gradient(120% 120% at 20% 15%, var(--color-primary-light-100) 0%, var(--color-primary) 45%, var(--color-primary-dark-200) 100%);
    border-radius: @radius-border;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, .95);
    user-select: none;
    font-size: 17px;
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
  padding: 0 10px;
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: flex-start;
  font-size: 13px;
  color: var(--color-font);
  min-width: 0;
  line-height: 1.5;
}

.title {
  max-width: 100%;
  font-size: 13px;
  color: var(--color-font);
  .mixin-ellipsis-1();
}
.status {
  padding-top: 3px;
  height: 23px;
  font-size: 11.5px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
  max-width: 100%;
}

.timeContent {
  width: 30%;
  // position: relative;
  flex: none;
  color: var(--color-550);
  font-size: 13px;
  // padding-left: 10px;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
}
.progress {
  // position: absolute;
  // top: 0;
  // left: 0;
  // width: 100%;
  flex: auto;
  // width: 160px;
  position: relative;
  // padding-bottom: 6px;
  margin: 0 8px;
  padding: 8px 0;
  // height: 15px;
  // .progressBar {
  //   height: 4px;
  //   // border-radius: 0;
  // }
}
.time {
  display: flex;
  flex-flow: row nowrap;
  justify-content: space-between;
}

.playBtnContent {
  height: 100%;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  padding-left: 10px;
  padding-right: 15px;
  gap: 10px;
}

.playBtn {
  flex: none;
  height: 34px;
  width: 34px;
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
    height: 17px;
    width: 17px;
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
    height: 20px;
    width: 20px;
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
