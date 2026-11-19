<template>
  <StepContent v-slot="{ rootScope }">
    <div
      ref="stepRef"
      :data-ex-step-index="stepIndex"
      :data-ex-step-count="stepCount"
      :class="stepClasses"
      :style="stepStyles"
      :role="isClickable ? 'button' : undefined"
      :tabindex="isClickable && !props.disabled ? 0 : undefined"
      :aria-current="isCurrent ? 'step' : undefined"
      :aria-disabled="props.disabled || undefined"
      v-bind="{ ...$attrs, ...rootScope }"
      @click="handleClick"
      @keydown="handleKeydown"
    >
      <!-- 步骤头部 -->
      <div class="ex-step__head">
        <div
          class="ex-step__icon"
          :style="iconStyles"
        >
          <!-- 普通模式显示图标或数字，进度点模式只保留外层圆点。 -->
          <template v-if="!stepsContext?.progressDot.value">
            <StepOutlet name="icon">
              <template v-if="statusIcon">
                <ExIcon
                  :icon="statusIcon"
                  class="ex-step__icon-image"
                  aria-hidden="true"
                />
              </template>
              <span
                v-else
                class="ex-step__icon-number"
              >
                {{ stepNumber }}
              </span>
            </StepOutlet>
          </template>
        </div>
        <div
          v-if="!isLastStep"
          class="ex-step__line"
          :class="lineClasses"
          :style="lineStyles"
        />
      </div>

      <!-- 步骤内容 -->
      <div class="ex-step__content">
        <div
          class="ex-step__title"
          :style="titleStyles"
        >
          <StepOutlet name="title">
            {{ title }}
          </StepOutlet>
        </div>
        <div
          v-if="subtitle || $slots.subtitle"
          class="ex-step__subtitle"
        >
          <StepOutlet name="subtitle">
            {{ subtitle }}
          </StepOutlet>
        </div>
        <div
          v-if="description || $slots.description"
          class="ex-step__description"
        >
          <StepOutlet name="description">
            {{ description }}
          </StepOutlet>
        </div>
      </div>
    </div>
  </StepContent>
</template>

<script setup lang="ts">
import { normalizeCustomClass } from '../../composables/useCustomClass';
import {
  computed,
  getCurrentInstance,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  useSlots,
} from 'vue';
import type { ExStepProps, ExStepExposed } from './types';
import { stepsContextKey, stepsHydrationKey } from './context';
import { StandaloneStepContent, stepContentKey } from './ordered-slot';
import { createStepOutlet } from './step-outlet';
import ExIcon from '../icon/ExIcon.vue';
import { isComposingKeyboardEvent } from '../../utils/keyboard';

defineOptions({
  name: 'ExStep',
  inheritAttrs: false,
});

const props = withDefaults(defineProps<ExStepProps>(), {
  disabled: false,
  clickable: undefined,
});

const stepRef = ref<HTMLDivElement>();

// 从父组件注入上下文
const stepsContext = inject(stepsContextKey, null);

// 注册步骤（索引由父组件按文档顺序实时计算，支持动态增删/重排）
const uid = Symbol('ex-step');
const slots = useSlots();
const getSlotNames = () =>
  stepsContext?.progressDot.value
    ? ['title', 'subtitle', 'description']
    : ['icon', 'title', 'subtitle', 'description'];
const { StepContent, StepOutlet } = inject(stepContentKey, null)?.(uid, slots, getSlotNames) ?? {
  StepContent: StandaloneStepContent,
  StepOutlet: createStepOutlet(slots).StepOutlet,
};
const renderedElement = getCurrentInstance()?.vnode.el;
const hydratedElement =
  typeof HTMLElement !== 'undefined' && renderedElement instanceof HTMLElement
    ? renderedElement
    : null;
stepsContext?.registerStep(
  uid,
  () => stepRef.value ?? hydratedElement,
  () => props.disabled
);
// 传送目标和异步包装可以比其相邻步骤先水合，首帧复用服务端已求得的位置。
const initialIndex = hydratedElement?.dataset.exStepIndex;
const initialCount = hydratedElement?.dataset.exStepCount;
const initialLast = hydratedElement?.classList.contains('ex-step--last');
const ownHydration = ref(initialIndex !== undefined);
const parentHydration = inject(stepsHydrationKey, null);
const useInitialPosition = computed(
  () => initialIndex !== undefined && (ownHydration.value || parentHydration?.value)
);
onMounted(() => {
  ownHydration.value = false;
});
const stepIndex = computed(() =>
  useInitialPosition.value ? Number(initialIndex) : (stepsContext?.getStepIndex(uid) ?? 0)
);
const stepCount = computed(() =>
  useInitialPosition.value && initialCount !== undefined
    ? Number(initialCount)
    : (stepsContext?.stepCount.value ?? 1)
);

// 组件卸载时注销
onBeforeUnmount(() => {
  stepsContext?.unregisterStep(uid);
});

// 计算属性
const stepNumber = computed(() => stepIndex.value + 1);

const isCurrent = computed(() => stepIndex.value === stepsContext?.current.value);

const isLastStep = computed(() =>
  useInitialPosition.value ? initialLast : stepIndex.value === stepCount.value - 1
);

const currentStatus = computed(() => {
  // 优先使用步骤自己的状态
  if (props.status) return props.status;
  if (!stepsContext) return 'wait';

  // 根据当前步骤索引判断状态
  if (stepIndex.value < stepsContext.current.value) {
    return 'finish';
  } else if (stepIndex.value === stepsContext.current.value) {
    return stepsContext.status.value;
  } else {
    return 'wait';
  }
});

const isClickable = computed(() => {
  // 优先使用步骤自己的clickable属性
  if (props.clickable !== undefined) return props.clickable;
  // 否则使用父组件的clickable属性
  return stepsContext?.clickable.value ?? false;
});

const stepClasses = computed(() => {
  const classes = ['ex-step'];

  classes.push(`ex-step--${currentStatus.value}`);

  if (props.disabled) {
    classes.push('ex-step--disabled');
  }

  if (isClickable.value && !props.disabled) {
    classes.push('ex-step--clickable');
  }

  if (isCurrent.value) {
    classes.push('ex-step--current');
  }

  if (isLastStep.value) {
    classes.push('ex-step--last');
  }

  classes.push(...normalizeCustomClass(props.class));

  return classes;
});

const stepStyles = computed(() => {
  if (!props.style) return undefined;
  if (typeof props.style === 'string') return props.style;
  return props.style;
});

// 连接线样式类
const lineClasses = computed(() => {
  const classes: string[] = [];

  // 如果有自定义颜色，不添加状态类
  if (props.lineColor) {
    return classes;
  }

  // 连接线的颜色取决于当前步骤的状态
  if (currentStatus.value === 'finish') {
    classes.push('ex-step__line--finish');
  } else if (currentStatus.value === 'error') {
    classes.push('ex-step__line--error');
  } else if (currentStatus.value === 'process') {
    classes.push('ex-step__line--process');
  }

  return classes;
});

// 自定义样式
const iconStyles = computed(() => {
  if (!props.iconColor) return undefined;
  return {
    borderColor: props.iconColor,
    backgroundColor: props.iconColor,
    color: '#ffffff',
  };
});

const titleStyles = computed(() => {
  if (!props.titleColor) return undefined;
  return {
    color: props.titleColor,
  };
});

const lineStyles = computed(() => {
  if (!props.lineColor) return undefined;
  return {
    backgroundColor: props.lineColor,
  };
});

// 获取状态图标
const statusIcon = computed(() => {
  // 根据状态返回对应的图标
  switch (currentStatus.value) {
    case 'finish':
      return 'check-line';
    case 'error':
      return 'close-line';
    default:
      return '';
  }
});

// 事件处理
const handleClick = () => {
  if (!props.disabled && isClickable.value) {
    stepsContext?.onStepClick(stepIndex.value, props.clickable === true);
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (
    event.target !== event.currentTarget ||
    event.defaultPrevented ||
    isComposingKeyboardEvent(event)
  )
    return;
  if (!isClickable.value || props.disabled || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  handleClick();
};

// 暴露的方法
const getElement = () => stepRef.value || null;
const getIndex = () => stepIndex.value;

defineExpose<ExStepExposed>({
  getElement,
  getIndex,
});
</script>

<style scoped lang="scss" src="./ExStep.scss"></style>
