<template lang="pug">
dt#about {{ $t('setting__about') }}
dd
  .p.small
    | LX Flow Music 是基于 LX Music Desktop 开发的个人定制版，并非上游项目的官方发行版。
  .p.small
    | 本项目代码：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/eohh-zhou/lx-flow-music-desktop')") https://github.com/eohh-zhou/lx-flow-music-desktop
  .p.small
    | 本项目发布地址：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/eohh-zhou/lx-flow-music-desktop/releases')") GitHub Releases
  .p.small
    | 上游代码来源（原项目）：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/lyswhut/lx-music-desktop')") LX Music Desktop
    | 。感谢原作者及项目贡献者，本项目继续遵循原项目的开源许可。
  .p.small
    | 上游项目的常见问题文档：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://lyswhut.github.io/lx-music-doc/desktop/faq')") 桌面版常见问题
  .p.small
    | 本项目的问题与功能建议可到&nbsp;GitHub&nbsp;
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/eohh-zhou/lx-flow-music-desktop/issues')") 提交&nbsp;Issue
    | 。
  br
  .p.small 由于软件开发的初衷仅是为了对新技术的学习与研究，因此软件直至停止维护都将会一直保持纯净。
  .p.small
    | 本项目仅通过上述&nbsp;
    strong GitHub Releases
    | &nbsp;发布，其他渠道均为第三方转载，可信度请自行鉴别。
  .p.small
    strong 本项目没有微信公众号之类的所谓「官方账号」，谨防被骗！

  .p.small
    | 你已签署本软件的
    base-btn(min @click="handleShowPact") 许可协议
    | ，协议的在线版本在
    strong.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/eohh-zhou/lx-flow-music-desktop/blob/main/LICENSE')") 这里
    | 。
  br

  .p.small
    | By:&nbsp;
    strong eohh
</template>

<script>
// import { ref, onBeforeUnmount } from '@common/utils/vueTools'
import { isShowPact } from '@renderer/store'
import { openUrl } from '@common/utils/electron'

export default {
  name: 'SettingAbout',
  setup() {
    const handleShowPact = () => {
      isShowPact.value = true
    }
    return {
      openUrl,
      handleShowPact,
    }
  },
}
</script>
