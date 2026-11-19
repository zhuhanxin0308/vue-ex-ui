import { mount } from '@vue/test-utils';
import { h, nextTick, reactive, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import ExForm from '../../../src/components/form/ExForm.vue';
import ExFormItem from '../../../src/components/form/ExFormItem.vue';
import ExInput from '../../../src/components/input/ExInput.vue';
import ExNumberInput from '../../../src/components/number-input/ExNumberInput.vue';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('表单原生重置与输入确认边界', () => {
  it('整表快照保留根回指和字段间的共享引用，路径快照也保留别名', () => {
    const account = { name: 'Neo' };
    const raw: Record<string, unknown> = { first: account, second: account, count: ref(12) };
    Object.defineProperty(raw, 'privateState', { value: '内部状态' });
    raw.self = raw;
    const wrapper = mount(ExForm, { props: { model: reactive(raw) } });
    wrappers.push(wrapper);
    const whole = wrapper.vm.getFieldsValue();
    expect(whole.self).toBe(whole);
    expect(whole.first).toBe(whole.second);
    expect(whole.first).not.toBe(account);
    expect(whole.count).toBe(12);
    expect(Object.hasOwn(whole, 'privateState')).toBe(false);
    const selected = wrapper.vm.getFieldsValue(['first', 'second', 'self.first']);
    expect(selected.first).toBe(selected.second);
    expect(selected.first).toBe(selected['self.first']);
  });

  it('数值框区分没有数字的输入、可过滤的数字和主动清空', async () => {
    const wrapper = mount(ExNumberInput, { props: { defaultValue: 12 } });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    await input.setValue('abc');
    await input.trigger('blur');
    expect(input.element.value).toBe('12');
    expect(wrapper.emitted('change')).toBeUndefined();
    await input.setValue('abc123');
    expect(input.element.value).toBe('123');
    await input.setValue('');
    expect(wrapper.emitted('change')).toEqual([
      [123, 12],
      [null, 123],
    ]);
  });

  it('数值提交被拒绝时显示确认值，同一轮新输入保留自己的草稿', async () => {
    const wrapper = mount(ExNumberInput, { props: { modelValue: 12 } });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    await input.trigger('focus');
    await input.setValue('23');
    await nextTick();
    expect(wrapper.emitted('change')).toEqual([[23, 12]]);
    expect(input.element.value).toBe('12');
    expect(input.attributes('aria-valuenow')).toBe('12');
    input.element.value = '24';
    input.element.dispatchEvent(new Event('input', { bubbles: true }));
    input.element.dispatchEvent(new Event('change', { bubbles: true }));
    input.element.value = '36.';
    input.element.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(input.element.value).toBe('36.');
  });

  it('原生重置恢复初始值并阻止浏览器再次重置 DOM', async () => {
    const model = reactive({ name: 'Neo' });
    const wrapper = mount(ExForm, {
      props: { model },
      slots: {
        default: () =>
          h(ExFormItem, { prop: 'name' }, () =>
            h(ExInput, {
              modelValue: model.name,
              'onUpdate:modelValue': v => (model.name = String(v)),
            })
          ),
      },
    });
    wrappers.push(wrapper);
    await wrapper.get('input').setValue('Trinity');
    wrapper.get('form').element.reset();
    await nextTick();
    expect((wrapper.emitted('reset')?.[0]?.[0] as Event).defaultPrevented).toBe(true);
    expect(wrapper.get('input').element.value).toBe('Neo');
    expect(model.name).toBe('Neo');
  });

  it('整表与指定路径返回隔离快照，保留路径的扁平键', () => {
    const model = reactive({ account: { roles: ['user'] } });
    const wrapper = mount(ExForm, { props: { model } });
    wrappers.push(wrapper);
    const all = wrapper.vm.getFieldsValue();
    const selected = wrapper.vm.getFieldsValue(['account.roles']);
    (all.account as typeof model.account).roles.push('editor');
    (selected['account.roles'] as string[]).push('admin');
    expect(model.account.roles).toEqual(['user']);
  });

  it.each([
    { number: true, draft: '1.0', confirmed: 1 },
    { number: true, draft: '12.', confirmed: 12 },
    { number: false, draft: 'John ', confirmed: 'John' },
  ])('聚焦时保留修饰符草稿 $draft，失焦恢复模型表示', async ({ number, draft, confirmed }) => {
    const value = ref<string | number>('');
    const wrapper = mount({
      render: () =>
        h(ExInput, {
          modelValue: value.value,
          modelModifiers: number ? { number: true } : { trim: true },
          'onUpdate:modelValue': v => (value.value = v),
        }),
    });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    await input.trigger('focus');
    input.element.value = draft;
    await input.trigger('input');
    await nextTick();
    expect(value.value).toBe(confirmed);
    expect(input.element.value).toBe(draft);
    await input.trigger('blur');
    expect(input.element.value).toBe(String(confirmed));
  });

  it('动态插槽可以换名并撤销，字段校验成功仍显示帮助文本', async () => {
    const slot = ref('prefix');
    const wrapper = mount({
      components: { ExInput, ExFormItem },
      setup: () => ({ slot }),
      template: `<ExFormItem validate-status="success"><ExInput help-text="保留字段说明">
        <template #[slot]><span>标记</span></template>
      </ExInput></ExFormItem>`,
    });
    wrappers.push(wrapper);
    expect(wrapper.find('.ex-input__prefix').exists()).toBe(true);
    slot.value = 'suffix';
    await nextTick();
    expect(wrapper.find('.ex-input__prefix').exists()).toBe(false);
    expect(wrapper.get('.ex-input__suffix').text()).toContain('标记');
    expect(wrapper.text()).toContain('保留字段说明');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('非受控数值框保存输入、连续步进并重置为默认值', async () => {
    const wrapper = mount({
      components: { ExForm, ExFormItem, ExNumberInput },
      template: `<ExForm :model="{}"><ExFormItem prop="count">
        <ExNumberInput :default-value="5" /></ExFormItem></ExForm>`,
    });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    expect(input.element.value).toBe('5');
    await input.setValue('42');
    await input.trigger('blur');
    const up = wrapper.get('.ex-number-input__button--increase');
    await up.trigger('click');
    await up.trigger('click');
    expect(input.element.value).toBe('44');
    wrapper.getComponent(ExForm).vm.resetFields();
    await nextTick();
    expect(input.element.value).toBe('5');
    expect(input.attributes('aria-valuenow')).toBe('5');
  });

  it('无效数值草稿在确认时回滚且不发布旧值变更', async () => {
    const wrapper = mount(ExNumberInput, { props: { modelValue: 12 } });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    await input.setValue('1.2.3');
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(input.element.value).toBe('12');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    wrapper.get('.ex-number-input__button--increase').element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
