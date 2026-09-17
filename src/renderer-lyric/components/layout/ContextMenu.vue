<template>
  <teleport to="body">
    <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut">
      <div v-show="visible" data-lyric-hit :class="$style.mask" @mousedown.self="handleClose" @contextmenu.prevent="handleClose">
        <div
          ref="dom_menu"
          data-lyric-hit
          :class="$style.menu"
          :style="menuStyle"
          @mousedown.stop
        >
          <template v-for="item in items" :key="item.key">
            <div v-if="item.type === 'separator'" :class="$style.separator" />
            <div
              v-else
              :class="[$style.item, { [$style.disabled]: item.disabled }]"
              @mouseenter="handleItemEnter(item, $event)"
              @click="handleItemClick(item)"
            >
              <span :class="$style.icon">
                <svg v-if="item.icon" viewBox="0 0 24 24">
                  <use :xlink:href="'#icon-menu-' + item.icon" />
                </svg>
              </span>
              <span :class="$style.label">{{ item.label }}</span>
              <span v-if="item.children?.length" :class="$style.arrow">›</span>
              <span v-else-if="item.checked" :class="$style.check">✓</span>
              <span v-else :class="$style.check" />
            </div>
          </template>

          <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut">
            <div v-if="subMenu && subMenu.visible" data-lyric-hit :class="$style.subMenu" :style="subMenuStyle" @mousedown.stop>
              <template v-for="sub in subMenu.items" :key="sub.key">
                <div v-if="sub.type === 'separator'" :class="$style.separator" />
                <div
                  v-else
                  :class="[$style.item, { [$style.disabled]: sub.disabled }]"
                  @click.stop="handleSubItemClick(sub)"
                >
                  <span :class="$style.label">{{ sub.label }}</span>
                  <span v-if="sub.checked" :class="$style.check">✓</span>
                  <span v-else :class="$style.check" />
                </div>
              </template>
            </div>
          </transition>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script>
import { computed, ref, watch } from '@common/utils/vueTools'

export default {
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    items: {
      type: Array,
      default() {
        return []
      },
    },
    x: {
      type: Number,
      default: 0,
    },
    y: {
      type: Number,
      default: 0,
    },
  },
  emits: ['update:visible', 'action'],
  setup(props, { emit }) {
    const dom_menu = ref(null)
    const subMenu = ref({
      visible: false,
      x: 0,
      y: 0,
      items: [],
    })

    const menuStyle = computed(() => {
      let x = props.x
      let y = props.y
      const menuW = 220
      const menuH = Math.min(props.items.length * 40 + 16, window.innerHeight - 12)
      if (x + menuW > window.innerWidth - 8) x = Math.max(8, window.innerWidth - menuW - 8)
      if (y + menuH > window.innerHeight - 8) y = Math.max(8, window.innerHeight - menuH - 8)
      if (x < 8) x = 8
      if (y < 8) y = 8
      return { left: x + 'px', top: y + 'px' }
    })

    const subMenuStyle = computed(() => {
      return { left: subMenu.value.x + 'px', top: subMenu.value.y + 'px' }
    })

    const handleClose = () => {
      subMenu.value.visible = false
      emit('update:visible', false)
    }

    const openSubMenu = (item, event) => {
      if (!item.children?.length) {
        subMenu.value.visible = false
        return
      }
      const domItem = event?.currentTarget
      const rect = domItem?.getBoundingClientRect()
      const subW = 176
      const subH = Math.min(item.children.length * 40 + 16, window.innerHeight - 12)
      let x = (rect?.right ?? props.x + 220) + 4
      let y = (rect?.top ?? props.y)
      if (x + subW > window.innerWidth - 8) x = (rect?.left ?? props.x) - subW - 4
      if (y + subH > window.innerHeight - 8) y = Math.max(8, window.innerHeight - subH - 8)
      subMenu.value = {
        visible: true,
        x,
        y,
        items: item.children,
      }
    }

    const handleItemEnter = (item, event) => {
      if (item.children?.length) openSubMenu(item, event)
      else subMenu.value.visible = false
    }

    const handleItemClick = (item) => {
      if (item.disabled || item.children?.length) return
      emit('action', item)
      handleClose()
    }

    const handleSubItemClick = (sub) => {
      if (sub.disabled) return
      emit('action', sub)
      handleClose()
    }

    watch(() => props.visible, (visible) => {
      if (!visible) subMenu.value.visible = false
    })

    return {
      dom_menu,
      subMenu,
      menuStyle,
      subMenuStyle,
      handleClose,
      handleItemEnter,
      handleItemClick,
      handleSubItemClick,
    }
  },
}
</script>

<style lang="less" module>
@import '@lyric/assets/styles/layout.less';

.mask {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 999;
  pointer-events: auto;
}

.menu,
.subMenu {
  position: fixed;
  box-sizing: border-box;
  padding: 8px 0;
  border-radius: 10px;
  background-color: #fff;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .18);
}

.menu {
  min-width: 216px;
}

.subMenu {
  min-width: 168px;
  z-index: 1000;
}

.item {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  height: 38px;
  padding: 0 14px;
  cursor: pointer;
  color: #333;
  font-size: 13px;
  transition: background-color .12s ease;

  &:hover {
    background-color: #f5f5f5;
  }

  &.disabled {
    opacity: .4;
    cursor: default;

    &:hover {
      background-color: transparent;
    }
  }
}

.icon {
  flex: none;
  width: 18px;
  height: 18px;
  margin-right: 10px;
  color: #666;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  :global(svg) {
    width: 18px;
    height: 18px;
    display: block;
  }
}

.check {
  flex: none;
  width: 16px;
  margin-left: 12px;
  font-size: 13px;
  color: #ec4141;
  text-align: right;
}

.label {
  flex: auto;
  min-width: 0;
  .mixin-ellipsis-1();
}

.arrow {
  flex: none;
  padding-left: 12px;
  color: #bbb;
  font-size: 16px;
  line-height: 1;
}

.separator {
  height: 1px;
  margin: 6px 12px;
  background-color: rgba(0, 0, 0, .06);
}
</style>
