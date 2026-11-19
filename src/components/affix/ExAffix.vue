<template>
  <div
    ref="affixRef"
    :class="affixClasses"
    :style="wrapperStyle"
  >
    <div
      ref="contentRef"
      :class="['ex-affix__content', { 'is-fixed': isFixed }]"
      :style="contentStyle"
    >
      <slot></slot>
    </div>
    <div
      v-if="isFixed"
      ref="spacerRef"
      aria-hidden="true"
      :style="{ width: affixStyle.width, maxWidth: '100%' }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import type { ExAffixProps, ExAffixEmits, ExAffixExposed } from './types';
import { useZIndexLayer } from '../config-provider/composables';

defineOptions({
  name: 'ExAffix',
});

const props = withDefaults(defineProps<ExAffixProps>(), {
  offsetTop: undefined,
  offsetBottom: undefined,
  target: () => window,
  zIndex: undefined,
});

const emit = defineEmits<ExAffixEmits>();
const stickyZIndex = useZIndexLayer('sticky');

const affixRef = ref<HTMLDivElement>();
const contentRef = ref<HTMLDivElement>();
const spacerRef = ref<HTMLDivElement>();
const isFixed = ref(false);
const affixStyle = ref<Record<string, string | number>>({});
const placeholderStyle = ref<{
  height?: string;
}>({});

const affixClasses = computed(() => ['ex-affix']);

const wrapperStyle = computed(() => {
  if (isFixed.value) {
    return placeholderStyle.value;
  }
  return {};
});

const contentStyle = computed(() => {
  if (isFixed.value) {
    return affixStyle.value;
  }
  return {};
});

// 滚动容器元素
let scrollContainer: HTMLElement | Window | null = null;
const listenedScrollTargets = new Set<HTMLElement | Window>();
let resizeObserver: ResizeObserver | null = null;

const getTargetRect = (target: HTMLElement | Window) => {
  if (target === window) {
    return {
      top: 0,
      bottom: window.innerHeight,
      left: 0,
      right: window.innerWidth,
    };
  }
  return (target as HTMLElement).getBoundingClientRect();
};

const measureLayout = (wrapper: HTMLElement, content: HTMLElement, remeasure: boolean) => {
  const read = () => ({
    rect: wrapper.getBoundingClientRect(),
    height: content.getBoundingClientRect().height,
  });
  const spacer = spacerRef.value;
  if (!remeasure || !spacer) return read();

  // 布局变化时让原内容短暂回到普通流，按当前父级约束测量，无需克隆插槽控件。
  const { position, width } = content.style;
  spacer.style.display = 'none';
  content.style.removeProperty('position');
  content.style.removeProperty('width');
  try {
    return read();
  } finally {
    content.style.position = position;
    content.style.width = width;
    spacer.style.removeProperty('display');
  }
};

const updatePosition = (remeasure = true) => {
  if (!affixRef.value || !contentRef.value || !scrollContainer) return;

  const { rect, height } = measureLayout(affixRef.value, contentRef.value, remeasure);
  const containerRect = getTargetRect(scrollContainer);
  const offsetTop = props.offsetTop ?? (props.offsetBottom === undefined ? 0 : undefined);
  const shouldFixTop = offsetTop !== undefined && rect.top - containerRect.top <= offsetTop;
  const shouldFixBottom =
    props.offsetBottom !== undefined && containerRect.bottom - rect.bottom <= props.offsetBottom;

  const shouldFix = shouldFixTop || shouldFixBottom;

  if (shouldFix !== isFixed.value) {
    isFixed.value = shouldFix;
    emit('change', shouldFix);
  }

  if (shouldFix) {
    placeholderStyle.value = {
      height: `${height}px`,
    };

    const styles: Record<string, string | number> = {
      position: 'fixed',
      width: `${rect.width}px`,
      zIndex: props.zIndex ?? stickyZIndex.value,
      left: `${rect.left}px`,
    };

    if (shouldFixTop) {
      // fixed 使用视口坐标，自定义容器的边界必须换算到视口。
      styles.top = `${containerRect.top + (props.offsetTop ?? 0)}px`;
    } else if (shouldFixBottom) {
      styles.bottom = `${window.innerHeight - containerRect.bottom + (props.offsetBottom ?? 0)}px`;
    }

    affixStyle.value = styles;
  } else {
    placeholderStyle.value = {};
    affixStyle.value = {};
  }
};

// 使用 requestAnimationFrame 节流，避免每个 scroll 事件都触发同步布局读取
let ticking = false;
let needsRemeasure = false;
let animationFrameId: number | null = null;
const scheduleUpdate = (remeasure: boolean) => {
  needsRemeasure ||= remeasure;
  if (ticking) return;
  ticking = true;
  animationFrameId = requestAnimationFrame(() => {
    ticking = false;
    animationFrameId = null;
    updatePosition(needsRemeasure);
    needsRemeasure = false;
  });
};

const handleScroll = () => {
  scheduleUpdate(false);
};

const handleResize = () => {
  scheduleUpdate(true);
};

const isScrollable = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
};

const getScrollAncestors = (element: HTMLElement) => {
  const ancestors: HTMLElement[] = [];
  let current = element.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollable(current)) ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
};

const observeLayout = () => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (typeof ResizeObserver === 'undefined') return;

  resizeObserver = new ResizeObserver(handleResize);
  if (affixRef.value) resizeObserver.observe(affixRef.value);
  if (affixRef.value?.parentElement) resizeObserver.observe(affixRef.value.parentElement);
  if (contentRef.value) resizeObserver.observe(contentRef.value);
  if (scrollContainer instanceof HTMLElement) resizeObserver.observe(scrollContainer);
};

const resolveScrollTarget = (): HTMLElement | Window => {
  try {
    const target = props.target();
    return target instanceof HTMLElement ? target : window;
  } catch {
    return window;
  }
};

const addListeners = (container: HTMLElement | Window) => {
  scrollContainer = container;
  const scrollTargets: Array<HTMLElement | Window> = [scrollContainer];
  if (affixRef.value) {
    scrollTargets.push(...getScrollAncestors(affixRef.value));
  }
  scrollTargets.push(window);
  scrollTargets.forEach(target => {
    if (listenedScrollTargets.has(target)) return;
    target.addEventListener('scroll', handleScroll, { passive: true });
    listenedScrollTargets.add(target);
  });

  window.addEventListener('resize', handleResize);
  observeLayout();
};

const removeListeners = () => {
  listenedScrollTargets.forEach(target => target.removeEventListener('scroll', handleScroll));
  listenedScrollTargets.clear();
  scrollContainer = null;
  window.removeEventListener('resize', handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
};

watch([() => props.offsetTop, () => props.offsetBottom, () => props.zIndex, stickyZIndex], () => {
  updatePosition();
});

onMounted(() => {
  watch(
    resolveScrollTarget,
    container => {
      removeListeners();
      addListeners(container);
      updatePosition();
    },
    { immediate: true, flush: 'sync' }
  );
});

onBeforeUnmount(() => {
  removeListeners();
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    ticking = false;
  }
});

const getElement = () => affixRef.value || null;

defineExpose<ExAffixExposed>({
  updatePosition,
  getElement,
});
</script>

<style scoped lang="scss" src="./ExAffix.scss"></style>
