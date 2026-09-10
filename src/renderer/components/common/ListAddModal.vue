<template>
  <material-modal :show="show" :bg-close="bgClose" :teleport="teleport" max-width="70%" min-width="200px" @close="handleClose">
    <main :class="$style.main">
      <h2>{{ $t('list_add__' + (isMove ? 'title_first_move' : 'title_first_add')) }}&nbsp;<span :class="$style.name">{{ currentMusicInfo.name }}</span>&nbsp;{{ $t('list_add__title_last') }}</h2>
      <div class="scroll" :class="$style.btnContent">
        <button
          v-for="(item, index) in lists" :key="item.id" type="button"
          :class="[$style.card, { [$style.exist]: item.isExist }]"
          :aria-label="$t('list_add__btn_title', { name: item.name })"
          :disabled="item.isExist"
          @click="handleClick(index)"
        >
          <span :class="$style.cover">
            <img v-if="item.cover" :src="item.cover" loading="lazy" decoding="async" alt="">
            <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 425.2 425.2" space="preserve">
              <use xlink:href="#icon-album" />
            </svg>
            <span v-if="item.isExist" :class="$style.check">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve">
                <use xlink:href="#icon-check-true" />
              </svg>
            </span>
          </span>
          <span :class="$style.cardName">{{ item.name }}</span>
          <span v-if="item.isExist" :class="$style.existTip">{{ $t('list_add__already') }}</span>
        </button>
        <button :class="[$style.card, $style.newList, isEditing ? $style.editing : null]" type="button" :aria-label="$t('lists__new_list_btn')" @click="handleEditing($event)">
          <span :class="$style.cover">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 42 42" space="preserve">
              <use xlink:href="#icon-addTo" />
            </svg>
          </span>
          <span :class="$style.cardName">{{ $t('lists__new_list_btn') }}</span>
          <base-input :class="$style.newListInput" :value="newListName" :placeholder="$t('lists__new_list_input')" @keyup.enter="handleSaveList($event)" @blur="handleSaveList($event)" />
        </button>
        <span v-for="i in spaceNum" :key="i" :class="$style.card" />
      </div>
    </main>
  </material-modal>
</template>

<script>
import { watch, ref, onBeforeUnmount } from '@common/utils/vueTools'
import { defaultList, userLists } from '@renderer/store/list/state'
import { addListMusics, moveListMusics, createUserList, getMusicExistListIds, getListMusics } from '@renderer/store/list/action'
import useKeyDown from '@renderer/utils/compositions/useKeyDown'
import { useI18n } from '@root/lang'
import { dialog } from '@renderer/plugins/Dialog'

export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    musicInfo: {
      type: [Object, null],
      required: true,
    },
    bgClose: {
      type: Boolean,
      default: true,
    },
    excludeListId: {
      type: Array,
      default() {
        return []
      },
    },
    fromListId: {
      type: String,
      default: null,
    },
    isMove: {
      type: Boolean,
      default: false,
    },
    teleport: {
      type: String,
      default: '#root',
    },
  },
  emits: ['update:show'],
  setup(props) {
    const keyModDown = useKeyDown('mod')
    const t = useI18n()
    const lists = ref([])

    const currentMusicInfo = ref({})

    const loadCovers = (targetLists) => {
      void Promise.all(targetLists.map(async(list) => {
        try {
          const firstSong = (await getListMusics(list.id))[0]
          list.cover = firstSong?.meta?.picUrl || ''
        } catch {
          list.cover = ''
        }
      }))
    }

    const checkMusicExist = (musicInfo) => {
      const mid = musicInfo.id
      void getMusicExistListIds(mid).then(ids => {
        if (mid != musicInfo.id) return
        for (const list of lists.value) {
          if (ids.includes(list.id)) list.isExist = true
        }
      })
    }

    let stopWatchUserList = null

    const getList = () => {
      lists.value = [
        { ...defaultList, name: t(defaultList.name) },
        ...userLists,
      ].filter(l => !props.excludeListId.includes(l.id)).map(l => ({ ...l, isExist: false, cover: '' }))
      checkMusicExist(currentMusicInfo.value)
      loadCovers(lists.value)
    }

    watch(() => props.show, show => {
      if (!show) {
        if (stopWatchUserList) {
          stopWatchUserList()
          stopWatchUserList = null
        }
        return
      }
      if (!props.musicInfo) return lists.value = []

      currentMusicInfo.value = 'progress' in props.musicInfo ? props.musicInfo.metadata.musicInfo : props.musicInfo

      getList()

      stopWatchUserList = watch(userLists, getList)
    })

    onBeforeUnmount(() => {
      if (stopWatchUserList) {
        stopWatchUserList()
        stopWatchUserList = null
      }
    })

    return {
      keyModDown,
      lists,
      checkMusicExist,
      currentMusicInfo,
    }
  },
  data() {
    return {
      isEditing: false,
      newListName: '',
      rowNum: 3,
    }
  },
  computed: {
    spaceNum() {
      return this.lists.length < 2 ? 0 : (this.rowNum - this.lists.length % this.rowNum - 1)
    },
  },
  mounted() {
    window.addEventListener('resize', this.handleResize)
    this.handleResize()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
  },
  methods: {
    handleResize() {
      const width = window.innerWidth
      this.rowNum = width < 1920
        ? 3
        : width < 2560
          ? 4
          : width < 3840 ? 5 : 6
    },
    handleClick(index) {
      if (this.isMove) void moveListMusics(this.fromListId, this.lists[index].id, [this.currentMusicInfo])
      else void addListMusics(this.lists[index].id, [this.currentMusicInfo])

      this.lists[index].isExist = true
      if (this.keyModDown && !this.isMove) return
      this.$nextTick(() => {
        this.handleClose()
      })
    },
    handleClose() {
      this.$emit('update:show', false)
    },
    handleEditing(event) {
      if (this.isEditing) return
      this.isEditing = true
      this.$nextTick(() => event.currentTarget.querySelector('.' + this.$style.newListInput).focus())
    },
    async handleSaveList(event) {
      let name = event.target.value
      this.newListName = event.target.value = ''
      this.isEditing = false
      if (!name || (
        userLists.some(l => l.name == name) && !(await dialog.confirm(window.i18n.t('list_duplicate_tip'))))
      ) return
      void createUserList({ name })
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  min-height: 0;
  h2 {
    font-size: 13px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
    padding: 15px;
  }
}

.name {
  color: var(--color-primary);
}

.btnContent {
  flex: auto;
  max-height: 100%;
  padding: 0 15px 8px;
  display: flex;
  flex-flow: row wrap;
  justify-content: space-evenly;
}

@item-width: (100% / 3);
.card {
  position: relative;
  box-sizing: border-box;
  margin-left: 15px;
  margin-bottom: 15px;
  width: calc(@item-width - 15px);
  min-width: 160px;
  min-height: 64px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background-color: var(--color-050);
  color: var(--color-font);
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
  outline: none;
  transition: background-color @transition-fast, transform @transition-fast, opacity @transition-fast;

  &:hover:not(:disabled):not(:empty) {
    background-color: var(--color-100);
  }
  &:active:not(:disabled):not(:empty) {
    transform: scale(.98);
  }
  &:empty {
    background-color: transparent;
    min-height: 0;
    padding: 0;
    pointer-events: none;
  }
}

.cover {
  position: relative;
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-500);
  background-color: var(--color-100);

  img, svg {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
  }
}

.check {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 10px;
    height: 10px;
    fill: currentColor;
  }
}

.cardName {
  flex: auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  .mixin-ellipsis-1();
}

.exist {
  opacity: .55;
  cursor: default;

  .cardName {
    font-weight: 500;
  }
}

.existTip {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 11px;
  color: var(--color-font-label);
}

.newList {
  border: 1px dashed var(--color-primary-alpha-800);
  background-color: transparent;
  color: var(--color-primary);

  .cover {
    background-color: var(--color-primary-alpha-900);
    color: var(--color-primary);
  }

  &.editing {
    .cover,
    .cardName {
      display: none;
    }
    .newListInput {
      display: block;
    }
  }
}
.newListInput {
  display: none;
  width: 100%;
  height: 36px;
  line-height: 36px;
  background: none !important;
  font-size: 14px;
  text-align: center;
  font-family: inherit;
  box-sizing: border-box;
  padding: 0 10px;
  border-radius: 8px;
}

@item-width2: (100% / 4);
@media (min-width: 1920px){
  .card {
    width: calc(@item-width2 - 15px);
  }
}
@item-width3: (100% / 5);
@media (min-width: 2560px){
  .card {
    width: calc(@item-width3 - 15px);
  }
}
@item-width4: (100% / 6);
@media (min-width: 3840px){
  .card {
    width: calc(@item-width4 - 15px);
  }
}

</style>
