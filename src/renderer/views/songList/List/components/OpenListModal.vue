<template>
  <material-modal :show="props.modelValue" teleport="#view" width="60%" @close="emit('update:model-value', $event)" @after-enter="$refs.input.focus()">
    <main class="scroll" :class="$style.main">
      <h2>{{ $t('songlist__import_input_title') }}</h2>
      <div :class="$style.inputContent">
        <base-selection v-model="source" :class="$style.select" :list="importSources" item-key="id" item-name="name" />
        <base-input
          ref="input"
          v-model.trim="text"
          :class="$style.input"
          :placeholder="$t('songlist__import_input_tip')"
          @submit="handleSubmit"
        />
      </div>
      <p v-if="errorText" role="alert" :class="$style.error">{{ errorText }}</p>
      <div :class="$style.footer">
        <div :class="$style.tips">
          <ul>
            <li>{{ $t('bilibili__import_tip') }}</li>
            <li>{{ $t('songlist__import_input_tip_1') }}</li>
            <li>{{ $t('songlist__import_input_tip_2') }}</li>
            <li>{{ $t('songlist__import_input_tip_3') }}</li>
            <li>
              {{ $t('songlist__import_input_tip_4') }}
              <span
                class="hover underline"
                aria-label="https://lyswhut.github.io/lx-music-doc/desktop/faq/cannot-open-songlist"
                @click="openUrl('https://lyswhut.github.io/lx-music-doc/desktop/faq/cannot-open-songlist')"
              >FAQ</span>
            </li>
          </ul>
        </div>
        <base-btn :class="$style.btn" :disabled="isLoading" @click="handleSubmit">{{ $t(isLoading ? 'list__loading' : 'songlist__import_input_btn_confirm') }}</base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script setup>
import { openSongListInputInfo } from '@renderer/store/songList/state'
import { setOpenSongListInputInfo } from '@renderer/store/songList/action'
import { computed, ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { openUrl } from '@common/utils/electron'
import { isBilibiliListInput, resolveBilibiliListId } from '@renderer/utils/musicSdk/bili/utils'

const props = defineProps({
  modelValue: Boolean,
  defaultSource: {
    type: String,
    default: '',
  },
  sourceList: {
    type: Array,
    required: true,
  },
})

const emit = defineEmits(['update:model-value'])

const router = useRouter()
const route = useRoute()
const text = ref('')
const source = ref('')
const errorText = ref('')
const isLoading = ref(false)
const importSources = computed(() => props.sourceList.some(source => source.id == 'bili')
  ? props.sourceList
  : [...props.sourceList, { id: 'bili', name: window.i18n.t('source_bili') }])

watch(() => props.modelValue, (visible) => {
  if (!visible) return
  errorText.value = ''
  source.value = props.defaultSource || openSongListInputInfo.source || route.query.source
  // text.value = openSongListInputInfo.text
})

const handleSubmit = async() => {
  if (!text.value.length || isLoading.value) return
  isLoading.value = true
  errorText.value = ''
  const input = text.value
  try {
    const targetSource = isBilibiliListInput(input) ? 'bili' : source.value
    const id = targetSource == 'bili' ? await resolveBilibiliListId(input) : input
    if (!props.modelValue) return
    setOpenSongListInputInfo(input, targetSource)
    await router.push({
      path: '/songList/detail',
      query: { source: targetSource, id, refresh: 'true', fromName: route.name ? String(route.name) : undefined },
    })
    emit('update:model-value', false)
  } catch (error) {
    errorText.value = window.i18n.t(/^bilibili__error_/.test(error.message) ? error.message : 'bilibili__error_request')
  } finally {
    isLoading.value = false
  }
}

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 0 15px;
  // max-width: 530px;
  // min-width: 300px;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  h2 {
    font-size: 14px;
    color: var(--color-font);
    line-height: 1.3;
    word-break: break-all;
    // text-align: center;
    padding: 15px 0 8px;
  }
}
.inputContent {
  display: flex;
  flex-flow: row nowrap;
}
.error {
  padding-top: 10px;
  color: var(--color-font);
  font-size: 12px;
}
.select {
  width: auto;
  :global {
    .label-content {
      height: 100%;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    .selection-list {
      li {
        // background-color: var(--color-main-background);
        text-align: center;
        line-height: 32px;
        font-size: 13px;
        &:hover {
          background-color: var(--color-button-background-hover);
        }
        &:active {
          background-color: var(--color-button-background-active);
        }
      }
    }
  }
}
.input {
  flex: auto;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  // width: 100%;
  // height: 26px;
  padding: 8px 8px;
  color: var(--color-font);
}
.footer {
  margin: 50px 0 15px;
  display: flex;
  flex-flow: row nowrap;
  align-items: flex-end;
}

.tips {
  flex: auto;
  font-size: 12px;
  color: var(--color-font);
  line-height: 1.5;
  ul {
    list-style: decimal;
    padding-left: 15px;
  }
}

.btn {
  // box-sizing: border-box;
  // margin-left: 15px;
  // margin-bottom: 15px;
  // height: 36px;
  // line-height: 36px;
  // padding: 0 10px !important;
  min-width: 80px;
  // .mixin-ellipsis-1();
}


</style>
