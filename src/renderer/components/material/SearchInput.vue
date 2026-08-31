<template>
  <div :class="$style.container">
    <div :class="[$style.search, {[$style.active]: focus}, {[$style.big]: big}, {[$style.small]: small}]">
      <div :class="$style.form">
        <button type="button" :class="$style.searchBtn" @click="handleSearch">
          <slot>
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 30.239 30.239" space="preserve">
              <use xlink:href="#icon-search" />
            </svg>
          </slot>
        </button>
        <input
          ref="dom_input"
          v-model.trim="text"
          :placeholder="placeholder"
          @focus="handleFocus"
          @blur="handleBlur"
          @input="$emit('update:modelValue', text)"
          @change="sendEvent('change')"
          @keyup.enter="handleSearch"
          @keydown.arrow-down.arrow-up.prevent
          @keyup.arrow-down.prevent="handleKeyDown"
          @keyup.arrow-up.prevent="handleKeyUp"
          @contextmenu="handleContextMenu"
        >
        <transition enter-active-class="animated zoomIn" leave-active-class="animated zoomOut">
          <button v-show="text" type="button" @click="handleClearList">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 24 24" space="preserve">
              <use xlink:href="#icon-window-close" />
            </svg>
          </button>
        </transition>
      </div>
      <div v-if="list" :class="$style.list" :style="listStyle">
        <ul ref="dom_list" @mouseleave="selectIndex = -1">
          <li
            v-for="(item, index) in list"
            :key="item"
            :class="{[$style.select]: selectIndex === index }"
            @mouseenter="selectIndex = index"
            @click="handleTemplistClick(index)"
          >
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import { clipboardReadText } from '@common/utils/electron'
import { HOTKEY_COMMON } from '@common/hotKey'
import { appSetting } from '@renderer/store/setting'

export default {
  props: {
    placeholder: {
      type: String,
      default: 'Search for something...',
    },
    list: {
      type: Array,
      default() {
        return []
      },
    },
    visibleList: {
      type: Boolean,
      default: false,
    },
    modelValue: {
      type: String,
      default: '',
    },
    big: {
      type: Boolean,
      default: false,
    },
    small: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue', 'event'],
  data() {
    return {
      isShow: false,
      text: '',
      selectIndex: -1,
      focus: false,
      listStyle: {
        height: 0,
      },
    }
  },
  watch: {
    list(n) {
      if (!this.visibleList) return
      if (this.selectIndex > -1) this.selectIndex = -1
      this.$nextTick(() => {
        this.listStyle.height = this.$refs.dom_list.scrollHeight + 'px'
      })
    },
    modelValue(n) {
      this.text = n
    },
    visibleList(n) {
      n ? this.showList() : this.hideList()
    },
  },
  mounted() {
    if (appSetting['search.isFocusSearchBox']) this.handleFocusInput()
    this.handleRegisterEvent('on')
  },
  beforeUnmount() {
    this.handleRegisterEvent('off')
  },
  methods: {
    handleRegisterEvent(action) {
      let eventHub = window.key_event
      let name = action == 'on' ? 'on' : 'off'
      // eslint-disable-next-line @typescript-eslint/unbound-method
      eventHub[name](HOTKEY_COMMON.focusSearchInput.action, this.handleFocusInput)
    },
    handleFocusInput() {
      this.$refs.dom_input.focus()
    },
    handleTemplistClick(index) {
      console.log(index)
      this.sendEvent('listClick', index)
    },
    handleFocus() {
      this.focus = true
      this.sendEvent('focus')
    },
    handleBlur() {
      setTimeout(() => {
        this.focus = false
        this.sendEvent('blur')
      }, 80)
    },
    handleSearch() {
      this.hideList()
      if (this.selectIndex < 0) {
        this.sendEvent('submit')
        return
      }
      this.sendEvent('listClick', this.selectIndex)
    },
    showList() {
      this.isShow = true
      this.listStyle.height = this.$refs.dom_list.scrollHeight + 'px'
    },
    hideList() {
      this.isShow = false
      this.listStyle.height = 0
      this.$nextTick(() => {
        this.selectIndex = -1
      })
    },
    sendEvent(action, data) {
      this.$emit('event', {
        action,
        data,
      })
    },
    handleKeyDown() {
      if (this.list.length) {
        this.selectIndex = this.selectIndex + 1 < this.list.length ? this.selectIndex + 1 : 0
      } else if (this.selectIndex > -1) {
        this.selectIndex = -1
      }
    },
    handleKeyUp() {
      if (this.list.length) {
        this.selectIndex = this.selectIndex - 1 < -1 ? this.list.length - 1 : this.selectIndex - 1
      } else if (this.selectIndex > -1) {
        this.selectIndex = -1
      }
    },
    handleContextMenu() {
      let str = clipboardReadText()
      str = str.trim()
      str = str.replace(/\t|\r\n|\n|\r/g, ' ')
      str = str.replace(/\s+/g, ' ')
      let dom_input = this.$refs.dom_input
      this.text = this.text.substring(0, dom_input.selectionStart) + str + this.text.substring(dom_input.selectionEnd, this.text.length)
      this.$emit('update:modelValue', this.text)
    },
    handleClearList() {
      this.text = ''
      this.$emit('update:modelValue', this.text)
      this.sendEvent('submit')
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  position: relative;
  width: 100%;
  max-width: 300px;
  min-width: 140px;
  height: 26px;
  -webkit-app-region: no-drag;
}

.search {
  position: absolute;
  width: 100%;
  border-radius: @radius-round;
  border: 1px solid transparent;
  transition: box-shadow .25s ease, background-color .25s ease, border-color .25s ease;
  display: flex;
  flex-flow: column nowrap;
  background-color: var(--color-050);

  &:hover:not(.active) {
    background-color: var(--color-100);
  }

  &.active {
    background-color: var(--color-000);
    border-color: var(--color-primary-alpha-500);
    box-shadow: 0 0 0 3px var(--color-primary-alpha-900), 0 2px 10px rgba(0, 0, 0, .05);

    .searchBtn {
      color: var(--color-primary);
    }
  }
  .form {
    display: flex;
    height: 24px;
    position: relative;
    input {
      flex: auto;
      background-color: transparent;
      border: none;
      min-width: 0;

      outline: none;
      padding: 0 4px 0 2px;
      overflow: hidden;
      font-size: 12.5px;
      line-height: 24px;
      &::placeholder {
        color: var(--color-450);
        font-size: .98em;
      }
    }
    button {
      flex: none;
      border: none;
      background-color: transparent;
      outline: none;
      cursor: pointer;
      height: 100%;
      width: 24px;
      padding: 0;
      margin: 0 2px;
      border-radius: @radius-round;
      color: var(--color-500);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color .2s ease, color .2s ease;

      svg {
        height: 12px;
        width: 12px;
      }

      &:hover {
        color: var(--color-800);
        background-color: var(--color-100);
      }
      &:active {
        opacity: .7;
      }
    }
    .searchBtn {
      margin-left: 6px;
      pointer-events: auto;
      color: var(--color-550);

      &:hover {
        color: var(--color-primary);
        background-color: transparent;
      }
    }
  }
  .list {
    font-size: 13px;
    transition: .3s ease;
    height: 0;
    transition-property: height;
    overflow: hidden;
    li {
      cursor: pointer;
      padding: 8px 14px 8px 40px;
      transition: background-color .15s ease;
      line-height: 1.3;
      span {
        .mixin-ellipsis-2();
      }

      &.select {
        background-color: var(--color-primary-alpha-900);
      }
      &:first-child {
        margin-top: 4px;
      }
      &:last-child {
        margin-bottom: 6px;
        border-bottom-left-radius: @radius-card;
        border-bottom-right-radius: @radius-card;
      }
    }
  }
}

.big {
  width: 100%;
  // input {
  //   line-height: 30px;
  // }
  .form {
    height: 30px;
    button {
      padding: 6px 10px;
    }
  }
}


</style>
