<template>
  <div :class="$style.container">
    <div v-show="!props.listInfo.noItemLabel" ref="dom_list_ref" :class="$style.listContent" class="scroll">
      <ul>
        <li v-for="item in props.listInfo.list" :key="item.id" :class="$style.item" @click="toDetail(item)">
          <div :class="$style.image">
            <img :class="$style.img" loading="lazy" decoding="async" :src="item.img">
            <div v-if="item.play_count != null" :class="$style.playCount">
              <svg-icon name="headphones" />
              <span>{{ item.play_count }}</span>
            </div>
          </div>
          <h4 :class="$style.title">{{ item.name }}</h4>
          <p :class="$style.meta">
            <span v-if="item.author">{{ item.author }}</span>
            <span v-if="item.time">{{ item.time }}</span>
            <span v-if="visibleSource">{{ item.source }}</span>
          </p>
        </li>
      </ul>
      <div :class="$style.pagination">
        <material-pagination :count="props.listInfo.total" :limit="props.listInfo.limit" :page="props.listInfo.page" @btn-click="togglePage" />
      </div>
    </div>
    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <div v-show="props.listInfo.noItemLabel" :class="$style.noitem">
        <p v-text="props.listInfo.noItemLabel" />
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from '@common/utils/vueTools'
import type { ListInfo, ListInfoItem } from '@renderer/store/songList/state'
import { useRoute, useRouter } from '@common/utils/vueRouter'


const props = withDefaults(defineProps<{
  listInfo: ListInfo
  visibleSource?: boolean
}>(), {
  visibleSource: false,
})

const router = useRouter()
const route = useRoute()

const dom_list_ref = ref<HTMLElement | null>(null)

const emit = defineEmits(['toggle-page'])


const togglePage = (page: number) => {
  emit('toggle-page', page)
}

const toDetail = (info: ListInfoItem) => {
  void router.push({
    path: '/songList/detail',
    query: {
      source: info.source,
      id: info.id,
      picUrl: info.img,
      fromName: route.name as string,
    },
  })
}

defineExpose({
  scrollTo(top: number) {
    dom_list_ref.value?.scrollTo({
      top,
      // behavior: 'smooth',
    })
  },
  getScrollTop() {
    return dom_list_ref.value?.scrollTop ?? 0
  },
})


</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.container {
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  position: relative;
}

.listContent {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  font-size: 14px;
  box-sizing: border-box;
  padding: 18px 20px 0;

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 24px 20px;
  }
}
.item {
  min-width: 0;
  cursor: pointer;
}
.image {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  overflow: hidden;
  background-color: var(--color-100);
  box-shadow: var(--shadow-card);
  transition: transform @transition-normal, box-shadow @transition-normal;
}
.img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform @transition-normal;
}
.playCount {
  position: absolute;
  right: 7px;
  bottom: 7px;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: @radius-round;
  background: rgba(28, 28, 30, .55);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;

  svg {
    width: 10px;
    height: 10px;
  }
}
.title {
  margin-top: 9px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  text-align: justify;
  color: var(--color-font);
  transition: color @transition-fast;
  .mixin-ellipsis-2();
}
.meta {
  margin-top: 4px;
  display: flex;
  flex-flow: row nowrap;
  gap: 6px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
}
.item:hover {
  .image {
    transform: translateY(-4px);
    box-shadow: var(--shadow-card-hover);
  }
  .img {
    transform: scale(1.05);
  }
  .title {
    color: var(--color-primary);
  }
}
.pagination {
  text-align: center;
  padding: 20px 0;
}
.noitem {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;

  p {
    font-size: 24px;
    color: var(--color-font-label);
  }
}

</style>
