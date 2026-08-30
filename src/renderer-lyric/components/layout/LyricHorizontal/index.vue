<template>
  <div
    ref="dom_lyric"
    :class="[...classNames, { [$style.single]: isSingleMode }]"
    :style="lrcStyles"
    @wheel="handleWheel"
    @mousedown="handleLyricMouseDown"
    @touchstart="handleLyricTouchStart"
    @contextmenu.prevent="handleContextMenu"
  >
    <div v-if="!isSingleMode" :class="$style.lyricSpace" />
    <div ref="dom_lyric_text" />
    <div v-if="!isSingleMode" :class="$style.lyricSpace" />

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
import { setting } from '@lyric/store/state'
import { updateSetting } from '@lyric/utils/ipc'
import { sendDesktopLyricInfo } from '@lyric/core/mainWindowChannel'
import { computed, useCssModule, ref } from '@common/utils/vueTools'
import { useI18n } from '@lyric/plugins/i18n'
import useLyric from './useLyric'
import ContextMenu from '../ContextMenu.vue'

// 网易云式预设配色：已播放 / 未播放 / 阴影 三色一组
const COLOR_PRESETS = [
  { key: 'netease_red', labelKey: 'lyric_shape_color_netease_red', played: 'rgba(236, 65, 65, 1)', unplay: 'rgba(255, 255, 255, 1)', shadow: 'rgba(0, 0, 0, 0.35)' },
  { key: 'sunset', labelKey: 'lyric_shape_color_sunset', played: 'rgba(255, 140, 66, 1)', unplay: 'rgba(255, 244, 235, 1)', shadow: 'rgba(0, 0, 0, 0.3)' },
  { key: 'cute_pink', labelKey: 'lyric_shape_color_cute_pink', played: 'rgba(255, 126, 182, 1)', unplay: 'rgba(255, 255, 255, 1)', shadow: 'rgba(0, 0, 0, 0.28)' },
  { key: 'sky_blue', labelKey: 'lyric_shape_color_sky_blue', played: 'rgba(74, 163, 255, 1)', unplay: 'rgba(255, 255, 255, 1)', shadow: 'rgba(0, 0, 0, 0.3)' },
  { key: 'fresh_green', labelKey: 'lyric_shape_color_fresh_green', played: 'rgba(46, 201, 126, 1)', unplay: 'rgba(255, 255, 255, 1)', shadow: 'rgba(0, 0, 0, 0.3)' },
  { key: 'vitality_purple', labelKey: 'lyric_shape_color_vitality_purple', played: 'rgba(155, 107, 255, 1)', unplay: 'rgba(255, 255, 255, 1)', shadow: 'rgba(0, 0, 0, 0.3)' },
  { key: 'gentle_yellow', labelKey: 'lyric_shape_color_gentle_yellow', played: 'rgba(255, 208, 77, 1)', unplay: 'rgba(255, 255, 255, 1)', shadow: 'rgba(0, 0, 0, 0.35)' },
  { key: 'low_gray', labelKey: 'lyric_shape_color_low_gray', played: 'rgba(154, 154, 154, 1)', unplay: 'rgba(228, 228, 228, 1)', shadow: 'rgba(0, 0, 0, 0.2)' },
]

export default {
  components: {
    ContextMenu,
  },
  setup() {
    const t = useI18n()
    const styles = useCssModule()
    // 窗口高度在单行条(64)/双行条(110)范围内时启用“当前句”渲染
    const isSingleMode = computed(() => {
      return setting['desktopLyric.height'] <= 140
    })
    const getLineCount = () => {
      return setting['desktopLyric.height'] > 80 ? 2 : 1
    }
    // const isZoomActiveLrc = computed(() => setting['desktopLyric.style.isZoomActiveLrc'])
    // const ellipsis = computed(() => setting['desktopLyric.style.ellipsis'])
    // const isFontWeightFont = computed(() => setting['desktopLyric.style.isFontWeightFont'])
    // const isFontWeightLine = computed(() => setting['desktopLyric.style.isFontWeightLine'])
    // const isFontWeightExtended = computed(() => setting['desktopLyric.style.isFontWeightExtended'])
    const classNames = computed(() => {
      const name = [styles.lyric]
      if (isMsDown.value) name.push(styles.draging)
      if (setting['desktopLyric.style.isZoomActiveLrc']) name.push(styles.lrcActiveZoom)
      if (setting['desktopLyric.style.ellipsis']) name.push(styles.ellipsis)
      if (setting['desktopLyric.style.isFontWeightFont']) name.push(styles.fontWeightFont)
      if (setting['desktopLyric.style.isFontWeightLine']) name.push(styles.fontWeightLine)
      if (setting['desktopLyric.style.isFontWeightExtended']) name.push(styles.fontWeightExtended)
      return name
    })
    const lrcStyles = computed(() => ({
      fontFamily: setting['desktopLyric.style.font'],
      fontSize: Math.trunc(setting['desktopLyric.style.fontSize']) + 'px',
      opacity: setting['desktopLyric.style.opacity'] / 100,
      textAlign: setting['desktopLyric.style.align'],
      '--line-gap': setting['desktopLyric.style.lineGap'] + 'px',
      '--line-extended-gap': (setting['desktopLyric.style.lineGap'] / 3).toFixed(2) + 'px',
    }))
    const isComputeHeight = computed(() => {
      return setting['desktopLyric.style.isZoomActiveLrc'] && !setting['desktopLyric.isDelayScroll']
    })
    const {
      dom_lyric,
      dom_lyric_text,
      isMsDown,
      handleLyricMouseDown,
      handleLyricTouchStart,
      handleWheel,
    } = useLyric(isComputeHeight, getLineCount)

    // ================= 右键菜单 =================
    const menuVisible = ref(false)
    const menuX = ref(0)
    const menuY = ref(0)

    const handleContextMenu = (event) => {
      menuX.value = event.clientX
      menuY.value = event.clientY
      menuVisible.value = true
    }

    const update = (settingPartial) => {
      updateSetting(settingPartial).catch(_ => _)
    }

    const isCurrentPreset = (preset) => {
      return setting['desktopLyric.style.lyricPlayedColor'] == preset.played &&
        setting['desktopLyric.style.lyricUnplayColor'] == preset.unplay &&
        setting['desktopLyric.style.lyricShadowColor'] == preset.shadow
    }

    const menuItems = computed(() => {
      return [
        {
          key: 'always_on_top',
          label: t('setting__desktop_lyric_always_on_top'),
          checked: setting['desktopLyric.isAlwaysOnTop'],
        },
        {
          key: 'toggle_double',
          label: t('lyric_menu__toggle_double'),
          checked: setting['desktopLyric.height'] > 80,
        },
        {
          key: 'translation',
          label: t('setting__play_lyric_transition'),
          checked: setting['player.isShowLyricTranslation'],
        },
        {
          key: 'toggle_vertical',
          label: t('setting__desktop_lyric_direction_vertical'),
          checked: setting['desktopLyric.direction'] == 'vertical',
        },
        {
          key: 'align',
          label: t('setting__desktop_lyric_align'),
          children: [
            { key: 'align_left', label: t('setting__desktop_lyric_align_left'), checked: setting['desktopLyric.style.align'] == 'left' },
            { key: 'align_center', label: t('setting__desktop_lyric_align_center'), checked: setting['desktopLyric.style.align'] == 'center' },
            { key: 'align_right', label: t('setting__desktop_lyric_align_right'), checked: setting['desktopLyric.style.align'] == 'right' },
          ],
        },
        {
          key: 'colors',
          label: t('lyric_menu__change_color'),
          children: [
            ...COLOR_PRESETS.map(preset => ({
              key: 'color_' + preset.key,
              label: t(preset.labelKey),
              checked: isCurrentPreset(preset),
            })),
            { key: 'color_custom', label: t('lyric_menu__color_custom'), checked: !COLOR_PRESETS.some(isCurrentPreset) },
          ],
        },
        {
          key: 'more',
          label: t('lyric_menu__more_settings'),
        },
      ]
    })

    const handleMenuAction = (item) => {
      switch (item.key) {
        case 'always_on_top':
          update({ 'desktopLyric.isAlwaysOnTop': !setting['desktopLyric.isAlwaysOnTop'] })
          break
        case 'toggle_double':
          // x/y 置空才会让主进程重新应用窗口尺寸（与设置页“显示形态”切换一致）
          update({
            'desktopLyric.width': 680,
            'desktopLyric.height': setting['desktopLyric.height'] > 80 ? 64 : 110,
            'desktopLyric.x': null,
            'desktopLyric.y': null,
          })
          break
        case 'translation':
          update({ 'player.isShowLyricTranslation': !setting['player.isShowLyricTranslation'] })
          break
        case 'toggle_vertical':
          update({ 'desktopLyric.direction': setting['desktopLyric.direction'] == 'vertical' ? 'horizontal' : 'vertical' })
          break
        case 'align_left':
        case 'align_center':
        case 'align_right':
          update({ 'desktopLyric.style.align': item.key.split('_')[1] })
          break
        case 'color_custom':
          // sendDesktopLyricInfo 内部会包装为 { action }，此处传字符串而非对象
          sendDesktopLyricInfo('open_settings')
          break
        case 'more':
          sendDesktopLyricInfo('open_settings')
          break
        default:
          if (item.key.startsWith('color_')) {
            const preset = COLOR_PRESETS.find(p => 'color_' + p.key == item.key)
            if (preset) {
              update({
                'desktopLyric.style.lyricPlayedColor': preset.played,
                'desktopLyric.style.lyricUnplayColor': preset.unplay,
                'desktopLyric.style.lyricShadowColor': preset.shadow,
              })
            }
          }
      }
    }

    return {
      classNames,
      lrcStyles,
      isSingleMode,

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
  height: 100%;
  overflow: hidden;
  font-size: 16px;
  cursor: move;
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
      &.line-mode.active .font-lrc, &.font-mode.played .font-lrc {
        color: var(--color-lyric-played);
      }
      &.font-mode .extended .font-lrc {
        transition: @transition-slow;
        transition-property: font-size, color;
      }
      // &.font-mode > .line {
      //   font-weight: bold;
      // }

      &.font-mode > .line > .font-lrc {
        > span {
          transition: @transition-slow;
          transition-property: font-size;
          font-size: 1em;
          background-repeat: no-repeat;
          background-color: var(--color-lyric-unplay);
          background-image: -webkit-linear-gradient(left, var(--color-lyric-played), var(--color-lyric-played));
          -webkit-text-fill-color: transparent;
          -webkit-background-clip: text;
          background-size: 0 100%;
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
    .line-mode .font-lrc, .extended .font-lrc {
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
// 当前句模式：垂直居中 + 行入场动画
.single {
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  overflow: hidden;

  :global {
    .line-content {
      margin: 0 !important;
      animation: lrc-line-in .28s ease;
    }
  }
}

@keyframes lrc-line-in {
  from {
    opacity: 0;
    transform: translateY(10px);
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
