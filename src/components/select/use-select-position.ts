import { nextTick, ref, type Ref } from 'vue';
import { useViewportPosition } from '../../composables/useFloatingAutoUpdate';
import { SELECT_DROPDOWN_OPTIONS_MAX_HEIGHT } from './constants';
import { calculateSelectDropdownPosition } from './position';

/** 同时测量浮层和虚拟列表可用高度，视口变化后重新定位。 */
export function useSelectPosition(
  trigger: Ref<HTMLElement | undefined>,
  dropdown: Ref<HTMLElement | undefined>,
  visible: Ref<boolean>
) {
  const dropdownStyles = ref<Record<string, string>>({});
  const availableDropdownHeight = ref(SELECT_DROPDOWN_OPTIONS_MAX_HEIGHT);
  function updateDropdownPosition() {
    if (!trigger.value || !dropdown.value) return;
    const position = calculateSelectDropdownPosition(
      trigger.value.getBoundingClientRect(),
      dropdown.value.offsetHeight,
      window.innerWidth,
      window.innerHeight
    );
    availableDropdownHeight.value = position.optionsMaxHeight;
    dropdownStyles.value = {
      top: `${position.top}px`,
      left: `${position.left}px`,
      minWidth: `${position.width}px`,
      maxWidth: `${position.maxWidth}px`,
      maxHeight: `${position.maxHeight}px`,
      '--ex-select-options-max-height': `${position.optionsMaxHeight}px`,
    };
  }
  useViewportPosition(visible, () => {
    // 测量前恢复完整内容高度，避免重复定位产生高度振荡。
    availableDropdownHeight.value = SELECT_DROPDOWN_OPTIONS_MAX_HEIGHT;
    dropdown.value?.style.removeProperty('max-height');
    dropdown.value?.style.removeProperty('--ex-select-options-max-height');
    void nextTick(() => {
      if (visible.value) updateDropdownPosition();
    });
  });
  return { availableDropdownHeight, dropdownStyles, updateDropdownPosition };
}
