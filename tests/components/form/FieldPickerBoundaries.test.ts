import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExForm from '../../../src/components/form/ExForm.vue';
import ExFormItem from '../../../src/components/form/ExFormItem.vue';
import ExSelect from '../../../src/components/select/ExSelect.vue';
import ExTreeSelect from '../../../src/components/tree-select/ExTreeSelect.vue';
import ExCascader from '../../../src/components/cascader/ExCascader.vue';
import ExDateTimePicker from '../../../src/components/datetime-picker/ExDateTimePicker.vue';
import ExTimePicker from '../../../src/components/time-picker/ExTimePicker.vue';
import ExColorPicker from '../../../src/components/color-picker/ExColorPicker.vue';
import ExRate from '../../../src/components/rate/ExRate.vue';
import ExSlider from '../../../src/components/slider/ExSlider.vue';
import { logger } from '../../../src/utils/logger';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));
const options = [
  { label: '甲', value: 'a' },
  { label: '乙', value: 'b' },
];
const branches = options.map(option => ({
  ...option,
  children: [{ label: '共同', value: 'same' }],
}));
const components = {
  ExForm,
  ExFormItem,
  ExSelect,
  ExTreeSelect,
  ExCascader,
  ExDateTimePicker,
  ExTimePicker,
  ExColorPicker,
  ExRate,
  ExSlider,
};
function field(template: string) {
  const wrapper = mount({
    components,
    setup: () => ({ options }),
    template: `<ExForm :model="{}"><ExFormItem label="字段" prop="choice">${template}</ExFormItem></ExForm>`,
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe('选择器草稿、路径身份与表单复位', () => {
  it('静态树重复值只保留首个分支并维持父节点的勾选区间', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      const wrapper = mount(ExTreeSelect, {
        props: { data: branches, multiple: true, defaultExpandAll: true, teleported: false },
      });
      wrappers.push(wrapper);
      await wrapper.get('[role="combobox"]').trigger('click');
      const items = wrapper.findAll('[role="treeitem"]');
      expect(items.map(item => item.text())).toEqual(['甲', '共同', '乙']);
      await items[0]!.trigger('click');
      expect(items[1]!.attributes('aria-checked')).toBe('true');
      expect(items[2]!.attributes('aria-checked')).toBe('false');
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('时间列鼠标与键盘只编辑草稿，取消后回到确认值', async () => {
    const wrapper = field('<ExTimePicker :teleported="false"/>');
    const picker = wrapper.getComponent(ExTimePicker);
    const combo = picker.get('[role="combobox"]');
    await combo.trigger('click');
    await picker.get('[data-unit="h"][data-value="9"]').trigger('click');
    await picker.get('[data-unit="h"][data-value="9"]').trigger('keydown', { key: 'ArrowDown' });
    expect(picker.emitted('change')).toBeUndefined();
    expect(picker.emitted('update:modelValue')).toBeUndefined();
    await combo.trigger('keydown', { key: 'Escape' });
    await combo.trigger('click');
    expect(picker.get('[data-unit="h"][data-value="0"]').attributes('aria-selected')).toBe('true');
    await picker.get('[data-unit="h"][data-value="8"]').trigger('click');
    await picker.get('.ex-time-picker__confirm').trigger('click');
    expect(picker.emitted('change')).toEqual([['08:00:00']]);
    wrapper.getComponent(ExForm).vm.resetFields();
    await nextTick();
    expect(picker.find('.ex-time-picker__text').exists()).toBe(false);
    expect(combo.attributes('aria-labelledby')).toBeTruthy();
    expect(combo.attributes('aria-label')).toBeUndefined();
  });

  it('同值子节点按完整路径区分，允许选择父级时搜索结果包含独立父节点', async () => {
    const wrapper = mount(ExCascader, {
      props: {
        options: branches,
        modelValue: ['a', 'same'],
        trigger: 'hover',
        filterable: true,
        changeOnSelect: true,
        teleported: false,
      },
    });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    await input.trigger('click');
    await wrapper.findAll('.ex-cascader__option')[1]!.trigger('mouseenter');
    expect(
      wrapper.findAll('.ex-cascader__menu')[1]!.get('[role="option"]').attributes('aria-selected')
    ).toBe('false');
    await input.setValue('乙');
    const results = wrapper.findAll('.ex-cascader__search-results [role="option"]');
    expect(results).toHaveLength(2);
    await results[0]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b']]);
  });

  it.each([
    {
      template: '<ExTreeSelect :data="options" :teleported="false"/>',
      option: '[role="treeitem"]',
    },
    {
      template: '<ExCascader :options="options" :teleported="false"/>',
      option: '.ex-cascader__option',
    },
    {
      template: '<ExCascader multiple :options="options" :teleported="false"/>',
      option: '.ex-cascader__option',
    },
    {
      template: '<ExDateTimePicker :teleported="false"/>',
      option: '[role="gridcell"] button:not([disabled])',
    },
  ])('非受控选择在表单复位后还原 $template', async ({ template, option }) => {
    const wrapper = field(template);
    const combo = wrapper.get('[role="combobox"]');
    const original = combo.element instanceof HTMLInputElement ? combo.element.value : combo.text();
    await combo.trigger('click');
    await wrapper.get(option).trigger('click');
    wrapper.getComponent(ExForm).vm.resetFields();
    await nextTick();
    expect(combo.element instanceof HTMLInputElement ? combo.element.value : combo.text()).toBe(
      original
    );
    expect(wrapper.find('.ex-cascader__tag').exists()).toBe(false);
  });

  it('选择标签删除阻止抢焦，弹层的层级只在弹层壳上生效', async () => {
    const wrapper = mount(ExSelect, {
      props: { options, multiple: true, modelValue: ['a'] },
    });
    wrappers.push(wrapper);
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    wrapper.get('.ex-select__tag-close').element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await wrapper.get('[role="combobox"]').trigger('click');
    const popup = document.querySelector<HTMLElement>('.ex-select__dropdown')!;
    expect(popup.style.zIndex).not.toBe('');
    expect(popup.querySelector<HTMLElement>('[role="listbox"]')!.style.zIndex).toBe('');
  });

  it.each(['ExRate', 'ExSlider'])('非受控 %s 表单重置恢复初值，输入法选词不改分值', async name => {
    const wrapper = field(`<${name}/>`);
    const slider = wrapper.get('[role="slider"]');
    await slider.trigger('keydown', { key: 'ArrowRight', isComposing: true });
    expect(slider.attributes('aria-valuenow')).toBe('0');
    await slider.trigger('keydown', { key: 'End' });
    expect(slider.attributes('aria-valuenow')).not.toBe('0');
    wrapper.getComponent(ExForm).vm.resetFields();
    await nextTick();
    expect(slider.attributes('aria-valuenow')).toBe('0');
  });

  it('非受控颜色选择后表单重置还原空色块', async () => {
    const wrapper = field('<ExColorPicker :predefine="[\'#ff0000\']" :teleported="false"/>');
    const swatch = wrapper.get<HTMLElement>('.ex-color-picker__swatch-inner');
    await wrapper.get('.ex-color-picker__trigger').trigger('click');
    await wrapper.get('.ex-color-picker__predefine-item').trigger('click');
    expect(swatch.element.style.backgroundColor).not.toBe('');
    wrapper.getComponent(ExForm).vm.resetFields();
    await nextTick();
    expect(swatch.element.style.backgroundColor).toBe('');
  });
});
