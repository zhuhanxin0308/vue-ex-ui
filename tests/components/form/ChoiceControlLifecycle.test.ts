import { mount } from '@vue/test-utils';
import { h, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import ExCheckbox from '../../../src/components/checkbox/ExCheckbox.vue';
import ExCheckboxGroup from '../../../src/components/checkbox/ExCheckboxGroup.vue';
import ExRadio from '../../../src/components/radio/ExRadio.vue';
import ExRadioGroup from '../../../src/components/radio/ExRadioGroup.vue';
import ExSlider from '../../../src/components/slider/ExSlider.vue';

describe('选项组件与外部状态', () => {
  it.each([true, false])('单选交互保留外部错误及描述关系：分组 %s', async grouped => {
    const error = ref('服务端拒绝');
    const renderChoice = () => h(ExRadio, { value: 'a', errorMessage: grouped ? '' : error.value });
    const wrapper = mount({
      render: () =>
        grouped ? h(ExRadioGroup, { errorMessage: error.value }, renderChoice) : renderChoice(),
    });
    try {
      const control = grouped ? wrapper.get('[role="radiogroup"]') : wrapper.get('input');
      const errorId = wrapper.get('[role="alert"]').attributes('id');
      await wrapper.get('input').setValue(true);
      expect(wrapper.get('[role="alert"]').text()).toContain(error.value);
      expect(control.attributes('aria-describedby')?.split(' ')).toContain(errorId);
      if (!grouped) expect(control.attributes('aria-invalid')).toBe('true');
      error.value = '';
      await nextTick();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(control.attributes('aria-describedby')).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('批量操作只更改可写选项并在可达到的上限和下限间切换', async () => {
    const selected = ref<Array<string | number>>(['locked']);
    const wrapper = mount({
      render: () =>
        h(
          ExCheckboxGroup,
          {
            modelValue: selected.value,
            min: 1,
            max: 2,
            'onUpdate:modelValue': value => {
              selected.value = value;
            },
          },
          () => [
            h(ExCheckbox, { value: 'locked', readonly: true }),
            h(ExCheckbox, { value: 'locked-off', readonly: true }),
            h(ExCheckbox, { value: 'a' }),
            h(ExCheckbox, { value: 'b' }),
          ]
        ),
    });
    try {
      const group = wrapper.getComponent(ExCheckboxGroup);
      group.vm.toggleAll();
      await nextTick();
      expect(selected.value).toEqual(['locked', 'a']);
      group.vm.toggleAll();
      await nextTick();
      expect(selected.value).toEqual(['locked']);
      group.vm.uncheckAll();
      expect(group.emitted('change')).toHaveLength(2);
    } finally {
      wrapper.unmount();
    }
  });

  it('没有选项时批量操作不发出空变更', () => {
    const group = mount(ExCheckboxGroup, { props: { options: [] } });
    try {
      group.vm.checkAll();
      group.vm.toggleAll();
      group.vm.uncheckAll();
      expect(group.emitted('change')).toBeUndefined();
    } finally {
      group.unmount();
    }
  });

  it('可写选项不足以达到 min 时不提交无效全集，增加选项后可恢复', async () => {
    const options = [{ value: 'a', label: '甲' }];
    const group = mount(ExCheckboxGroup, { props: { min: 2, options } });
    try {
      group.vm.checkAll();
      group.vm.toggleAll();
      expect(group.emitted('change')).toBeUndefined();
      await group.setProps({ options: [...options, { value: 'b', label: '乙' }] });
      group.vm.toggleAll();
      expect(group.emitted('change')).toEqual([[['a', 'b']]]);
    } finally {
      group.unmount();
    }
  });

  it('同一个模型值有只读实例时，全组选中也保留其原状态', () => {
    const group = mount(ExCheckboxGroup, {
      slots: {
        default: () => [
          h(ExCheckbox, { value: 'shared' }),
          h(ExCheckbox, { value: 'shared', readonly: true }),
          h(ExCheckbox, { value: 'other' }),
        ],
      },
    });
    try {
      group.vm.checkAll();
      expect(group.emitted('change')).toEqual([[['other']]]);
    } finally {
      group.unmount();
    }
  });

  for (const lock of ['readonly', 'disabled'] as const) {
    it.each([false, true])(`点击不能改动同值的 ${lock} 实例：初始选中 %s`, async checked => {
      const locked = ref(true);
      const selected = ref<Array<string | number>>(checked ? ['shared'] : []);
      const wrapper = mount({
        render: () =>
          h(
            ExCheckboxGroup,
            {
              modelValue: selected.value,
              'onUpdate:modelValue': value => {
                selected.value = value;
              },
            },
            () => [
              h(ExCheckbox, { value: 'shared' }),
              h(ExCheckbox, { value: 'shared', [lock]: locked.value }),
            ]
          ),
      });
      try {
        await wrapper.findAll('input')[0]!.setValue(!checked);
        expect(wrapper.getComponent(ExCheckboxGroup).emitted('change')).toBeUndefined();
        expect(wrapper.findAll('input').map(input => input.element.checked)).toEqual([
          checked,
          checked,
        ]);
        locked.value = false;
        await nextTick();
        await wrapper.findAll('input')[0]!.setValue(!checked);
        expect(selected.value).toEqual(checked ? [] : ['shared']);
      } finally {
        wrapper.unmount();
      }
    });
  }

  it('范围滑块同步原地修改的两端并从最新区间继续步进', async () => {
    const range = ref<[number, number]>([20, 80]);
    const wrapper = mount({
      render: () => h(ExSlider, { modelValue: range.value, showInput: true, range: true }),
    });
    try {
      range.value[0] = 30;
      range.value[1] = 60;
      await nextTick();
      const thumbs = wrapper.findAll('[role="slider"]');
      expect(thumbs.map(thumb => thumb.attributes('aria-valuenow'))).toEqual(['30', '60']);
      expect(wrapper.findAll('input').map(input => input.element.value)).toEqual(['30', '60']);
      expect(wrapper.get<HTMLElement>('.ex-slider__bar').element.style.width).toBe('30%');
      await thumbs[1]!.trigger('keydown', { key: 'ArrowRight' });
      expect(wrapper.getComponent(ExSlider).emitted('update:modelValue')).toEqual([[[30, 61]]]);
      expect(range.value).toEqual([30, 60]);
    } finally {
      wrapper.unmount();
    }
  });
});
