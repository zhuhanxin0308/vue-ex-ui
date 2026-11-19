import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { h, nextTick, reactive, ref } from 'vue';
import ExForm from '../../../src/components/form/ExForm.vue';
import ExFormItem from '../../../src/components/form/ExFormItem.vue';
import ExSelect from '../../../src/components/select/ExSelect.vue';
import ExTreeSelect from '../../../src/components/tree-select/ExTreeSelect.vue';
import ExCascader from '../../../src/components/cascader/ExCascader.vue';
import type { FormInstance } from '../../../src/components/form/types';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('选择器重置撤销搜索与节点加载', () => {
  it.each(['select', 'cascader'] as const)(
    '%s 重置后未收到旧组合结束时，普通方向键和 Escape 仍可使用',
    async kind => {
      const form = ref<FormInstance>();
      const options = [{ value: 'a', label: '甲' }];
      const wrapper = mount({
        render: () =>
          h(ExForm, { ref: form, model: { choice: null } }, () =>
            h(ExFormItem, { prop: 'choice' }, () =>
              kind === 'select'
                ? h(ExSelect, { searchable: true, options })
                : h(ExCascader, { filterable: true, options })
            )
          ),
      });
      wrappers.push(wrapper);
      const input = wrapper.get('input');
      await input.trigger('click');
      await input.trigger('compositionstart');
      form.value!.resetFields();
      await nextTick();
      await input.trigger('keydown', { key: 'ArrowDown', isComposing: true });
      await input.trigger('keydown', { key: 'ArrowDown', keyCode: 229 });
      expect(input.attributes('aria-expanded')).toBe('false');
      await input.trigger('keydown', { key: 'ArrowDown', isComposing: false });
      expect(input.attributes('aria-expanded')).toBe('true');
      await input.trigger('keydown', { key: 'Escape' });
      expect(input.attributes('aria-expanded')).toBe('false');
      await input.trigger('keydown', { key: 'Enter' });
      expect(input.attributes('aria-expanded')).toBe('true');
    }
  );

  it.each([true, false])('重置后只接受新组合：受控 %s', async controlled => {
    const form = ref<FormInstance>();
    const model = reactive({ choice: null });
    const queries: string[] = [];
    const wrapper = mount({
      render: () =>
        h(ExForm, { ref: form, model }, () =>
          h(ExFormItem, { prop: 'choice' }, () =>
            h(ExSelect, {
              modelValue: controlled ? model.choice : undefined,
              searchable: true,
              remote: true,
              remoteDebounce: 0,
              remoteLoader: async query => {
                queries.push(query);
                return [];
              },
            })
          )
        ),
    });
    wrappers.push(wrapper);
    const input = wrapper.get('input');
    await input.trigger('click');
    await input.trigger('compositionstart');
    form.value!.resetFields();
    await nextTick();
    input.element.value = '拼音';
    await input.trigger('compositionend');
    input.element.value = '拼音';
    await input.trigger('input', { inputType: 'insertFromComposition' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(queries).toEqual(['']);
    expect(input.element.value).toBe('');
    expect(input.attributes('aria-expanded')).toBe('false');
    await input.trigger('compositionstart');
    input.element.value = '新词';
    await input.trigger('compositionend');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(queries).toEqual(['', '新词']);
    await input.trigger('compositionstart');
    form.value!.resetFields();
    await nextTick();
    input.element.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText' }));
    input.element.value = 'fresh';
    input.element.dispatchEvent(new InputEvent('input', { inputType: 'insertText' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(queries.at(-1)).toBe('fresh');
    input.element.value = '过时';
    await input.trigger('compositionend');
    input.element.value = '过时';
    input.element.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(input.element.value).toBe('fresh');
    expect(queries).toEqual(['', '新词', 'fresh']);
  });

  it.each(['select', 'tree-select', 'cascader'] as const)(
    '%s 同值重置关闭面板，中止旧请求，重新打开仍可使用',
    async kind => {
      const form = ref<FormInstance>();
      const model = reactive({ choice: kind === 'cascader' ? [] : null });
      const signals: AbortSignal[] = [];
      const results: Array<(value: Array<{ value: string; label: string }>) => void> = [];
      const loader = vi.fn((_query: unknown, context: { signal: AbortSignal }) => {
        signals.push(context.signal);
        return new Promise<Array<{ value: string; label: string }>>(resolve =>
          results.push(resolve)
        );
      });
      const nodes = [{ value: 'root', label: '根', isLeaf: false }];
      const renderControl = () =>
        kind === 'select'
          ? h(ExSelect, { modelValue: null, searchable: true, remote: true, remoteLoader: loader })
          : kind === 'tree-select'
            ? h(ExTreeSelect, {
                modelValue: null,
                data: nodes,
                loadData: loader,
                teleported: false,
              })
            : h(ExCascader, {
                modelValue: [],
                options: nodes,
                loadData: loader,
                teleported: false,
              });
      const wrapper = mount({
        render: () =>
          h(ExForm, { ref: form, model }, () => h(ExFormItem, { prop: 'choice' }, renderControl)),
      });
      wrappers.push(wrapper);
      const open = async () => {
        await wrapper.get('[role="combobox"]').trigger('click');
        if (kind === 'tree-select') void wrapper.getComponent(ExTreeSelect).vm.reloadNode('root');
        if (kind === 'cascader') void wrapper.getComponent(ExCascader).vm.reloadNode(['root']);
        await nextTick();
      };
      await open();
      expect(signals).toHaveLength(1);
      form.value!.resetFields();
      await nextTick();
      expect(signals[0]?.aborted).toBe(true);
      expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false');
      results[0]!([{ value: 'stale', label: '旧结果' }]);
      await flushPromises();
      expect(wrapper.text()).not.toContain('旧结果');
      await open();
      expect(signals).toHaveLength(2);
      results[1]!([{ value: 'current', label: '新结果' }]);
      await flushPromises();
      const control =
        kind === 'select'
          ? wrapper.getComponent(ExSelect)
          : kind === 'tree-select'
            ? wrapper.getComponent(ExTreeSelect)
            : wrapper.getComponent(ExCascader);
      expect(control.emitted('update:modelValue')).toBeUndefined();
      if (kind !== 'select') expect(control.emitted('load')).toHaveLength(1);
    }
  );
});
