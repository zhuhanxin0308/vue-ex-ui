import { mount } from '@vue/test-utils';
import { defineComponent, effectScope, h, nextTick, ref } from 'vue';
import { useEventListener } from '../../src/composables/useEventListener';

describe('useEventListener 作用域与响应式目标', () => {
  it('独立作用域立即监听并在停止后解绑', () => {
    const target = document.createElement('button');
    const listener = vi.fn();
    const scope = effectScope();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      scope.run(() => useEventListener(target, 'click', listener));
      target.click();
      expect(listener).toHaveBeenCalledOnce();
      scope.stop();
      target.click();
      expect(listener).toHaveBeenCalledOnce();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      scope.stop();
      warn.mockRestore();
    }
  });

  it('模板引用替换后仅绑定新元素，并在卸载时清理', async () => {
    const listener = vi.fn();
    const visible = ref(true);
    const revision = ref(0);
    const Probe = defineComponent({
      setup() {
        const target = ref<HTMLButtonElement>();
        useEventListener(target, 'click', listener);
        return () =>
          visible.value ? h('button', { ref: target, key: revision.value }, '操作') : null;
      },
    });
    const wrapper = mount(Probe);
    await nextTick();
    const first = wrapper.get('button').element;
    first.click();
    expect(listener).toHaveBeenCalledTimes(1);
    revision.value += 1;
    await nextTick();
    const second = wrapper.get('button').element;
    first.click();
    second.click();
    expect(listener).toHaveBeenCalledTimes(2);
    visible.value = false;
    await nextTick();
    second.click();
    expect(listener).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('getter 目标与手动停止函数不会遗留监听或重新绑定', async () => {
    const first = document.createElement('button');
    const second = document.createElement('button');
    const target = ref<HTMLElement | undefined>(first);
    const listener = vi.fn();
    const stop = useEventListener(() => target.value, 'click', listener, { capture: true });
    first.click();
    expect(listener).toHaveBeenCalledOnce();
    stop();
    stop();
    target.value = second;
    await nextTick();
    first.click();
    second.click();
    expect(listener).toHaveBeenCalledOnce();
  });
});
