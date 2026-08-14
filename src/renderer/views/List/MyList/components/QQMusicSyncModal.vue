<template>
  <material-modal
    :show="visible" teleport="#view" width="560px" max-width="86%" max-height="82%"
    :bg-close="!busy" :close-btn="!busy" @close="closeModal"
  >
    <main class="scroll" :class="$style.main">
      <header :class="$style.header">
        <h2>{{ $t('qq_music_sync_title') }}</h2>
        <p>{{ listName }}</p>
      </header>

      <section :class="$style.content">
        <p v-if="status == 'loading'" :class="$style.status">{{ $t('qq_music_sync_matching') }}</p>
        <p v-else-if="status == 'syncing'" :class="$style.status">{{ $t('qq_music_sync_writing') }}</p>
        <p v-else-if="status == 'notConfigured'" :class="$style.status">{{ $t('qq_music_sync_login_required') }}</p>
        <p v-else-if="status == 'empty'" :class="$style.status">{{ $t('qq_music_sync_empty') }}</p>

        <template v-if="preview">
          <dl :class="$style.summary">
            <div>
              <dt>{{ $t('qq_music_sync_total') }}</dt>
              <dd>{{ preview.total }}</dd>
            </div>
            <div>
              <dt>{{ $t('qq_music_sync_matched') }}</dt>
              <dd>{{ preview.matched }}</dd>
            </div>
            <div>
              <dt>{{ $t('qq_music_sync_unmatched') }}</dt>
              <dd>{{ preview.unmatched.length }}</dd>
            </div>
            <div>
              <dt>{{ $t('qq_music_sync_duplicates') }}</dt>
              <dd>{{ preview.duplicates }}</dd>
            </div>
          </dl>

          <div v-if="preview.unmatched.length" :class="$style.unmatched">
            <h3>{{ $t('qq_music_sync_unmatched_title') }}</h3>
            <ul class="scroll">
              <li v-for="item in preview.unmatched" :key="item.id">
                <span>{{ item.name }}</span>
                <small>{{ item.singer }}</small>
              </li>
            </ul>
          </div>

          <p v-if="status == 'preview'" :class="$style.note">{{ $t('qq_music_sync_create_note') }}</p>
          <p v-if="status == 'success' && result" :class="[$style.result, $style.success]">
            {{ $t('qq_music_sync_success', { name: result.name, count: result.added }) }}
          </p>
        </template>

        <p v-if="status == 'error'" :class="[$style.result, $style.error]">
          {{ $t('qq_music_sync_failed') }}<br>
          <small>{{ errorMessage }}</small>
        </p>
      </section>

      <footer :class="$style.footer">
        <base-btn v-if="status == 'notConfigured'" :class="$style.btn" @click="openSettings">
          {{ $t('qq_music_configure') }}
        </base-btn>
        <base-btn v-if="status == 'error'" :class="$style.btn" @click="retry">
          {{ $t('qq_music_retry') }}
        </base-btn>
        <base-btn v-if="status == 'preview'" :class="$style.btn" :disabled="!preview || !preview.matched" @click="commitSync">
          {{ $t('qq_music_sync_confirm') }}
        </base-btn>
        <base-btn :class="$style.btn" :disabled="busy" @click="closeModal">
          {{ status == 'success' ? $t('btn_close') : $t('btn_cancel') }}
        </base-btn>
      </footer>
    </main>
  </material-modal>
</template>

<script>
import { computed, ref, watch } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { LIST_IDS } from '@common/constants'
import { useI18n } from '@renderer/plugins/i18n'
import { getListMusics } from '@renderer/store/list/action'
import {
  commitQQMusicPlaylistSync,
  getQQMusicStatus,
  previewQQMusicPlaylistSync,
} from '@renderer/utils/ipc'

export default {
  name: 'QQMusicSyncModal',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    listInfo: {
      type: Object,
      required: true,
    },
  },
  emits: ['update:visible'],
  setup(props, { emit }) {
    const router = useRouter()
    const t = useI18n()
    const status = ref('idle')
    const preview = ref(null)
    const result = ref(null)
    const errorMessage = ref('')
    const errorStage = ref('preview')
    let loadId = 0

    const listName = computed(() => {
      if (props.listInfo.id == LIST_IDS.DEFAULT || props.listInfo.id == LIST_IDS.LOVE) return t(props.listInfo.name)
      return props.listInfo.name
    })
    const busy = computed(() => status.value == 'loading' || status.value == 'syncing')

    const closeModal = () => {
      if (busy.value) return
      loadId++
      emit('update:visible', false)
    }

    const toSyncTrack = musicInfo => ({
      id: musicInfo.id,
      source: musicInfo.source,
      name: musicInfo.name,
      singer: musicInfo.singer,
      albumName: musicInfo.meta?.albumName ?? '',
      interval: musicInfo.interval,
      qqSongMid: musicInfo.source == 'tx' ? String(musicInfo.meta?.songId ?? '') : undefined,
      qqSongId: musicInfo.source == 'tx' ? musicInfo.meta?.id : undefined,
    })

    const loadPreview = async() => {
      const currentLoadId = ++loadId
      status.value = 'loading'
      preview.value = null
      result.value = null
      errorMessage.value = ''
      errorStage.value = 'preview'
      try {
        const qqMusicStatus = await getQQMusicStatus()
        if (currentLoadId != loadId) return
        if (!qqMusicStatus.configured) {
          status.value = 'notConfigured'
          return
        }
        const tracks = await getListMusics(props.listInfo.id)
        if (currentLoadId != loadId) return
        if (!tracks.length) {
          status.value = 'empty'
          return
        }
        const nextPreview = await previewQQMusicPlaylistSync({
          name: listName.value,
          tracks: tracks.map(toSyncTrack),
        })
        if (currentLoadId != loadId) return
        preview.value = nextPreview
        status.value = 'preview'
      } catch (error) {
        if (currentLoadId != loadId) return
        errorMessage.value = error instanceof Error ? error.message : String(error)
        status.value = 'error'
      }
    }

    const commitSync = async() => {
      if (!preview.value?.token || !preview.value.matched) return
      status.value = 'syncing'
      errorMessage.value = ''
      errorStage.value = 'commit'
      try {
        result.value = await commitQQMusicPlaylistSync({ token: preview.value.token })
        status.value = 'success'
      } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error)
        status.value = 'error'
      }
    }

    const retry = () => {
      if (errorStage.value == 'commit' && preview.value?.token) void commitSync()
      else void loadPreview()
    }

    const openSettings = () => {
      closeModal()
      void router.push({ path: '/setting', query: { name: 'SettingQQMusic' } })
    }

    watch(() => props.visible, visible => {
      if (visible) void loadPreview()
      else loadId++
    })

    return {
      status,
      preview,
      result,
      errorMessage,
      listName,
      busy,
      closeModal,
      commitSync,
      retry,
      openSettings,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  width: 100%;
  min-height: 300px;
  display: flex;
  flex-flow: column nowrap;
}
.header {
  flex: none;
  padding: 8px 20px 14px;
  border-bottom: 1px solid var(--color-primary-light-300-alpha-300);
  h2 {
    font-size: 18px;
    color: var(--color-font);
  }
  p {
    margin-top: 4px;
    font-size: 13px;
    color: var(--color-font-label);
    word-break: break-all;
  }
}
.content {
  flex: auto;
  min-height: 190px;
  padding: 18px 20px;
}
.status {
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-font-label);
}
.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--color-primary-light-300-alpha-300);
  padding-bottom: 16px;
  div {
    min-width: 0;
    text-align: center;
    border-right: 1px solid var(--color-primary-light-300-alpha-300);
    &:last-child { border-right: 0; }
  }
  dt {
    font-size: 12px;
    color: var(--color-font-label);
  }
  dd {
    margin-top: 5px;
    font-size: 20px;
    color: var(--color-font);
  }
}
.unmatched {
  margin-top: 16px;
  h3 {
    font-size: 13px;
    color: var(--color-font-label);
    margin-bottom: 8px;
  }
  ul {
    max-height: 150px;
    overflow-y: auto;
  }
  li {
    min-height: 30px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--color-primary-light-200-alpha-200);
    span {
      flex: auto;
      min-width: 0;
      .mixin-ellipsis-1();
    }
    small {
      flex: none;
      max-width: 42%;
      color: var(--color-font-label);
      .mixin-ellipsis-1();
    }
  }
}
.note, .result {
  margin-top: 16px;
  line-height: 1.6;
  color: var(--color-font-label);
}
.success { color: var(--color-primary); }
.error {
  color: var(--color-danger, #c84b4b);
  small {
    color: var(--color-font-label);
    word-break: break-word;
  }
}
.footer {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--color-primary-light-300-alpha-300);
}
.btn { min-width: 82px; }

@media (max-width: 620px) {
  .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary div:nth-child(2) { border-right: 0; }
  .summary div:nth-child(-n + 2) { margin-bottom: 12px; }
}
</style>
