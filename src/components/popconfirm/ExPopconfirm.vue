<template>
  <ExPopover
    v-model="popoverVisible"
    :placement="placement"
    :trigger="trigger"
    :disabled="disabled"
    :close-delay="effectiveConfirmLoading ? 0 : undefined"
    :aria-label="title || t('confirm')"
    :custom-class="popupClasses"
    :custom-style="popupStyle"
  >
    <!-- 触发元素 -->
    <slot></slot>

    <!-- 确认框内容 -->
    <template #content>
      <div :class="popconfirmClasses">
        <!-- 头部 -->
        <div class="ex-popconfirm__header">
          <!-- 图标 -->
          <div
            v-if="showIcon"
            class="ex-popconfirm__icon"
          >
            <slot name="icon">
              <ExIcon
                v-bind="iconSource"
                :size="20"
                aria-hidden="true"
              />
            </slot>
          </div>

          <!-- 内容 -->
          <div class="ex-popconfirm__content">
            <div class="ex-popconfirm__title">
              <slot name="title">
                {{ title }}
              </slot>
            </div>
            <div
              v-if="description || $slots.description"
              class="ex-popconfirm__description"
            >
              <slot name="description">
                {{ description }}
              </slot>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="ex-popconfirm__footer">
          <ExButton
            v-if="showCancel"
            size="small"
            :disabled="effectiveConfirmLoading"
            @click.stop="handleCancel"
          >
            {{ cancelText || t('cancel') }}
          </ExButton>
          <ExButton
            size="small"
            :type="okType"
            :loading="effectiveConfirmLoading"
            :disabled="effectiveConfirmLoading"
            @click.stop="handleConfirm"
          >
            {{ okText || t('confirm') }}
          </ExButton>
        </div>
      </div>
    </template>
  </ExPopover>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { ExPopconfirmProps, ExPopconfirmEmits, ExPopconfirmExposed } from './types';
import { useLocale } from '../../locale';
import ExPopover from '../popover/ExPopover.vue';
import ExButton from '../button/ExButton.vue';
import ExIcon from '../icon/ExIcon.vue';
import { resolveIconSource } from '../icon/icon-utils';
import { useControllableState } from '../../composables/useControllableState';

defineOptions({
  name: 'ExPopconfirm',
});

const props = withDefaults(defineProps<ExPopconfirmProps>(), {
  visible: undefined,
  type: 'warning',
  okType: 'primary',
  showCancel: true,
  confirmLoading: false,
  disabled: false,
  placement: 'top',
  trigger: 'click',
  showIcon: true,
});

const emit = defineEmits<ExPopconfirmEmits>();

const { t } = useLocale('dialog');

const confirmPending = ref(false);
let confirmationRevision = 0;
let disposed = false;
const effectiveConfirmLoading = computed(() => props.confirmLoading || confirmPending.value);
const visibilityState = useControllableState({
  controlledValue: () => props.visible,
  defaultValue: false,
  onChange: visible => emit('update:visible', visible),
});
const requestVisibility = (visible: boolean, force = false) => {
  if (disposed || (visible && props.disabled)) return;
  if (!visible && effectiveConfirmLoading.value && !force) return;
  if (visible !== visibilityState.value.value) visibilityState.request(visible);
};
const popoverVisible = computed({
  get: () => !props.disabled && visibilityState.value.value,
  set: visible => requestVisibility(visible),
});

// 计算属性
const popconfirmClasses = computed(() => {
  const classes = ['ex-popconfirm'];
  if (props.type) classes.push(`ex-popconfirm--${props.type}`);
  return classes;
});

const popupClasses = computed(() => {
  const classes: string[] = [];
  if (props.popupClass) classes.push(props.popupClass);
  return classes.join(' ');
});

const defaultIcon = computed(() => {
  const iconMap: Record<string, string> = {
    default: 'question-line',
    primary: 'information-line',
    success: 'checkbox-circle-line',
    warning: 'error-warning-line',
    danger: 'close-circle-line',
    info: 'information-line',
    error: 'close-circle-line',
  };
  return iconMap[props.type] || iconMap.default;
});

const iconSource = computed(() => resolveIconSource(props.icon, defaultIcon.value));

// 事件处理
watch(
  popoverVisible,
  () => {
    confirmationRevision += 1;
    confirmPending.value = false;
  },
  { flush: 'sync' }
);

watch(
  () => props.disabled,
  disabled => {
    if (disabled) requestVisibility(false, true);
  }
);

onBeforeUnmount(() => {
  disposed = true;
  confirmationRevision += 1;
});

const handleConfirm = async () => {
  if (
    disposed ||
    !popoverVisible.value ||
    props.disabled ||
    props.confirmLoading ||
    confirmPending.value
  )
    return;
  const revision = ++confirmationRevision;
  confirmPending.value = true;
  try {
    if (props.beforeConfirm) {
      const result = await props.beforeConfirm();
      if (result === false) return;
    }

    if (disposed || revision !== confirmationRevision || !popoverVisible.value) return;
    emit('confirm');
    requestVisibility(false, true);
  } catch (error) {
    if (!disposed && revision === confirmationRevision) emit('confirm-error', error);
  } finally {
    if (revision === confirmationRevision) confirmPending.value = false;
  }
};

const handleCancel = () => {
  if (effectiveConfirmLoading.value) return;
  emit('cancel');
  popoverVisible.value = false;
};

// 暴露的方法
const show = () => {
  if (disposed || props.disabled) return;
  popoverVisible.value = true;
};

const hide = () => {
  // 显式 API 关闭保留调用方取消请求的控制权，只有偶发交互被异步守卫拦截。
  requestVisibility(false, true);
};

defineExpose<ExPopconfirmExposed>({
  show,
  hide,
});
</script>

<style scoped lang="scss" src="./ExPopconfirm.scss"></style>
