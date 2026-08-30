<template>
  <div :class="[$style.aside, { [$style.fullscreen]: isFullscreen }]">
    <ControlBtns v-if="appSetting['common.controlBtnPosition'] == 'left'" />
    <div v-else :class="$style.logo">
      <div :class="$style.logoMark">LX</div>
      <span>LX MUSIC</span>
    </div>
    <NavBar />
  </div>
</template>

<script setup>
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'

import ControlBtns from './ControlBtns.vue'
import NavBar from './NavBar.vue'

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.aside {
  // box-shadow: 0 0 5px rgba(0, 0, 0, .3);
  transition: @transition-normal;
  transition-property: background-color;
  -webkit-app-region: drag;
  -webkit-user-select: none;
  display: flex;
  flex-flow: column nowrap;

  &.fullscreen {
    -webkit-app-region: no-drag;
    .logo {
      display: none;
    }
  }
}

.logo {
  box-sizing: border-box;
  padding: 0 20px;
  height: 54px;
  color: var(--color-font);
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
  font-size: 14.5px;
  letter-spacing: .4px;
  .mixin-ellipsis-1();
}

.logoMark {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--color-primary-light-100), var(--color-primary-dark-100));
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .5px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px var(--color-primary-alpha-600);
  user-select: none;
}

</style>
