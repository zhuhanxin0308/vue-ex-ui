/** 部分浏览器在输入法确认键上提前清除 isComposing，仍通过处理键码报告组合状态。 */
const IME_PROCESSING_KEY_CODE = 229;

/** 保留输入法自身的方向键、确认和取消操作，不把它们转换为业务选择。 */
export function isComposingKeyboardEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === IME_PROCESSING_KEY_CODE;
}

/** 组合尾事件可能在 compositionend 后才到达，此时 isComposing 已经变为 false。 */
export function isCompositionInputEvent(event: InputEvent): boolean {
  return (
    event.isComposing ||
    event.inputType === 'insertCompositionText' ||
    event.inputType === 'insertFromComposition'
  );
}
