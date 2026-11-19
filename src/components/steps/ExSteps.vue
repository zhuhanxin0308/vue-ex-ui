<template>
  <div
    ref="stepsRef"
    :class="stepsClasses"
    :style="stepsStyles"
    role="navigation"
    :aria-label="ariaLabel || t('navigation')"
  >
    <SlotContent><slot /></SlotContent>
  </div>
</template>

<script setup lang="ts">
import { normalizeCustomClass } from '../../composables/useCustomClass';
import { computed, getCurrentInstance, nextTick, provide, ref } from 'vue';
import type { ExStepsProps, ExStepsEmits, ExStepsExposed, StepsContext } from './types';
import { useOrderedChildren } from '../../composables/useOrderedChildren';
import { useComponentSize } from '../config-provider/composables';
import { useLocale } from '../../locale';
import { stepsContextKey, stepsHydrationKey } from './context';
import { createStepsContent, stepContentKey } from './ordered-slot';

defineOptions({
  name: 'ExSteps',
});

const props = withDefaults(defineProps<ExStepsProps>(), {
  current: 0,
  direction: 'horizontal',
  size: undefined,
  status: 'process',
  progressDot: false,
  clickable: false,
});

const emit = defineEmits<ExStepsEmits>();
const componentSize = useComponentSize(computed(() => props.size));
const { t } = useLocale('steps');

const stepsRef = ref<HTMLDivElement>();
const element = getCurrentInstance()?.vnode.el;
let hydrationRoot =
  typeof HTMLElement !== 'undefined' && element instanceof HTMLElement ? element : null;
const hydrating = ref(Boolean(hydrationRoot));
const localSteps = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('.ex-step')).filter(
    step => step.closest('.ex-steps') === root
  );
const initialLocalCount = hydrationRoot ? localSteps(hydrationRoot).length : 0;
let initialCount = 0;
provide(stepsHydrationKey, hydrating);

// 异步分支水合之前，已有 DOM 仍是首屏的完整顺序。所有子项就绪后释放快照。
const syncHydration = () => {
  if (!hydrationRoot) return;
  const mounted = new Set(
    order.children.map(step => step.getElement()).filter(step => step !== null)
  );
  // 容器可能只含尚未水合的传送步骤，首个挂载项才能提供服务端总数。
  if (mounted.size === 0 && initialCount === 0) return;
  const mountedOutside = [...mounted].filter(step => !hydrationRoot?.contains(step)).length;
  const local = localSteps(hydrationRoot);
  // 本地条件分支可能在异步子项就绪前已被移除；外部传送的步骤则由总数单独核对。
  if (
    mountedOutside >= initialCount - initialLocalCount &&
    local.every(step => mounted.has(step))
  ) {
    hydrationRoot = null;
    hydrating.value = false;
  }
};
const order = useOrderedChildren<{
  uid: symbol;
  getElement: () => HTMLElement | null;
  isDisabled?: () => boolean;
}>(stepsRef, syncHydration);
const { SlotContent, stepContent } = createStepsContent(uids => {
  const indices = new Map(uids.map((uid, index) => [uid, index]));
  order.children.sort(
    (left, right) =>
      (indices.get(left.uid) ?? uids.length) - (indices.get(right.uid) ?? uids.length)
  );
});
provide(stepContentKey, stepContent);

// 计算属性
const stepsClasses = computed(() => {
  const classes = ['ex-steps'];

  classes.push(`ex-steps--${props.direction}`);
  classes.push(`ex-steps--${componentSize.value}`);

  if (props.progressDot) {
    classes.push('ex-steps--progress-dot');
  }

  if (props.clickable) {
    classes.push('ex-steps--clickable');
  }

  classes.push(...normalizeCustomClass(props.class));

  return classes;
});

const stepsStyles = computed(() => {
  if (!props.style) return undefined;
  if (typeof props.style === 'string') return props.style;
  return props.style;
});

// 步骤点击事件
const onStepClick = (index: number, childOverride = false) => {
  if (props.clickable || childOverride) {
    emit('change', index);
  }
};

// 提供给子组件的上下文
const stepsContext: StepsContext = {
  current: computed(() => props.current),
  status: computed(() => props.status),
  direction: computed(() => props.direction),
  size: componentSize,
  progressDot: computed(() => props.progressDot),
  clickable: computed(() => props.clickable),
  stepCount: computed(() => order.children.length),
  registerStep: (uid, getElement, isDisabled) => {
    order.register({ uid, getElement, isDisabled });
    if (hydrationRoot) {
      initialCount = Math.max(initialCount, Number(getElement()?.dataset.exStepCount) || 0);
      void nextTick(order.sync);
    }
  },
  unregisterStep: order.unregister,
  getStepIndex: order.indexOf,
  onStepClick,
};

provide(stepsContextKey, stepsContext);

// 暴露的方法
const getElement = () => stepsRef.value || null;

const goTo = (index: number) => {
  const child = order.children[index];
  if (Number.isInteger(index) && child && !child.isDisabled?.()) {
    emit('change', index);
  }
};

const move = (direction: 1 | -1) => {
  if (!Number.isInteger(props.current) || !order.children[props.current]) return;
  for (let index = props.current + direction; order.children[index]; index += direction) {
    if (!order.children[index]!.isDisabled?.()) {
      emit('change', index);
      return;
    }
  }
};

defineExpose<ExStepsExposed>({
  getElement,
  goTo,
  next: () => move(1),
  prev: () => move(-1),
});
</script>

<style scoped lang="scss" src="./ExSteps.scss"></style>
