<template>
  <div
    ref="stepsRef"
    :class="stepsClasses"
    :style="stepsStyles"
    role="navigation"
    :aria-label="ariaLabel || t('navigation')"
  >
    <SlotContent />
  </div>
</template>

<script setup lang="ts">
import { normalizeCustomClass } from '../../composables/useCustomClass';
import { computed, provide, ref } from 'vue';
import type { ExStepsProps, ExStepsEmits, ExStepsExposed, StepsContext } from './types';
import { useSlotItems } from '../../composables/useSlotItems';
import { useOrderedChildren } from '../../composables/useOrderedChildren';
import { useComponentSize } from '../config-provider/composables';
import { useLocale } from '../../locale';
import { stepsContextKey } from './context';

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
const { items: slotItems, SlotContent } = useSlotItems('ExStep');
const order = useOrderedChildren<{
  uid: symbol;
  getElement: () => HTMLElement | null;
  isDisabled?: () => boolean;
}>(stepsRef);

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
  stepCount: computed(() => Math.max(slotItems.value.length, order.children.length)),
  registerStep: (uid, getElement, isDisabled) => order.register({ uid, getElement, isDisabled }),
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
