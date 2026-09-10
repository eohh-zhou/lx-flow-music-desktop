<template>
  <div :class="$style.menu">
    <ul :class="$style.list" role="toolbar">
      <li v-for="group in menuGroups" :key="group.label" :class="$style.navGroup" role="presentation">
        <div :class="$style.groupLabel">{{ group.label }}</div>
        <ul :class="$style.groupList">
          <li v-for="item in group.items" :key="item.name" :class="$style.navItem" role="presentation">
            <template v-if="item.children">
              <div :class="$style.groupRow" @contextmenu="handleGroupContextMenu($event, item)">
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
              </div>
              <ul
                v-show="expandedGroups[item.name]" :ref="item.name == 'List' ? setLocalListRef : undefined"
                :class="[$style.subList, { [$style.sortable]: item.name == 'List' && isModDown }]"
              >
                  <li
                    v-for="child in item.children" :key="child.key"
                    :class="[$style.subItem, { 'default-list': child.isDefault }, { 'user-list': child.isUser }, { [$style.clicked]: rightClickItemIndex == child.menuIndex }, { [$style.fetching]: child.listId && fetchingListStatus[child.listId] }]"
                    :data-index="child.userIndex" role="presentation" @contextmenu="handleLocalListContextMenu($event, child)"
                  >
                    <router-link :class="[$style.subLink, {[$style.active]: isChildActive(child)}]" role="tab" :aria-selected="isChildActive(child)" :to="child.to" :aria-label="child.tips">
                      <span v-if="child.showCover" :class="$style.subCover">
                        <img v-if="child.cover" :src="child.cover" loading="lazy" decoding="async" alt="" @error="handleCoverError(child.listId)">
                        <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 425.2 425.2" :height="14" :width="14" space="preserve">
                          <use xlink:href="#icon-album" />
                        </svg>
                      </span>
                      <span :class="$style.label">{{ child.tips }}</span>
                    </router-link>
                    <base-input
                      v-if="child.isUser" :class="$style.listsInput" type="text" :value="child.tips"
                      :placeholder="child.tips" @keyup.enter="handleSaveListName" @blur="handleSaveListName"
                    />
                  </li>
                  <li v-if="item.name == 'List' && isShowNewList" :class="[$style.subItem, $style.newListItem]">
                    <base-input
                      ref="dom_listsNewInput" :class="$style.newListInput" type="text" :placeholder="$t('lists__new_list_input')"
                      @keyup.enter="handleCreateList" @blur="handleCreateList"
                    />
                  </li>
                </ul>
            </template>
            <router-link v-else :class="[$style.link, {[$style.active]: isMenuActive(item.name)}]" role="tab" :aria-selected="isMenuActive(item.name)" :to="item.to" :aria-label="item.tips" @click="handleNavClick(item)">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" :viewBox="item.iconSize" :height="item.size" :width="item.size" space="preserve">
                <use :xlink:href="item.icon" />
              </svg>
              <span :class="$style.label">{{ item.tips }}</span>
            </router-link>
          </li>
        </ul>
      </li>
    </ul>
    <base-menu v-model="isShowLocalListMenu" :menus="activeLocalListMenus" :xy="localListMenuLocation" item-name="name" @menu-click="handleLocalListMenuClick" />
    <DuplicateMusicModal v-model:visible="isShowDuplicateMusicModal" :list-info="duplicateListInfo" />
    <ListSortModal v-model:visible="isShowListSortModal" :list-info="sortListInfo" />
    <ListUpdateModal v-model:visible="isShowListUpdateModal" />
    <QQMusicSyncModal v-model:visible="isShowQQMusicSyncModal" :list-info="qqMusicSyncListInfo" teleport="#root" />
    <NeteaseMusicSyncModal v-model:visible="isShowNeteaseMusicSyncModal" :list-info="neteaseMusicSyncListInfo" teleport="#root" />
  </div>
</template>

<script lang="ts">
import { openUrl } from '@common/utils/electron'
import { LIST_IDS } from '@common/constants'
import { appSetting } from '@renderer/store/setting'
import { useI18n } from '@root/lang'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { defaultList, fetchingListStatus, userLists } from '@renderer/store/list/state'
import { getListMusics, removeUserList } from '@renderer/store/list/action'
import { setVisibleListDetail } from '@renderer/store/songList/action'
import { getPicPath } from '@renderer/core/music'
import { dialog } from '@renderer/plugins/Dialog'
import { saveListPrevSelectId } from '@renderer/utils/data'
import musicSdk from '@renderer/utils/musicSdk'
import DuplicateMusicModal from '@renderer/views/List/MyList/components/DuplicateMusicModal.vue'
import ListSortModal from '@renderer/views/List/MyList/components/ListSortModal.vue'
import ListUpdateModal from '@renderer/views/List/MyList/components/ListUpdateModal.vue'
import QQMusicSyncModal from '@renderer/views/List/MyList/components/QQMusicSyncModal.vue'
import NeteaseMusicSyncModal from '@renderer/views/List/MyList/components/NeteaseMusicSyncModal.vue'
import useShare from '@renderer/views/List/MyList/useShare'
import useMenu from '@renderer/views/List/MyList/useMenu'
import useListUpdate from '@renderer/views/List/MyList/useListUpdate'
import useSort from '@renderer/views/List/MyList/useSort'
import useDarg from '@renderer/views/List/MyList/useDarg'
import useEditList from '@renderer/views/List/MyList/useEditList'
import useDuplicate from '@renderer/views/List/MyList/useDuplicate'

const EXPAND_STORAGE_KEY = 'lx__nav_group_expanded_'

export default {
  name: 'NavBar',
  components: {
    DuplicateMusicModal,
    ListSortModal,
    ListUpdateModal,
    QQMusicSyncModal,
    NeteaseMusicSyncModal,
  },
  setup() {
    const t = useI18n()
    const router = useRouter()
    // `useRoute()` is read correctly on demand, but its injected proxy does not
    // invalidate this persistent sidebar on route changes in the current build.
    // Use the router's source ref for values that must update the rendered state.
    const currentRoute = router.currentRoute

    const expandedGroups = reactive<Record<string, boolean>>({
      List: localStorage.getItem(`${EXPAND_STORAGE_KEY}List`) !== 'false',
      OnlinePlaylists: localStorage.getItem(`${EXPAND_STORAGE_KEY}OnlinePlaylists`) !== 'false',
    })
    const toggleExpand = (item: { name: string }) => {
      expandedGroups[item.name] = !expandedGroups[item.name]
      localStorage.setItem(`${EXPAND_STORAGE_KEY}${item.name}`, String(expandedGroups[item.name]))
    }

    const playlistCovers = reactive<Record<string, string>>({})
    const coverLoading = new Set<string>()
    const localPlaylistInfos = computed<LX.List.MyListInfo[]>(() => [defaultList, ...userLists])
    const loadPlaylistCover = async(listId: string) => {
      if (coverLoading.has(listId)) return
      coverLoading.add(listId)
      try {
        const firstSong = (await getListMusics(listId))[0]
        if (!firstSong) {
          playlistCovers[listId] = ''
          return
        }
        const cachedPic = firstSong.meta.picUrl
        if (cachedPic) {
          playlistCovers[listId] = cachedPic
          return
        }
        playlistCovers[listId] = await getPicPath({ musicInfo: firstSong, listId })
      } catch {
        playlistCovers[listId] = ''
      } finally {
        coverLoading.delete(listId)
      }
    }
    const loadPlaylistCovers = async(ids: string[]) => {
      await Promise.all([...new Set(ids)].map(async id => loadPlaylistCover(id)))
    }
    const handleMyListUpdate = (ids: string[]) => {
      if (!expandedGroups.List) return
      const visibleIds = new Set(localPlaylistInfos.value.map(list => list.id))
      void loadPlaylistCovers(ids.filter(id => visibleIds.has(id)))
    }
    const handleCoverError = (listId?: string) => {
      if (listId) playlistCovers[listId] = ''
    }

    watch(() => ({
      expanded: expandedGroups.List,
      ids: localPlaylistInfos.value.map(list => list.id).join('|'),
    }), ({ expanded }) => {
      if (!expanded) return
      const currentIds = localPlaylistInfos.value.map(list => list.id)
      for (const id of Object.keys(playlistCovers)) {
        if (!currentIds.includes(id)) Reflect.deleteProperty(playlistCovers, id)
      }
      void loadPlaylistCovers(currentIds)
    }, { immediate: true })

    window.app_event.on('myListUpdate', handleMyListUpdate)
    onBeforeUnmount(() => {
      window.app_event.off('myListUpdate', handleMyListUpdate)
    })

    const dom_lists_list = ref<HTMLElement | null>(null)
    const dom_listsNewInput = ref<{ focus: () => void } | null>(null)
    const rightClickItemIndex = ref(-10)
    const localListMenuTarget = ref<'group' | 'item'>('item')
    const setLocalListRef = (element: unknown) => {
      dom_lists_list.value = element instanceof HTMLElement ? element : null
    }

    const { handleImportList, handleExportList } = useShare()
    const { isShowListUpdateModal, handleUpdateSourceList } = useListUpdate()
    const { isShowListSortModal, sortListInfo, handleSortList } = useSort()
    const { isShowDuplicateMusicModal, duplicateListInfo, handleDuplicateList } = useDuplicate()
    const {
      handleRename,
      handleSaveListName,
      isShowNewList,
      handleCreateList,
    } = useEditList({ dom_lists_list })

    const focusNewListInput = () => {
      void nextTick(() => {
        // Vue may expose a component ref as an array when it is created inside
        // a transition. Resolve the last item before calling the public focus
        // method so this remains valid across Vue/compiler versions.
        const refValue = dom_listsNewInput.value
        const input = Array.isArray(refValue) ? refValue.at(-1) : refValue
        if (input instanceof HTMLElement) {
          input.focus()
          return
        }
        if (input && typeof (input as { focus?: unknown }).focus == 'function') {
          (input as { focus: () => void }).focus()
        }
      })
    }
    const startCreateList = () => {
      expandedGroups.List = true
      localStorage.setItem(`${EXPAND_STORAGE_KEY}List`, 'true')
      isShowNewList.value = true
      focusNewListInput()
    }

    const isShowQQMusicSyncModal = ref(false)
    const qqMusicSyncListInfo = ref<LX.List.MyListInfo>(defaultList)
    const handleQQMusicSync = (listInfo: LX.List.MyListInfo) => {
      qqMusicSyncListInfo.value = listInfo
      void nextTick(() => {
        isShowQQMusicSyncModal.value = true
      })
    }
    const isShowNeteaseMusicSyncModal = ref(false)
    const neteaseMusicSyncListInfo = ref<LX.List.MyListInfo>(defaultList)
    const handleNeteaseMusicSync = (listInfo: LX.List.MyListInfo) => {
      neteaseMusicSyncListInfo.value = listInfo
      void nextTick(() => {
        isShowNeteaseMusicSyncModal.value = true
      })
    }

    const handleOpenSourceDetailPage = async(listInfo: LX.List.MyListInfo) => {
      const { source, sourceListId } = listInfo as LX.List.UserListInfo
      if (!source || !sourceListId) return
      const sourceSdk = musicSdk[source] as unknown as {
        leaderboard?: {
          getDetailPageUrl?: (id: string) => string | undefined
        }
        songList?: {
          getDetailPageUrl?: (id: string) => string | Promise<string | undefined> | undefined
        }
      }
      let url
      if (sourceListId.includes('board__') && sourceSdk.leaderboard?.getDetailPageUrl) {
        const id = sourceListId.replace(/board__/, '')
        url = sourceSdk.leaderboard.getDetailPageUrl(id)
      } else if (sourceSdk.songList?.getDetailPageUrl) {
        url = await sourceSdk.songList.getDetailPageUrl(sourceListId)
      }
      if (url) void openUrl(url)
    }

    const handleRemove = (listInfo: LX.List.UserListInfo) => {
      void dialog.confirm({
        message: t('lists__remove_tip', { name: listInfo.name }),
        confirmButtonText: t('lists__remove_tip_button'),
      }).then(isRemove => {
        if (!isRemove) return
        void removeUserList([listInfo.id])
        if (currentRoute.value.query.id == listInfo.id) {
          void router.replace({
            path: '/list',
            query: { id: LIST_IDS.DEFAULT },
          })
        }
      })
    }

    const {
      menus: localListMenus,
      menuLocation: localListMenuLocation,
      isShowMenu: isShowLocalListMenu,
      showMenu: showLocalListMenu,
      menuClick: localListMenuClick,
    } = useMenu({
      emit: () => {},
      handleImportList,
      handleExportList,
      handleUpdateSourceList,
      handleQQMusicSync,
      handleNeteaseMusicSync,
      handleOpenSourceDetailPage,
      handleSortList,
      handleDuplicateList,
      handleRename,
      handleRemove,
    })

    const listGroupMenus = computed(() => [
      {
        name: t('lists__new_list_btn'),
        action: 'new_list',
        disabled: false,
      }, {
        name: t('list_update_modal__title'),
        action: 'update_lists',
        disabled: false,
      },
    ])
    const activeLocalListMenus = computed(() => localListMenuTarget.value == 'group' ? listGroupMenus.value : localListMenus.value)

    const handleGroupContextMenu = (event: MouseEvent, item: { name: string }) => {
      if (item.name != 'List') return
      event.preventDefault()
      event.stopPropagation()
      localListMenuTarget.value = 'group'
      rightClickItemIndex.value = -10
      localListMenuLocation.x = event.clientX
      localListMenuLocation.y = event.clientY
      if (isShowLocalListMenu.value) {
        isShowLocalListMenu.value = false
      }
      void nextTick(() => {
        isShowLocalListMenu.value = true
      })
    }

    const handleLocalListContextMenu = (
      event: MouseEvent,
      child: { listId?: string, menuIndex?: number },
    ) => {
      if (!child.listId || child.menuIndex == null) return
      event.preventDefault()
      event.stopPropagation()
      localListMenuTarget.value = 'item'
      rightClickItemIndex.value = child.menuIndex
      showLocalListMenu(event, child.menuIndex)
    }
    const handleLocalListMenuClick = (action?: { action: string }) => {
      if (localListMenuTarget.value == 'group') {
        isShowLocalListMenu.value = false
        if (action?.action == 'new_list') {
          void nextTick(startCreateList)
        } else if (action?.action == 'update_lists') {
          void nextTick(() => {
            isShowListUpdateModal.value = true
          })
        }
        return
      }
      const index = rightClickItemIndex.value
      if (index < -2) {
        isShowLocalListMenu.value = false
        void nextTick(() => {
          if (!isShowLocalListMenu.value) rightClickItemIndex.value = -10
        })
        return
      }
      // Finish the menu/selection patch before opening a modal or native dialog.
      // Running both updates in the same Vue flush can leave a Teleport anchor
      // without a sibling and abort the action before its handler runs.
      isShowLocalListMenu.value = false
      void nextTick(() => {
        if (!isShowLocalListMenu.value) rightClickItemIndex.value = -10
        localListMenuClick(action, index)
      })
    }

    watch(isShowLocalListMenu, (isVisible) => {
      if (!isVisible) {
        void nextTick(() => {
          if (!isShowLocalListMenu.value) rightClickItemIndex.value = -10
        })
      }
    })

    const { isModDown } = useDarg({
      dom_lists_list,
      handleSaveListName,
      handleMenuClick: () => {
        handleLocalListMenuClick()
      },
      fixedListCount: 1,
    })

    watch(() => currentRoute.value.query.id, (listId) => {
      if (typeof listId == 'string') saveListPrevSelectId(listId)
    }, { immediate: true })

    const menus = computed(() => {
      const size = 16
      const localPlaylistChildren = localPlaylistInfos.value.map((list, index) => {
        const isDefault = list.id == defaultList.id
        const userIndex = isDefault ? undefined : index - 1
        return {
          key: `local_${list.id}`,
          to: { path: '/list', query: { id: list.id } },
          tips: isDefault ? t(defaultList.name) : list.name,
          name: 'List',
          listId: list.id,
          showCover: true,
          cover: playlistCovers[list.id] ?? '',
          isDefault,
          isUser: !isDefault,
          menuIndex: isDefault ? -2 : userIndex,
          userIndex,
        }
      })
      const onlinePlaylistChildren = [
        {
          key: 'online_qq',
          to: '/qqMusic/myPlaylists',
          tips: t('online_playlists_qq'),
          name: 'QQMusicMyPlaylists',
          enable: appSetting['qqMusic.enabled'],
          showCover: false,
          listId: undefined,
          cover: '',
          isDefault: false,
          isUser: false,
          menuIndex: undefined,
          userIndex: undefined,
        }, {
          key: 'online_netease',
          to: '/neteaseMusic/myPlaylists',
          tips: t('online_playlists_netease'),
          name: 'NeteaseMusicMyPlaylists',
          enable: appSetting['neteaseMusic.enabled'],
          showCover: false,
          listId: undefined,
          cover: '',
          isDefault: false,
          isUser: false,
          menuIndex: undefined,
          userIndex: undefined,
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
          to: '',
          tips: t('my_list'),
          icon: '#icon-love',
          iconSize: '0 0 444.87 391.18',
          size,
          name: 'List',
          enable: true,
          children: localPlaylistChildren,
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
      const activeRoute = currentRoute.value
      if (activeRoute.name == 'SongListDetail') {
        const from = activeRoute.query.fromName as string | undefined
        if (from == 'QQMusicRecommend' || from == 'QQMusicMyPlaylists' || from == 'NeteaseMusicRecommend' || from == 'NeteaseMusicMyPlaylists') return name == from
      }
      return activeRoute.meta.name == name
    }
    const handleNavClick = (item: { name: string }) => {
      if (item.name == 'SongList') setVisibleListDetail(false)
    }
    const isChildActive = (child: { name: string, listId?: string }) => child.listId
      ? currentRoute.value.meta.name == 'List' && currentRoute.value.query.id == child.listId
      : isMenuActive(child.name)
    const isGroupActive = (item: { children: Array<{ name: string, listId?: string }> }) => item.children.some(isChildActive)
    return {
      appSetting,
      fetchingListStatus,
      menuGroups,
      expandedGroups,
      toggleExpand,
      playlistCovers,
      handleCoverError,
      setLocalListRef,
      dom_listsNewInput,
      rightClickItemIndex,
      isShowNewList,
      startCreateList,
      focusNewListInput,
      handleCreateList,
      handleSaveListName,
      isModDown,
      activeLocalListMenus,
      localListMenuLocation,
      isShowLocalListMenu,
      handleGroupContextMenu,
      handleLocalListContextMenu,
      handleLocalListMenuClick,
      isShowDuplicateMusicModal,
      duplicateListInfo,
      isShowListSortModal,
      sortListInfo,
      isShowListUpdateModal,
      isShowQQMusicSyncModal,
      qqMusicSyncListInfo,
      isShowNeteaseMusicSyncModal,
      neteaseMusicSyncListInfo,
      isMenuActive,
      handleNavClick,
      isChildActive,
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

  // 滚动条：平时隐藏，悬停侧边栏时显示（另由 useScrollbarHover 的 .sb-hover 类兜底）
  &:hover::-webkit-scrollbar-thumb {
    background-color: color-mix(in srgb, var(--color-500) 35%, transparent);
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(in srgb, var(--color-500) 60%, transparent);
  }
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
    margin-top: 12px;
  }
}

.groupLabel {
  padding: 8px 12px 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .8px;
  color: var(--color-500);
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

.groupRow {
  position: relative;

  .link {
    width: 100%;
  }

  // 分組按鈕（我的列表/在线歌单）选中不变色，只保留子项选中变色
  .link.active {
    color: var(--color-nav-font);
    background-color: transparent;
    font-weight: 500;

    &::before {
      display: none;
    }

    &>svg {
      opacity: .82;
    }

    &:hover {
      color: var(--color-font);
      background-color: var(--color-050);

      &>svg {
        opacity: 1;
      }
    }
  }
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
  padding: 2px 0 2px;
}

.sortable {
  .subItem {
    -webkit-user-drag: element;

    &:hover, &.clicked {
      background-color: transparent !important;
    }

    &.dragingItem {
      background-color: var(--color-primary-alpha-900) !important;
    }
  }
}

.subItem {
  position: relative;
  flex: none;

  &.clicked .subLink {
    color: var(--color-primary);
    background-color: var(--color-primary-alpha-900);
  }

  &.fetching {
    opacity: .5;
  }

  &.editing {
    .subLink {
      display: none;
    }

    .listsInput {
      display: block;
    }
  }
}

.subLink {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  height: 38px;
  margin: 0 4px 0 16px;
  padding: 0 10px 0 12px;
  gap: 8px;
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
  overflow: hidden;

  .label {
    .mixin-ellipsis-1();
  }

  &.active {
    color: var(--color-primary);
    background-color: var(--color-primary-alpha-900);
    font-weight: 600;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      bottom: 8px;
      width: 3px;
      border-radius: 0 2px 2px 0;
      background-color: var(--color-primary);
    }

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

.listsInput,
.newListInput {
  box-sizing: border-box;
  width: calc(100% - 20px);
  height: 38px;
  margin: 1px 4px 1px 16px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 12.5px;
}

.listsInput {
  display: none;
}

.newListItem {
  overflow: hidden;
}

.newListInput {
  display: block;
  color: var(--color-nav-font);
  background-color: var(--color-050);
}

.dragingItem {
  opacity: .65;
}

.subCover {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-500);
  background-color: var(--color-100);

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.link {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background-color: transparent;
  text-decoration: none;
  transition: @transition-fast;
  transition-property: background-color, color, transform;
  color: var(--color-nav-font);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  outline: none;
  overflow: hidden;

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

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      bottom: 8px;
      width: 3px;
      border-radius: 0 2px 2px 0;
      background-color: var(--color-primary);
    }

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
