import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ExInput from '../../../src/components/input/ExInput.vue';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('输入法与动态交互状态回归', () => {
  it.each(['disabled', 'readonly'] as const)(
    '%s 解锁后到达的旧组合结束与尾事件不能提交已撤销草稿',
    async state => {
      const wrapper = mount(ExInput, {
        props: { modelValue: 'A', modelModifiers: { lazy: true } },
      });
      wrappers.push(wrapper);
      const input = wrapper.get('input');
      await input.trigger('compositionstart');
      input.element.value = 'B';
      await input.trigger('input');
      await wrapper.setProps({ [state]: true });
      expect(input.element.value).toBe('A');
      await wrapper.setProps({ [state]: false });
      input.element.value = 'B';
      await input.trigger('compositionend', { data: 'B' });
      input.element.value = 'B';
      await input.trigger('input', { inputType: 'insertFromComposition', data: 'B' });
      await input.trigger('change');
      expect(wrapper.emitted('update:modelValue') ?? []).not.toContainEqual(['B']);
      expect(input.element.value).toBe('A');
      await input.setValue('C');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['C']);
    }
  );

  it('解锁后的新键入不必等待旧组合结束，迟到的组合事件仍被撤销', async () => {
    const wrapper = mount(ExInput, {
      props: { modelValue: 'A', modelModifiers: { lazy: true } },
    });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    await input.trigger('compositionstart');
    await wrapper.setProps({ readonly: true });
    await wrapper.setProps({ readonly: false });
    await input.trigger('beforeinput', { inputType: 'insertText', data: 'C' });
    input.element.value = 'C';
    await input.trigger('input', { inputType: 'insertText', data: 'C' });
    input.element.value = 'B';
    await input.trigger('compositionend', { data: 'B' });
    input.element.value = 'B';
    await input.trigger('input', { inputType: 'insertFromComposition', data: 'B' });
    await input.trigger('change');
    expect(wrapper.emitted('update:modelValue')).toEqual([['C']]);
  });

  it.each(['disabled', 'readonly'] as const)('lazy 草稿进入 %s 后不再参与原生提交', async state => {
    const form = document.createElement('form');
    const wrapper = mount(ExInput, {
      props: { modelValue: 'A', modelModifiers: { lazy: true }, name: 'account' },
      attachTo: form,
    });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    input.element.value = 'B';
    await input.trigger('input');
    await wrapper.setProps({ [state]: true });
    expect(input.element.value).toBe('A');
    expect(new FormData(form).get('account')).toBe(state === 'readonly' ? 'A' : null);
    await input.trigger('change');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.setProps({ [state]: false });
    await input.setValue('C');
    expect(wrapper.emitted('update:modelValue')).toEqual([['C']]);
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    '保留组合输入确认键，不触发业务 enter：%j',
    async composition => {
      const wrapper = mount(ExInput);
      wrappers.push(wrapper);
      await wrapper.get('input').trigger('keydown', { key: 'Enter', ...composition });
      expect(wrapper.emitted('enter')).toBeUndefined();
      expect(wrapper.emitted('keydown')).toHaveLength(1);
      await wrapper.get('input').trigger('keydown', { key: 'Enter' });
      expect(wrapper.emitted('enter')).toHaveLength(1);
    }
  );

  it.each(['disabled', 'readonly'] as const)(
    '组合过程中切换 %s 后丢弃尾事件，恢复已提交值并允许重新编辑',
    async state => {
      const wrapper = mount(ExInput, { props: { modelValue: '原值' } });
      wrappers.push(wrapper);
      const input = wrapper.get('input');
      await input.trigger('compositionstart');
      input.element.value = '中文草稿';
      await input.trigger('input');
      await wrapper.setProps({ [state]: true });
      await input.trigger('compositionend');
      await input.trigger('input');
      await input.trigger('change');
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      expect(wrapper.emitted('change')).toBeUndefined();
      expect(input.element.value).toBe('原值');
      await wrapper.setProps({ [state]: false });
      await input.setValue('新值');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['新值']);
    }
  );
});
