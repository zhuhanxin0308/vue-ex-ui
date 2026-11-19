import { nextTick } from 'vue';
import { createDocumentRuntime } from '../../utils/shared-runtime';

interface RadioMember {
  isControlled: () => boolean;
  isChecked: () => boolean;
  clearSelection: () => void;
}

type RadioRoot = Document | ShadowRoot | HTMLElement;
const getRadioState = createDocumentRuntime('native-radio-members', () => ({
  members: new WeakMap<HTMLInputElement, RadioMember>(),
  nativeSelection: new WeakSet<HTMLInputElement>(),
  roots: new WeakMap<RadioRoot, { count: number; removeListener: () => void }>(),
}));

const groupMembers = (input: HTMLInputElement, root: RadioRoot) =>
  input.name
    ? [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
        candidate => candidate.name === input.name && candidate.form === input.form
      )
    : [input];

/** 独立 Radio 也遵守浏览器按树根、表单归属和 name 划分的原生组边界。 */
export function registerNativeRadio(input: HTMLInputElement, member: RadioMember) {
  const state = getRadioState();
  const root = input.getRootNode() as RadioRoot;
  state.members.set(input, member);
  for (const candidate of groupMembers(input, root)) {
    if (candidate.checked && !state.members.has(candidate)) state.nativeSelection.add(candidate);
  }

  // 普通 HTML 单选框只在新选中的项上派发 change，按树根共享监听以同步组件外观。
  let registration = state.roots.get(root);
  if (!registration) {
    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.localName === 'input' && target.type === 'radio' && !state.members.has(target))
        restoreNativeRadioGroup(target);
    };
    root.addEventListener('change', onChange, true);
    registration = {
      count: 0,
      removeListener: () => root.removeEventListener('change', onChange, true),
    };
    state.roots.set(root, registration);
  }
  registration.count++;
  return () => {
    state.members.delete(input);
    if (--registration.count === 0) {
      registration.removeListener();
      state.roots.delete(root);
    }
  };
}

export function restoreNativeRadioGroup(input: HTMLInputElement) {
  const state = getRadioState();
  const candidates = groupMembers(input, input.getRootNode() as RadioRoot);
  if (!state.members.has(input) && input.checked) state.nativeSelection.add(input);
  void nextTick(() => {
    for (const candidate of candidates) {
      const member = state.members.get(candidate);
      if (member?.isControlled()) candidate.checked = member.isChecked();
    }
    if (!candidates.some(candidate => candidate.checked)) {
      // 被拒绝的受控请求已经触发原生互斥，恢复原先确认的组件或普通单选框。
      const previous = candidates.find(
        candidate =>
          state.members.get(candidate)?.isChecked() ?? state.nativeSelection.has(candidate)
      );
      if (previous) previous.checked = true;
    }
    for (const candidate of candidates) {
      const member = state.members.get(candidate);
      if (!candidate.checked) {
        state.nativeSelection.delete(candidate);
        if (member && !member.isControlled() && member.isChecked()) member.clearSelection();
      }
    }
  });
}
