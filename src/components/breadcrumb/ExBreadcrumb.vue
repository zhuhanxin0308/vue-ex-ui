<template>
  <nav
    class="ex-breadcrumb"
    :class="[`ex-breadcrumb--${componentSize}`, { 'ex-breadcrumb--clickable': clickable }]"
    role="navigation"
    :aria-label="t('breadcrumb.ariaLabel')"
  >
    <ol class="ex-breadcrumb__list">
      <template
        v-for="entry in visibleItems"
        :key="entry.node.key ?? entry.index"
      >
        <li
          v-if="entry.ellipsis"
          class="ex-breadcrumb__item ex-breadcrumb__ellipsis"
        >
          <span class="ex-breadcrumb__text">...</span>
          <span
            v-if="separator || $slots.separator"
            class="ex-breadcrumb__separator"
            aria-hidden="true"
          >
            <slot name="separator">{{ separator }}</slot>
          </span>
        </li>
        <component :is="entry.node" />
      </template>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import { computed, createVNode, h, useSlots } from 'vue';
import { useRenderComputed } from '../../composables/useRenderComputed';
import { useSlotItems } from '../../composables/useSlotItems';
import { useComponentSize } from '../config-provider/composables';
import type { BreadcrumbProps, BreadcrumbEmits, BreadcrumbItem } from './types';
import ExBreadcrumbItem from './ExBreadcrumbItem.vue';
import { useI18n } from '../../locale';

defineOptions({ name: 'ExBreadcrumb' });

const props = withDefaults(defineProps<BreadcrumbProps>(), {
  items: () => [],
  separator: '/',
  clickable: true,
});

const emit = defineEmits<BreadcrumbEmits>();
const componentSize = useComponentSize(computed(() => props.size));
const { t } = useI18n();
const slots = useSlots();
const { items: declaredItems } = useSlotItems('ExBreadcrumbItem');

const maxVisibleItems = computed(() => {
  if (props.maxItems === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(props.maxItems)) return 2;
  return Math.max(2, Math.trunc(props.maxItems));
});

const visibleItems = useRenderComputed(() => {
  // 声明式子项与数据项共用折叠、索引、当前页及点击语义。
  const declared = declaredItems.value;
  const total = declared.length || props.items?.length || 0;
  const visible = Math.min(maxVisibleItems.value, total);
  const hiddenCount = total - visible;
  return Array.from({ length: visible }, (_, position) => {
    const index = position === 0 ? 0 : position + hiddenCount;
    const node = declared[index] ?? h(ExBreadcrumbItem, { item: props.items[index] });
    const children = node.children;
    const childSlots =
      typeof children === 'string' || Array.isArray(children)
        ? { default: () => children }
        : children;
    const inheritedSlots = {
      ...(slots.icon && { icon: slots.icon }),
      ...(slots.separator && { separator: slots.separator }),
      ...childSlots,
    };
    return {
      index,
      ellipsis: position === 1 && hiddenCount > 0,
      node: createVNode(
        node,
        {
          index,
          isLast: index === total - 1,
          separator: node.props?.separator ?? props.separator,
          size: node.props?.size ?? componentSize.value,
          clickable: props.clickable && node.props?.clickable !== false,
          onClick: (item: BreadcrumbItem, event: MouseEvent) => emit('click', item, index, event),
        },
        inheritedSlots
      ),
    };
  });
});
</script>

<style scoped lang="scss" src="./ExBreadcrumb.scss"></style>
