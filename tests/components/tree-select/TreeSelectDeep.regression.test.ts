import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import ExTreeSelect from '../../../src/components/tree-select/ExTreeSelect.vue';
import type { TreeSelectNode } from '../../../src/components/tree-select/types';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('深层树数据索引和半选状态', () => {
  it.each([32, 64, 128].flatMap(depth => [false, true].map(expanded => ({ depth, expanded }))))(
    '重载浅分支时无关 $depth 层深链保持线性访问：展开 $expanded',
    async ({ depth, expanded }) => {
      let chain: TreeSelectNode = { value: depth, label: '末叶' };
      for (let value = depth - 1; value > 0; value--) {
        chain = { value, label: String(value), children: [chain] };
      }
      const loader = vi.fn(async () => []);
      const wrapper = mount(ExTreeSelect, {
        props: {
          data: [{ value: 'target', label: '重载目标', isLeaf: false }, chain],
          loadData: loader,
          filterable: true,
          teleported: false,
        },
      });
      wrappers.push(wrapper);
      await wrapper.get('[role="combobox"]').trigger('click');
      if (expanded) await wrapper.get('.ex-tree-select__search input').setValue('末叶');
      expect(loader).not.toHaveBeenCalled();
      const originalGet = WeakMap.prototype.get;
      let parentReads = 0;
      const spy = vi.spyOn(WeakMap.prototype, 'get').mockImplementation(function (
        this: WeakMap<object, unknown>,
        key: WeakKey
      ) {
        // 只计索引条目的父链访问，排除 Vue 自身的响应式缓存读取。
        if (
          typeof key === 'object' &&
          key &&
          Object.hasOwn(key, 'path') &&
          Object.hasOwn(key, 'source')
        ) {
          if (typeof (key as { node: TreeSelectNode }).node.value === 'number') parentReads++;
        }
        return originalGet.call(this, key);
      });
      try {
        expect(await wrapper.vm.reloadNode('target')).toBe(true);
        await nextTick();
        expect(loader).toHaveBeenCalledOnce();
        expect(wrapper.emitted('load')).toHaveLength(1);
        expect(parentReads).toBeLessThanOrEqual(depth * 2);
      } finally {
        spy.mockRestore();
      }
    }
  );

  it('一万层树初始化和已选节点显示不依赖调用栈深度', () => {
    let node: TreeSelectNode = { value: 9999, label: '末级节点' };
    for (let value = 9998; value >= 0; value--)
      node = { value, label: `节点${value}`, children: [node] };
    // 通过真实父组件传参，避免测试工具自身递归检查深层 props 干扰组件验证。
    const wrapper = mount({ render: () => h(ExTreeSelect, { modelValue: 9999, data: [node] }) });
    wrappers.push(wrapper);
    expect(wrapper.text()).toContain('末级节点');
  });

  it('后代选择驱动祖先半选，搜索保留祖先且不修改选择', async () => {
    const wrapper = mount(ExTreeSelect, {
      props: {
        multiple: true,
        modelValue: ['leaf'],
        filterable: true,
        data: [
          {
            value: 'parent',
            label: '父级',
            children: [
              { value: 'leaf', label: '叶子' },
              { value: 'other', label: '其他' },
            ],
          },
        ],
      },
      attachTo: document.body,
    });
    wrappers.push(wrapper);
    await wrapper.get('[role="combobox"]').trigger('click');
    const parent = document.querySelector('[role="treeitem"]')!;
    expect(parent.getAttribute('aria-checked')).toBe('mixed');
    const input = document.querySelector<HTMLInputElement>('.ex-tree-select__search input')!;
    input.value = '叶子';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const nodes = [...document.querySelectorAll('[role="treeitem"]')];
    expect(nodes.map(item => item.getAttribute('aria-checked'))).toEqual(['mixed', 'true']);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
