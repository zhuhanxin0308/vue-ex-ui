import { computed, ref, type Ref } from 'vue';
import { isCompositionInputEvent } from '../utils/keyboard';

export function useSearchInput(
  input: Ref<HTMLInputElement | undefined>,
  confirmedValue: Readonly<Ref<string>>,
  commitSearch: (value: string) => void
) {
  const draft = ref<string | null>(null);
  let discardedComposition: 'none' | 'waiting' | 'resumed' = 'none';
  let ignoredFinalInput: string | null = null;

  const displayValue = computed(() => draft.value ?? confirmedValue.value);

  const restoreDisplay = () => {
    if (input.value) input.value.value = confirmedValue.value;
  };

  const discard = () => {
    if (draft.value !== null) discardedComposition = 'waiting';
    draft.value = null;
    restoreDisplay();
  };

  const startComposition = () => {
    discardedComposition = 'none';
    ignoredFinalInput = null;
    draft.value = input.value?.value ?? confirmedValue.value;
  };

  const endComposition = () => {
    if (!input.value || (draft.value === null && discardedComposition === 'none')) return;
    const value = input.value.value;
    draft.value = null;
    // 最终文本可能在微任务之后被浏览器再次派发，只消费一次提交。
    ignoredFinalInput = value;
    if (discardedComposition === 'none') {
      commitSearch(value);
      return;
    }
    discardedComposition = 'none';
    restoreDisplay();
  };

  const startEdit = () => {
    // 新的普通键入无需等待旧组合结束，但迟到的组合结果仍属于已撤销会话。
    if (discardedComposition === 'waiting') discardedComposition = 'resumed';
    ignoredFinalInput = null;
  };

  const handleBeforeInput = (event: Event) => {
    const edit = event as InputEvent;
    if (edit.inputType && !isCompositionInputEvent(edit)) startEdit();
  };

  const handleInput = (event: Event) => {
    if (!input.value) return;
    const value = input.value.value;
    const edit = event as InputEvent;
    const cancelledValue = ignoredFinalInput;
    ignoredFinalInput = null;
    if (
      discardedComposition === 'waiting' ||
      (discardedComposition === 'resumed' && isCompositionInputEvent(edit)) ||
      (cancelledValue !== null &&
        (value === cancelledValue ||
          value === confirmedValue.value ||
          isCompositionInputEvent(edit)))
    ) {
      restoreDisplay();
      return;
    }
    if (draft.value !== null || edit.isComposing) {
      draft.value = value;
      return;
    }
    commitSearch(value);
  };

  // 被撤销会话只拦截其迟到输入，不应阻止新的导航键；真正的 IME 按键由原生标志保护。
  const isComposing = () => draft.value !== null;

  return {
    displayValue,
    discard,
    startComposition,
    endComposition,
    startEdit,
    handleBeforeInput,
    handleInput,
    isComposing,
  };
}
