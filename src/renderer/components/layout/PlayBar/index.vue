<template>
  <CenterControlBar v-if="style == 'centerControl'" />
  <CenterControlMiddleBar v-else-if="style == 'centerControlMiddle'" />
  <CenterControlFullBar v-else-if="style == 'centerControlFull'" />
  <FullWidthProgress v-else-if="style == 'full'" />
  <MiddleWidthProgress v-else-if="style == 'middle'" />
  <MiniWidthProgress v-else />
</template>

<script setup>
import { computed } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import MiniWidthProgress from './MiniWidthProgress.vue'
import FullWidthProgress from './FullWidthProgress.vue'
import MiddleWidthProgress from './MiddleWidthProgress.vue'
import CenterControlBar from './CenterControlBar.vue'
import CenterControlMiddleBar from './CenterControlMiddleBar.vue'
import CenterControlFullBar from './CenterControlFullBar.vue'

const style = computed(() => appSetting['common.playBarProgressStyle'])
</script>
