import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExFormItem from '../../../src/components/form/ExFormItem.vue';
import ExCheckbox from '../../../src/components/checkbox/ExCheckbox.vue';
import ExRadio from '../../../src/components/radio/ExRadio.vue';
import ExSwitch from '../../../src/components/switch/ExSwitch.vue';
import ExSlider from '../../../src/components/slider/ExSlider.vue';
import ExVerificationCode from '../../../src/components/verification-code/ExVerificationCode.vue';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('原生点击、字段错误与输入法提交', () => {
  it('受控选项被拒绝时恢复同组已选中的非受控项', async () => {
    const wrapper = mount(
      {
        components: { ExRadio },
        template:
          '<div><ExRadio name="items" value="a"/><ExRadio name="items" value="b" model-value="a"/></div>',
      },
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    const [first, second] = wrapper.findAll('input');
    first!.element.click();
    await nextTick();
    await nextTick();
    second!.element.click();
    await nextTick();
    await nextTick();
    expect(first!.element.checked).toBe(true);
    expect(second!.element.checked).toBe(false);
    expect(wrapper.findAll('.ex-radio--checked')).toHaveLength(1);
  });

  it('同一表单中的普通单选按钮能取消组件的非受控外观', async () => {
    const wrapper = mount(
      {
        components: { ExRadio },
        template:
          '<form><ExRadio name="items" value="a"/><input type="radio" name="items" value="b"></form>',
      },
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    const [first, second] = wrapper.findAll('input');
    first!.element.click();
    await nextTick();
    second!.element.click();
    await nextTick();
    await nextTick();
    expect(first!.element.checked).toBe(false);
    expect(second!.element.checked).toBe(true);
    expect(wrapper.find('.ex-radio--checked').exists()).toBe(false);
  });

  it('受控项被拒绝时也能恢复此前勾选的普通单选按钮', async () => {
    const wrapper = mount(
      {
        components: { ExRadio },
        template:
          '<form><input type="radio" name="items" checked><ExRadio name="items" value="b" model-value="a"/></form>',
      },
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    const [native, controlled] = wrapper.findAll('input');
    controlled!.element.click();
    await nextTick();
    expect(native!.element.checked).toBe(true);
    expect(controlled!.element.checked).toBe(false);
  });

  it('多个选项仅由字段播报一次错误，每个输入仍关联该错误', () => {
    const wrapper = mount({
      components: { ExFormItem, ExCheckbox, ExRadio },
      template: `<ExFormItem label="字段" error="请选择">
        <ExCheckbox/><ExRadio value="a"/><ExRadio value="b"/>
      </ExFormItem>`,
    });
    wrappers.push(wrapper);
    expect(wrapper.findAll('[role="alert"]').map(alert => alert.text())).toEqual(['请选择']);
    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('aria-invalid')).toBe('true');
      expect(input.attributes('aria-describedby')).toContain(
        wrapper.get('[role="alert"]').attributes('id')
      );
    }
  });

  it('非受控单选可选中且同名选项保持互斥', async () => {
    const wrapper = mount(
      {
        components: { ExRadio },
        template: '<div><ExRadio name="group" value="a"/><ExRadio name="group" value="b"/></div>',
      },
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    const [a, b] = wrapper.findAll('input');
    a!.element.click();
    await nextTick();
    expect(a!.element.checked).toBe(true);
    b!.element.click();
    await nextTick();
    // 原生组在父级确认后同步同名控件，再等待对应的视觉状态渲染。
    await nextTick();
    expect(a!.element.checked).toBe(false);
    expect(b!.element.checked).toBe(true);
    expect(wrapper.findAll('.ex-radio--checked')).toHaveLength(1);
  });

  it('外层 label 内的开关每次点击只提交一次', async () => {
    const wrapper = mount(
      {
        components: { ExSwitch },
        template: '<label><span>通知</span><ExSwitch/></label>',
      },
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    const control = wrapper.getComponent(ExSwitch);
    wrapper.get<HTMLElement>('.ex-switch__core').element.click();
    await nextTick();
    wrapper.get<HTMLElement>('label > span').element.click();
    await nextTick();
    expect(control.emitted('change')).toEqual([[true], [false]]);
  });

  it('输入法上屏只提交一次，选词按键保留原有验证码', async () => {
    const wrapper = mount(ExVerificationCode, { props: { length: 4 } });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    input.element.dispatchEvent(new InputEvent('input', { data: '1', bubbles: true }));
    await input.trigger('compositionstart');
    await input.trigger('keydown', { key: 'Backspace', isComposing: true });
    input.element.dispatchEvent(
      new InputEvent('input', { data: '2', bubbles: true, isComposing: true })
    );
    input.element.dispatchEvent(
      new CompositionEvent('compositionend', { data: '2', bubbles: true })
    );
    await nextTick();
    input.element.dispatchEvent(
      new InputEvent('input', { data: '2', inputType: 'insertFromComposition', bubbles: true })
    );
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['1'], ['12']]);
    input.element.dispatchEvent(
      new InputEvent('input', { data: '2', inputType: 'insertText', bubbles: true })
    );
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['1'], ['12'], ['122']]);
  });

  it('重叠滑块在终点可以向左拖动，右键轨道与手柄都不修改值', async () => {
    const wrapper = mount(ExSlider, { props: { range: true, modelValue: [100, 100] } });
    wrappers.push(wrapper);
    const track = wrapper.get<HTMLElement>('.ex-slider__track-wrapper');
    vi.spyOn(track.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20));
    const last = wrapper.findAll('[role="slider"]')[1]!;
    await track.trigger('mousedown', { button: 2, clientX: 72 });
    await last.trigger('mousedown', { button: 2, clientX: 100 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await last.trigger('mousedown', { button: 0, clientX: 100 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('change')).toEqual([[[60, 100]]]);
  });
});
