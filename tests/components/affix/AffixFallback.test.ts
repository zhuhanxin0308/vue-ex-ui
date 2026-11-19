import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { shallowRef } from 'vue';
import ExAffix from '../../../src/components/affix/ExAffix.vue';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('固定容器异常与恢复', () => {
  it('稳定 getter 切换元素时移除旧监听并重新计算几何', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    const target = shallowRef<HTMLElement | Window>(first);
    const oldListener = vi.spyOn(first, 'removeEventListener');
    const newListener = vi.spyOn(second, 'addEventListener');
    const wrapper = mount(ExAffix, { props: { offsetTop: 0, target: () => target.value } });
    target.value = second;
    wrapper.vm.updatePosition();
    expect(oldListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(newListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    wrapper.unmount();
  });

  it('目标解析失败时回退窗口，没有 ResizeObserver 仍可迁移容器', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const wrapper = mount(ExAffix, {
      props: {
        offsetTop: 0,
        target: () => {
          throw new Error('容器未挂载');
        },
      },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.ex-affix__content').classes()).toContain('is-fixed');
    const target = document.createElement('div');
    const listener = vi.spyOn(target, 'addEventListener');
    await wrapper.setProps({ target: () => target });
    expect(listener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(wrapper.vm.getElement()).toBe(wrapper.element);
    await wrapper.setProps({ target: (() => null) as unknown as () => Window });
    expect(wrapper.get('.ex-affix__content').classes()).toContain('is-fixed');
    wrapper.unmount();
  });
});
