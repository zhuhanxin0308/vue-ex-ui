import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, markRaw, nextTick } from 'vue';
import ExBackTop from '../../../src/components/back-top/ExBackTop.vue';

describe('返回顶部进度与控制', () => {
  it('强制显隐跨滚动帧保留，更换阈值后重新跟随滚动', async () => {
    const target = document.createElement('div');
    target.scrollTop = 250;
    let frame: FrameRequestCallback | undefined;
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frame = callback;
      return 1;
    });
    const wrapper = mount(ExBackTop, { props: { target, animation: 'none' } });
    try {
      wrapper.vm.hide();
      target.dispatchEvent(new Event('scroll'));
      frame!(0);
      await nextTick();
      expect(wrapper.vm.getElement()).toBeNull();
      target.scrollTop = 0;
      wrapper.vm.show();
      target.dispatchEvent(new Event('scroll'));
      frame!(16);
      await nextTick();
      expect(wrapper.vm.getElement()).not.toBeNull();
      expect(wrapper.emitted('visibility-change')).toEqual([[true], [false], [true]]);
      await wrapper.setProps({ visibilityHeight: 100 });
      expect(wrapper.vm.getElement()).toBeNull();
    } finally {
      wrapper.unmount();
      request.mockRestore();
    }
  });

  it('按百分比阈值展示，切换进度样式并允许自定义图标', async () => {
    const target = document.createElement('div');
    Object.defineProperties(target, {
      scrollTop: { configurable: true, writable: true, value: 250 },
      scrollHeight: { value: 1000 },
      clientHeight: { value: 500 },
    });
    const Icon = markRaw(
      defineComponent({ render: () => h('span', { class: 'business-icon' }, '↑') })
    );
    const wrapper = mount(ExBackTop, {
      props: {
        target,
        visibilityPercent: 40,
        showProgress: true,
        showPercent: true,
        text: '返回',
        icon: Icon,
        animation: 'none',
        style: { color: 'red' },
      },
      attachTo: document.body,
    });
    await nextTick();
    expect(document.querySelector('.ex-back-top__ring')).not.toBeNull();
    expect(document.querySelector('.ex-back-top__percent')?.textContent?.trim()).toBe('50%');
    expect(document.querySelector('.business-icon')).not.toBeNull();
    await wrapper.setProps({ progressType: 'line', icon: 'arrow-up-line' });
    expect(document.querySelector<HTMLElement>('.ex-back-top__line-fill')?.style.width).toBe('50%');
    wrapper.vm.hide();
    await nextTick();
    expect(wrapper.vm.getElement()).toBeNull();
    wrapper.vm.show();
    await nextTick();
    expect(wrapper.vm.getElement()).toBe(document.querySelector('.ex-back-top'));
    await wrapper.setProps({
      target: () => target,
      visibilityPercent: Number.NaN,
      visibilityHeight: Number.NaN,
    });
    expect(document.querySelector('.ex-back-top')).not.toBeNull();
    wrapper.unmount();
  });
});
