<template>
  <ul :class="[$style.list, $style[align]]" role="tablist">
    <li
      v-for="item in list"
      :key="item[itemKey]" :class="[$style.listItem, {[$style.active]: modelValue == item[itemKey]}]" tabindex="-1" role="tab"
      :aria-label="item[itemLabel]" ignore-tip :aria-selected="modelValue == item[itemKey]" @click="handleToggle(item[itemKey])"
    >
      <span :class="$style.label">{{ item[itemLabel] }}</span>
    </li>
  </ul>
</template>

<script>

export default {
  props: {
    list: {
      type: Array,
      default() {
        return []
      },
    },
    align: {
      type: String,
      default: 'left',
    },
    itemKey: {
      type: String,
      default: 'id',
    },
    itemLabel: {
      type: String,
      default: 'label',
    },
    modelValue: {
      type: [String, Number],
      default: '',
    },
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    const handleToggle = id => {
      if (id == props.modelValue) return
      emit('update:modelValue', id)
      emit('change', id)
    }

    return {
      handleToggle,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.list {
  display: flex;
  flex-flow: row nowrap;
  font-size: 13px;
  gap: 22px;
  padding: 0 15px;

  &.left {
    justify-content: flex-start;
  }
  &.center {
    justify-content: center;
  }
  &.right {
    justify-content: flex-end;
  }
}
.listItem {
  display: block;
  // padding: 5px 15px;
  cursor: pointer;
  color: var(--color-600);
  font-weight: 500;
  transition: color @transition-normal;


  &:hover {
    color: var(--color-primary);
  }


  &.active {
    color: var(--color-primary);
    font-weight: 600;
    cursor: default;

    >.label {
      &:after {
        // background-color: var(--color-primary);
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  }
}

.label {
  display: block;
  position: relative;
  padding: 9px 1px;
  &:after {
    .mixin-after();
    left: 50%;
    bottom: 2px;
    width: 100%;
    height: 2.5px;
    border-radius: 20px;
    background-color: transparent;
    transform: translateX(-50%) translateY(-4px);
    opacity: 0;
    background-color: var(--color-primary);
    box-shadow: 0 1px 4px var(--color-primary-alpha-500);
    transition: @transition-fast;
    transition-property: transform, opacity;
  }
}
</style>
