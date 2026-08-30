<template>
  <div :class="$style.menu">
    <ul :class="$style.list" role="toolbar">
      <li v-for="group in menuGroups" :key="group.label" :class="$style.navGroup" role="presentation">
        <div :class="$style.groupLabel">{{ group.label }}</div>
        <ul :class="$style.groupList">
          <li v-for="item in group.items" :key="item.name" :class="$style.navItem" role="presentation">
            <template v-if="item.children">
              <button
                type="button" :class="[$style.link, {[$style.active]: isGroupActive(item)}]" role="tab"
                :aria-selected="isGroupActive(item)" :aria-expanded="expandedGroups[item.name]" :aria-label="item.tips"
                @click="toggleExpand(item)"
              >
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" :viewBox="item.iconSize" :height="item.size" :width="item.size" space="preserve">
                  <use :xlink:href="item.icon" />
                </svg>
                <span :class="$style.label">{{ item.tips }}</span>
                <svg :class="[$style.chevron, { [$style.chevronOpen]: expandedGroups[item.name] }]" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 425.2 425.2" :height="14" :width="14" space="preserve">
                  <use xlink:href="#icon-right" />
                </svg>
              </button>
              <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
                <ul v-show="expandedGroups[item.name]" :class="$style.subList">
                  <li v-for="child in item.children" :key="child.to" :class="$style.subItem" role="presentation">
                    <router-link :class="[$style.subLink, {[$style.active]: isMenuActive(child.name)}]" role="tab" :aria-selected="isMenuActive(child.name)" :to="child.to" :aria-label="child.tips">
                      <span :class="$style.label">{{ child.tips }}</span>
                    </router-link>
                  </li>
                </ul>
              </transition>
            </template>
            <router-link v-else :class="[$style.link, {[$style.active]: isMenuActive(item.name)}]" role="tab" :aria-selected="isMenuActive(item.name)" :to="item.to" :aria-label="item.tips">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" :viewBox="item.iconSize" :height="item.size" :width="item.size" space="preserve">
                <use :xlink:href="item.icon" />
              </svg>
              <span :class="$style.label">{{ item.tips }}</span>
            </router-link>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { appSetting } from '@renderer/store/setting'
import { useI18n } from '@root/lang'
import { computed, reactive } from '@common/utils/vueTools'
import { useRoute } from '@common/utils/vueRouter'

const EXPAND_STORAGE_KEY = 'lx__nav_online_playlists_expanded'

export default {
  name: 'NavBar',
  setup() {
    const t = useI18n()
    const route = useRoute()

    const expandedGroups = reactive<Record<string, boolean>>({
      OnlinePlaylists: localStorage.getItem(EXPAND_STORAGE_KEY) !== 'false',
    })
    const toggleExpand = (item: { name: string }) => {
      expandedGroups[item.name] = !expandedGroups[item.name]
      if (item.name == 'OnlinePlaylists') localStorage.setItem(EXPAND_STORAGE_KEY, String(expandedGroups[item.name]))
    }

    const menus = computed(() => {
      const size = 18
      const onlinePlaylistChildren = [
        {
          to: '/qqMusic/myPlaylists',
          tips: t('online_playlists_qq'),
          name: 'QQMusicMyPlaylists',
          enable: appSetting['qqMusic.enabled'],
        }, {
          to: '/neteaseMusic/myPlaylists',
          tips: t('online_playlists_netease'),
          name: 'NeteaseMusicMyPlaylists',
          enable: appSetting['neteaseMusic.enabled'],
        },
      ].filter(m => m.enable)
      return [
        {
          to: '/search',
          tips: t('search'),
          icon: '#icon-search-2',
          iconSize: '0 0 425.2 425.2',
          size,
          name: 'Search',
          enable: true,
        },
        {
          to: '/songList/list',
          tips: t('song_list'),
          icon: '#icon-album',
          iconSize: '0 0 425.2 425.2',
          size,
          name: 'SongList',
          enable: true,
        },
        {
          to: '/qqMusic/recommend',
          tips: t('qq_music'),
          icon: '#icon-audio-wave',
          iconSize: '0 0 24 24',
          size,
          name: 'QQMusicRecommend',
          enable: appSetting['qqMusic.enabled'],
        }, {
          to: '/neteaseMusic/recommend',
          tips: t('netease_music'),
          icon: '#icon-audio-wave',
          iconSize: '0 0 24 24',
          size,
          name: 'NeteaseMusicRecommend',
          enable: appSetting['neteaseMusic.enabled'],
        },
        {
          to: '/leaderboard',
          tips: t('leaderboard'),
          icon: '#icon-leaderboard',
          iconSize: '0 0 425.22 425.2',
          size,
          name: 'Leaderboard',
          enable: true,
        },
        {
          to: '/list',
          tips: t('my_list'),
          icon: '#icon-love',
          iconSize: '0 0 444.87 391.18',
          size,
          name: 'List',
          enable: true,
        },
        {
          to: '',
          tips: t('nav__online_playlists'),
          icon: '#icon-album',
          iconSize: '0 0 425.2 425.2',
          size,
          name: 'OnlinePlaylists',
          enable: onlinePlaylistChildren.length > 0,
          children: onlinePlaylistChildren,
        },
        {
          to: '/download',
          tips: t('download'),
          icon: '#icon-download-2',
          iconSize: '0 0 425.2 425.2',
          size,
          enable: appSetting['download.enable'],
          name: 'Download',
        },
        {
          to: '/setting',
          tips: t('setting'),
          icon: '#icon-setting',
          iconSize: '0 0 493.23 436.47',
          size,
          enable: true,
          name: 'Setting',
        },
      ]
    })

    const menuGroups = computed(() => {
      const all = menus.value
      return [
        { label: t('nav__online'), items: all.slice(0, 5).filter(m => m.enable) },
        // 设置入口在侧边栏左下角，不在导航列表中
        { label: t('nav__my'), items: all.slice(5, 8).filter(m => m.enable) },
      ].filter(g => g.items.length)
    })

    const isMenuActive = (name: string) => {
      if (route.name == 'SongListDetail') {
        const from = route.query.fromName as string | undefined
        if (from == 'QQMusicRecommend' || from == 'QQMusicMyPlaylists' || from == 'NeteaseMusicRecommend' || from == 'NeteaseMusicMyPlaylists') return name == from
      }
      return route.meta.name == name
    }
    const isGroupActive = (item: { children: Array<{ name: string }> }) => item.children.some(child => isMenuActive(child.name))
    return {
      appSetting,
      menuGroups,
      expandedGroups,
      toggleExpand,
      isMenuActive,
      isGroupActive,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.menu {
  flex: auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 0;
}

.list {
  -webkit-app-region: no-drag;
  display: flex;
  flex-flow: column nowrap;
  padding: 0 12px;
}

.navGroup {
  flex: none;
  + .navGroup {
    margin-top: 10px;
  }
}

.groupLabel {
  padding: 6px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .8px;
  color: var(--color-400);
  user-select: none;
}

.groupList {
  display: flex;
  flex-flow: column nowrap;
  gap: 2px;
}

.navItem {
  position: relative;
  flex: none;
}

.chevron {
  flex: none;
  margin-left: auto;
  opacity: .55;
  color: var(--color-nav-font);
  transition: transform @transition-fast, opacity @transition-fast;

  .link:hover & {
    opacity: 1;
  }

  .link.active & {
    opacity: 1;
  }
}

.chevronOpen {
  transform: rotate(90deg);
}

.subList {
  display: flex;
  flex-flow: column nowrap;
  gap: 2px;
  padding: 2px 0 4px;
}

.subItem {
  position: relative;
  flex: none;
}

.subLink {
  box-sizing: border-box;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  height: 32px;
  margin: 0 4px 0 16px;
  padding: 0 10px;
  border-radius: 8px;
  text-decoration: none;
  transition: @transition-fast;
  transition-property: background-color, color, transform;
  color: var(--color-nav-font);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  outline: none;

  .label {
    .mixin-ellipsis-1();
  }

  &.active {
    color: var(--color-primary);
    background-color: var(--color-primary-alpha-900);
    font-weight: 600;

    &:hover {
      color: var(--color-primary);
      background-color: var(--color-primary-alpha-800);
    }
  }

  &:hover {
    color: var(--color-font);
    background-color: var(--color-050);
  }

  &:active:not(.active) {
    transform: scale(.98);
  }
}

.link {
  box-sizing: border-box;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background-color: transparent;
  text-decoration: none;
  transition: @transition-fast;
  transition-property: background-color, color, transform;
  color: var(--color-nav-font);
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  text-align: left;
  outline: none;

  &>svg {
    flex: none;
    opacity: .82;
    transition: opacity @transition-fast;
  }

  .label {
    .mixin-ellipsis-1();
  }

  &.active {
    color: var(--color-primary);
    background-color: var(--color-primary-alpha-900);
    font-weight: 600;

    &>svg {
      opacity: 1;
    }

    &:hover {
      color: var(--color-primary);
      background-color: var(--color-primary-alpha-800);
    }
  }

  &:hover {
    color: var(--color-font);
    background-color: var(--color-050);

    &>svg {
      opacity: 1;
    }
  }

  &:active:not(.active) {
    transform: scale(.98);
  }
}

</style>
