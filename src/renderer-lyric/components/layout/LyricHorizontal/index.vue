<template>
  <div
    ref="dom_lyric"
    :class="[...classNames, { [$style.single]: isSingleMode }]"
    :style="lrcStyles"
    @wheel="handleWheel"
  >
    <div
      :class="$style.hit"
      @mousedown="handleLyricMouseDown"
      @touchstart="handleLyricTouchStart"
      @contextmenu.prevent="handleContextMenu"
    >
      <div v-if="!isSingleMode" :class="$style.lyricSpace" />
      <div v-if="!hasLyric" :class="$style.placeholder">{{ placeholderText }}</div>
      <div ref="dom_lyric_text" />
      <div v-if="!isSingleMode" :class="$style.lyricSpace" />
    </div>

    <context-menu
      v-model:visible="menuVisible"
      :items="menuItems"
      :x="menuX"
      :y="menuY"
      @action="handleMenuAction"
    />
  </div>
</template>

<script>
import { isDoubleLine, isLyricBarBelow, musicInfo, setting } from '@lyric/store/state'
import { lyric } from '@lyric/store/lyric'
import { updateSetting } from '@lyric/utils/ipc'
import { computed, useCssModule, ref, watch } from '@common/utils/vueTools'
import { useI18n } from '@lyric/plugins/i18n'
import useLyric from './useLyric'
import ContextMenu from '../ContextMenu.vue'
import { hideLyricMenu, showLyricMenu, useLyricMenu } from '../lyricMenu'

export default {
  components: {
    ContextMenu,
  },
  setup() {
    const t = useI18n()
    const styles = useCssModule()
    // 横向桌面歌词始终只显示当前这一句
    const isSingleMode = computed(() => true)
    const getLineCount = () => isDoubleLine.value ? 2 : 1
    // const isZoomActiveLrc = computed(() => setting['desktopLyric.style.isZoomActiveLrc'])
    // const ellipsis = computed(() => setting['desktopLyric.style.ellipsis'])
    // const isFontWeightFont = computed(() => setting['desktopLyric.style.isFontWeightFont'])
    // const isFontWeightLine = computed(() => setting['desktopLyric.style.isFontWeightLine'])
    // const isFontWeightExtended = computed(() => setting['desktopLyric.style.isFontWeightExtended'])
    const classNames = computed(() => {
      const name = [styles.lyric]
      if (isMsDown.value) name.push(styles.draging)
      if (setting['desktopLyric.style.isZoomActiveLrc']) name.push(styles.lrcActiveZoom)
      if (setting['desktopLyric.style.ellipsis'] && !isSingleMode.value) name.push(styles.ellipsis)
      if (setting['desktopLyric.style.isFontWeightFont']) name.push(styles.fontWeightFont)
      if (setting['desktopLyric.style.isFontWeightLine']) name.push(styles.fontWeightLine)
      if (setting['desktopLyric.style.isFontWeightExtended']) name.push(styles.fontWeightExtended)
      if (getLineCount() > 1) name.push(styles.double)
      return name
    })
    const lrcStyles = computed(() => ({
      fontFamily: setting['desktopLyric.style.font'],
      fontSize: Math.trunc(setting['desktopLyric.style.fontSize']) + 'px',
      opacity: setting['desktopLyric.style.opacity'] / 100,
      textAlign: isSingleMode.value ? undefined : setting['desktopLyric.style.align'],
      '--line-gap': setting['desktopLyric.style.lineGap'] + 'px',
      '--line-extended-gap': (setting['desktopLyric.style.lineGap'] / 3).toFixed(2) + 'px',
    }))
    const isComputeHeight = computed(() => {
      return setting['desktopLyric.style.isZoomActiveLrc'] && !setting['desktopLyric.isDelayScroll']
    })
    const hasLyric = computed(() => lyric.lines.some(line => line.text))
    const placeholderText = computed(() => {
      const name = musicInfo.name && musicInfo.name != '^' ? musicInfo.name : ''
      const singer = musicInfo.singer && musicInfo.singer != '^' ? musicInfo.singer : ''
      if (name && singer) return `${name} - ${singer}`
      return name || singer || t('lyric__load_error')
    })
    const {
      dom_lyric,
      dom_lyric_text,
      isMsDown,
      handleLyricMouseDown,
      handleLyricTouchStart,
      handleWheel,
    } = useLyric(isComputeHeight, getLineCount)

    const update = (settingPartial) => {
      updateSetting(settingPartial).catch(_ => _)
    }

    const nextLyricShape = {}
    if (setting['desktopLyric.height'] > 140 || setting['desktopLyric.height'] < 110 || setting['desktopLyric.width'] != 860) {
      nextLyricShape['desktopLyric.width'] = 860
      nextLyricShape['desktopLyric.height'] = 120
    }
    if (setting['desktopLyric.direction'] != 'horizontal') {
      nextLyricShape['desktopLyric.direction'] = 'horizontal'
    }
    if (!setting['desktopLyric.isAlwaysOnTop'] || !setting['desktopLyric.isAlwaysOnTopLoop']) {
      nextLyricShape['desktopLyric.isAlwaysOnTop'] = true
      nextLyricShape['desktopLyric.isAlwaysOnTopLoop'] = true
    }
    if (Object.keys(nextLyricShape).length) update(nextLyricShape)

    // ================= 右键菜单 =================
    const menuVisible = ref(false)
    const menuX = ref(0)
    const menuY = ref(0)

    const { menuItems, handleMenuAction } = useLyricMenu(t)

    const handleContextMenu = () => {
      showLyricMenu(() => {
        menuX.value = Math.min(Math.max(8, window.innerWidth / 2 - 110), window.innerWidth - 228)
        menuY.value = isLyricBarBelow.value ? 16 : Math.max(16, window.innerHeight - 300)
        menuVisible.value = true
      })
    }
    watch(menuVisible, (visible) => {
      if (!visible) hideLyricMenu()
    })

    return {
      classNames,
      lrcStyles,
      isSingleMode,
      hasLyric,
      placeholderText,

      dom_lyric,
      dom_lyric_text,
      isMsDown,
      handleLyricMouseDown,
      handleLyricTouchStart,
      handleWheel,

      menuVisible,
      menuX,
      menuY,
      menuItems,
      handleContextMenu,
      handleMenuAction,
    }
  },
}
</script>

<style lang="less" module>
@import '@lyric/assets/styles/layout.less';

.lyric {
  position: relative;
  text-align: center;
  width: fit-content;
  max-width: 100%;
  height: auto;
  overflow: visible;
  font-size: 16px;
  pointer-events: none;
  // font-weight: bold;

  :global {
    .font-lrc, .shadow {
      padding: 0.08em 0.14em;
      margin: -0.08em 0;
    }
    .font-lrc {
      color: var(--color-lyric-unplay);
    }
    .shadow {
      color: transparent;
      // margin-left: -0.14em;
    }
    .line-content {
      line-height: 1.2;
      margin: var(--line-gap) 0;
      overflow-wrap: break-word;

      .font-lrc {
        cursor: grab;
      }

      .extended {
        font-size: 0.8em;
        margin-top: var(--line-extended-gap);
      }
      &.line-mode {
        .font-lrc {
          transition: @transition-slow;
          transition-property: font-size, color;
        }
      }
      &.line-mode:not(.font-mode).active .font-lrc, &.font-mode.played .font-lrc {
        color: var(--color-lyric-played);
      }
      &.font-mode .extended .font-lrc {
        transition: @transition-slow;
        transition-property: font-size, color;
      }
      &.font-mode.played > .line > .font-lrc > span {
        background-size: 100% 100% !important;
      }

      &.font-mode > .line > .font-lrc {
        > span {
          transition: font-size @transition-slow;
          font-size: 1em;
          background-repeat: no-repeat;
          background-color: var(--color-lyric-unplay);
          background-image: -webkit-linear-gradient(left, var(--color-lyric-played), var(--color-lyric-played));
          -webkit-text-fill-color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          background-size: 0 100%;
          will-change: background-size;
          padding-left: 0.12em;
          padding-right: 0.12em;
          padding-bottom: 0.12em;
          margin-left: -0.11em;
          margin-right: -0.11em;
          margin-bottom: -0.12em;
        }
      }
     .line .shadow span {
        padding-left: 0.12em;
        padding-right: 0.12em;
        padding-bottom: 0.12em;
        margin-left: -0.11em;
        margin-right: -0.11em;
        margin-bottom: -0.12em;
      }
      // &.line-mode {
      //   .shadow {
      //     text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.40);
      //   }
      // }

      // &.font-mode {
      // }
    }
    .line-mode:not(.font-mode) .font-lrc, .extended .font-lrc {
      // text-shadow: 0 0 2px rgba(0, 0, 0, 0.7), 0 0 2px rgba(0, 0, 0, 0.3), 0 0 1px rgba(0, 0, 0, 0.3);
      .stroke3(var(--color-lyric-shadow));
      // .stroke2(rgba(0, 0, 0, 0.18));
      // .stroke(1px, rgba(0, 0, 0, 0.08));
      // .stroke(2px, rgba(0, 0, 0, 0.025));
      transition: font-size @transition-slow;
    }
    .font-mode .line .shadow span {
      .stroke(1px, var(--color-lyric-shadow-font-mode));
      transition: font-size @transition-slow;
      // text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3),  1px 1px 1px rgba(0, 0, 0, 0.3);
    }

  }
  // p {
  //   padding: 8px 0;
  //   line-height: 1.2;
  //   overflow-wrap: break-word;
  //   transition: @transition-normal !important;
  //   transition-property: color, font-size;
  // }
}
// .lrc-line {
//   display: inline-block;
//   padding: 8px 0;
//   line-height: 1.2;
//   overflow-wrap: break-word;
//   transition: @transition-normal;
//   transition-property: color, font-size, text-shadow;
//   cursor: grab;
//   // font-weight: bold;
//   // background: linear-gradient(@color-theme-lyric, @color-theme-lyric);
//   // background-clip: text;
//   // -webkit-background-clip: text;
//   // -webkit-text-fill-color: #fff;
//   // -webkit-text-stroke: thin #124628;
// }
.lyricSpace {
  height: 80%;
}
.hit {
  pointer-events: auto;
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  box-sizing: border-box;
  cursor: move;
}
.placeholder {
  width: auto;
  max-width: 100%;
  padding: 0 8px;
  box-sizing: border-box;
  text-align: center;
  color: var(--color-lyric-unplay);
  text-shadow: 0 1px 2px rgba(0, 0, 0, .55), 0 0 8px rgba(0, 0, 0, .35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
// .lyric-text {

// }
// .lrc-active {

//   .lrc-line {
//     color: @color-theme-lyric_2;
//     // background: linear-gradient(@color-theme-lyric, @color-theme-lyric_2);
//     // background-clip: text;
//     // -webkit-background-clip: text;
//     // -webkit-text-fill-color: @color-theme-lyric_2;
//     // -webkit-text-stroke: thin #124628;
//   }
// }
.draging {
  :global {
    .line-content {
      .font-lrc {
        cursor: grabbing;
      }
    }
  }
}
.lrcActiveZoom {
  :global {
    .line-content {
      &.active {
        .extended {
          font-size: .94em;
        }
        .line {
          font-size: 1.2em;
        }
      }
    }
  }
}
.ellipsis {
  :global {
    .font-lrc, .shadow {
      display: -webkit-box !important;
      .mixin-ellipsis(1);
    }
  }
}
.fontWeightFont {
  :global {
    .font-mode > .line {
      font-weight: bold;
    }
  }
}
.fontWeightLine {
  :global {
    .line-mode > .line {
      font-weight: bold;
    }
  }
}
.fontWeightExtended {
  :global {
    .extended {
      font-weight: bold;
    }
  }
}
// 网易云式当前句：双行左右交替、当前句放大、下一句变淡
.single {
  display: flex;
  flex: 0 0 auto;
  min-height: 0;
  height: auto;
  flex-flow: row nowrap;
  justify-content: center;
  align-items: center;
  overflow: visible;
  padding: 0;
  box-sizing: border-box;

  :global {
      .line-content {
        margin: 0 !important;
        width: auto;
        max-width: 100%;
        animation: lrc-line-in .32s ease;
        white-space: nowrap;

      .extended {
        display: none;
      }
      .line {
        max-width: 100%;
      }
      .font-lrc, .shadow {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      text-align: center;
      &.is-next {
        opacity: .7;
        transform: scale(.86);
        pointer-events: none;
        animation: none;
        .font-lrc {
          color: var(--color-lyric-unplay);
        }
      }
      &.active .line {
        font-size: 1.08em;
      }
    }
  }
}
.double {
  :global {
    .line-content {
      &.row-left {
        text-align: left;
        &.is-next {
          transform-origin: left center;
        }
      }
      &.row-right {
        text-align: right;
        &.is-next {
          transform-origin: right center;
        }
      }
    }
  }
}

@keyframes lrc-line-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
// .footer {
//   flex: 0 0 100px;
//   overflow: hidden;
//   display: flex;
//   align-items: center;
// }

</style>
