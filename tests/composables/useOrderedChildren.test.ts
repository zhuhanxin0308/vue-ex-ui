import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useOrderedChildren } from '../../src/composables/useOrderedChildren';

afterEach(() => vi.unstubAllGlobals());

it('未安装观察器时保留预注册项，新元素就绪后按实际顺序定位并允许重复清理', async () => {
  vi.stubGlobal('MutationObserver', undefined);
  const first = Symbol('first');
  const last = Symbol('last');
  const ready = ref(false);
  const Host = defineComponent({
    setup() {
      const root = ref<HTMLElement>();
      const order = useOrderedChildren(root);
      order.register({
        uid: last,
        getElement: () => root.value?.querySelector<HTMLElement>('[data-last]') ?? null,
      });
      order.register({ uid: first, getElement: () => null });
      const connect = () => {
        order.register({
          uid: first,
          getElement: () => root.value?.querySelector<HTMLElement>('[data-first]') ?? null,
        });
        ready.value = true;
      };
      return { root, order, connect, ready };
    },
    render() {
      return h('section', { ref: 'root' }, [
        this.ready ? h('span', { 'data-first': '' }, '前项') : null,
        h('span', { 'data-last': '' }, '后项'),
      ]);
    },
  });
  const wrapper = mount(Host);
  expect(wrapper.vm.order.indexOf(last)).toBe(0);
  wrapper.vm.connect();
  await nextTick();
  expect(wrapper.vm.order.indexOf(first)).toBe(0);
  expect(wrapper.vm.order.indexOf(last)).toBe(1);
  wrapper.vm.order.unregister(first);
  wrapper.vm.order.unregister(first);
  expect(wrapper.vm.order.indexOf(last)).toBe(0);
  wrapper.unmount();
});
