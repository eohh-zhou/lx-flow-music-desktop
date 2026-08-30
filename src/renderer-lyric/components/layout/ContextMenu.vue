<template>
  <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut">
    <div v-show="visible" :class="$style.mask" @mousedown.self="handleClose" @contextmenu.prevent="handleClose">
      <div
        ref="dom_menu"
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
            <span :class="$style.check">{{ item.checked ? '✓' : '' }}</span>
            <span :class="$style.label">{{ item.label }}</span>
            <span :class="$style.arrow">{{ item.children?.length ? '›' : '' }}</span>
          </div>
        </template>

        <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut">
          <div v-if="subMenu && subMenu.visible" :class="$style.subMenu" :style="subMenuStyle">
            <template v-for="sub in subMenu.items" :key="sub.key">
              <div v-if="sub.type === 'separator'" :class="$style.separator" />
              <div
                v-else
                :class="[$style.item, { [$style.disabled]: sub.disabled }]"
                @click.stop="handleSubItemClick(sub)"
              >
                <span :class="$style.check">{{ sub.checked ? '✓' : '' }}</span>
                <span :class="$style.label">{{ sub.label }}</span>
              </div>
            </template>
          </div>
        </transition>
      </div>
    </div>
  </transition>
</template>

<script>
import { computed, ref } from '@common/utils/vueTools'

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
      const menuW = 176
      const menuH = Math.min(props.items.length * 30 + 12, 340, window.innerHeight - 8)
      if (x + menuW > window.innerWidth - 4) x = Math.max(4, window.innerWidth - menuW - 4)
      if (y + menuH > window.innerHeight - 4) y = Math.max(4, window.innerHeight - menuH - 4)
      return { left: x + 'px', top: y + 'px' }
    })

    const subMenuStyle = computed(() => {
      return { left: subMenu.value.x + 'px', top: subMenu.value.y + 'px' }
    })

    const handleClose = () => {
      emit('update:visible', false)
    }

    const openSubMenu = (item, event) => {
      if (!item.children?.length) {
        subMenu.value.visible = false
        return
      }
      const domItem = event?.currentTarget
      const rect = domItem?.getBoundingClientRect()
      const subW = 150
      const subH = Math.min(item.children.length * 30 + 12, 340, window.innerHeight - 8)
      let x = (rect?.right ?? props.x + menuW) + 2
      let y = (rect?.top ?? props.y)
      if (x + subW > window.innerWidth - 4) x = (rect?.left ?? props.x) - subW - 2
      if (y + subH > window.innerHeight - 4) y = Math.max(4, window.innerHeight - subH - 4)
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
}

.menu {
  position: absolute;
  min-width: 172px;
  // 条状歌词窗口较矮时限制菜单高度，靠内部滚动展示所有项
  max-height: min(340px, calc(100vh - 8px));
  overflow-y: auto;
  box-sizing: border-box;
  padding: 5px;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, .98);
  box-shadow: 0 4px 20px rgba(0, 0, 0, .18), 0 0 0 1px rgba(0, 0, 0, .04);
}

.subMenu {
  position: fixed;
  min-width: 148px;
  max-height: min(340px, calc(100vh - 8px));
  overflow-y: auto;
  box-sizing: border-box;
  padding: 5px;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, .98);
  box-shadow: 0 4px 20px rgba(0, 0, 0, .18), 0 0 0 1px rgba(0, 0, 0, .04);
}

.item {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  border-radius: 5px;
  cursor: pointer;
  color: #333;
  font-size: 12.5px;
  transition: background-color .12s ease;

  &:hover {
    background-color: rgba(0, 0, 0, .06);
  }

  &.disabled {
    opacity: .4;
    cursor: default;

    &:hover {
      background-color: transparent;
    }
  }
}

.check {
  flex: none;
  width: 20px;
  font-size: 11px;
  color: var(--color-lyric-played, #ec4141);
}

.label {
  flex: auto;
  min-width: 0;
  .mixin-ellipsis-1();
}

.arrow {
  flex: none;
  padding-left: 10px;
  color: #999;
  font-size: 13px;
}

.separator {
  height: 1px;
  margin: 4px 8px;
  background-color: rgba(0, 0, 0, .08);
}
</style>
