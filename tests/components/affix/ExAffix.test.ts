import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import ExAffix from '../../../src/components/affix/ExAffix.vue';
import ExConfigProvider from '../../../src/components/config-provider/ExConfigProvider.vue';
import type { ExAffixExposed } from '../../../src/components/affix/types';

const rect = (values: Partial<DOMRect>): DOMRect =>
  ({
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...values,
  }) as DOMRect;

describe('ExAffix', () => {
  it('默认吸顶时占位容器保持流式宽度，固定内容跟随布局重新测量', async () => {
    const wrapper = mount(ExAffix);
    const placeholder = wrapper.element as HTMLElement;
    let layoutWidth = 300;
    vi.spyOn(placeholder, 'getBoundingClientRect').mockImplementation(() =>
      rect({ top: -5, width: parseFloat(placeholder.style.width) || layoutWidth })
    );
    wrapper.vm.updatePosition();
    await nextTick();
    const content = wrapper.get<HTMLElement>('.ex-affix__content').element;
    expect(content.style.width).toBe('300px');
    layoutWidth = 180;
    wrapper.vm.updatePosition();
    await nextTick();
    expect(content.style.width).toBe('180px');
    wrapper.unmount();
  });

  it('固有宽度布局中保留固定控件的占位，并按新的可用空间重新测量', async () => {
    const wrapper = mount(ExAffix, { slots: { default: () => h('input') } });
    const placeholder = wrapper.element as HTMLElement;
    const content = wrapper.get<HTMLElement>('.ex-affix__content').element;
    const input = wrapper.get('input').element;
    let availableWidth = 180;
    const intrinsicWidth = 240;
    // 模拟收缩包裹布局：只有处于普通流的子节点才贡献固有宽度。
    const layout = () => {
      const widths = Array.from(placeholder.children, child => {
        const { style } = child as HTMLElement;
        if (style.position === 'fixed' || style.display === 'none') return 0;
        return child === content ? intrinsicWidth : parseFloat(style.width) || 0;
      });
      return rect({ top: -5, width: Math.min(availableWidth, Math.max(...widths)) });
    };
    vi.spyOn(placeholder, 'getBoundingClientRect').mockImplementation(layout);
    wrapper.vm.updatePosition();
    await nextTick();
    expect(content.style.width).toBe('180px');
    expect(layout().width).toBe(180);
    availableWidth = 300;
    wrapper.vm.updatePosition();
    await nextTick();
    expect(content.style.width).toBe('240px');
    expect(layout().width).toBe(240);
    expect(wrapper.get('input').element).toBe(input);
    wrapper.unmount();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('在自定义滚动容器中使用视口坐标设置顶部固定位置', async () => {
    const target = document.createElement('div');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 100, bottom: 500, left: 50, right: 550, width: 500, height: 400 })
    );
    const wrapper = mount(ExAffix, {
      props: { offsetTop: 10, target: () => target },
      slots: { default: 'content' },
    });
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 105, bottom: 145, left: 120, right: 320, width: 200, height: 40 })
    );
    vi.spyOn(wrapper.get('.ex-affix__content').element, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 105, bottom: 145, left: 120, right: 320, width: 200, height: 40 })
    );

    (wrapper.vm as unknown as ExAffixExposed).updatePosition();
    await nextTick();

    const content = wrapper.find('.ex-affix__content');
    expect(content.classes()).toContain('is-fixed');
    expect(content.attributes('style')).toContain('top: 110px');
    expect(content.attributes('style')).toContain('left: 120px');
    expect(wrapper.attributes('style')).toContain('height: 40px');
  });

  it('在自定义滚动容器中把底部偏移换算为视口 bottom', async () => {
    const target = document.createElement('div');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 100, bottom: 500, left: 50, right: 550, width: 500, height: 400 })
    );
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const wrapper = mount(ExAffix, {
      props: { offsetBottom: 20, target: () => target },
    });
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(
      rect({ top: 450, bottom: 490, left: 120, right: 320, width: 200, height: 40 })
    );

    (wrapper.vm as unknown as ExAffixExposed).updatePosition();
    await nextTick();

    expect(wrapper.find('.ex-affix__content').attributes('style')).toContain('bottom: 320px');
  });

  it('卸载时取消尚未执行的布局帧', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const wrapper = mount(ExAffix, { props: { offsetTop: 0 } });

    window.dispatchEvent(new Event('resize'));
    wrapper.unmount();

    expect(cancel).toHaveBeenCalledOnce();
  });

  it('祖先滚动容器滚动时重新计算固定状态', async () => {
    const scrollParent = document.createElement('div');
    scrollParent.style.overflow = 'auto';
    document.body.appendChild(scrollParent);
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frame = callback;
      return 1;
    });
    let elementTop = 100;
    const wrapper = mount(ExAffix, {
      attachTo: scrollParent,
      slots: { default: 'content' },
    });
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockImplementation(() =>
      rect({ top: elementTop, bottom: elementTop + 40, left: 20, width: 100, height: 40 })
    );
    await wrapper.setProps({ offsetTop: 0 });
    expect(wrapper.find('.ex-affix__content').classes()).not.toContain('is-fixed');

    elementTop = -10;
    scrollParent.dispatchEvent(new Event('scroll'));
    frame?.(0);
    await nextTick();

    expect(wrapper.find('.ex-affix__content').classes()).toContain('is-fixed');
    wrapper.unmount();
  });

  it('尺寸观察器在内容布局变化后更新定位', async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frame = callback;
      return 1;
    });
    let elementTop = 100;
    const wrapper = mount(ExAffix, { slots: { default: 'content' } });
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockImplementation(() =>
      rect({ top: elementTop, bottom: elementTop + 40, left: 20, width: 100, height: 40 })
    );
    await wrapper.setProps({ offsetTop: 0 });

    elementTop = -10;
    resizeCallback?.([], {} as ResizeObserver);
    frame?.(0);
    await nextTick();

    expect(observe).toHaveBeenCalledWith(wrapper.element);
    expect(wrapper.find('.ex-affix__content').classes()).toContain('is-fixed');
    wrapper.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('省略自定义层级时继承 ConfigProvider 的 sticky 语义层', async () => {
    const wrapper = mount(ExConfigProvider, {
      props: { zIndex: 2400 },
      slots: { default: () => h(ExAffix, { offsetTop: 0 }, { default: () => 'content' }) },
    });
    const affix = wrapper.findComponent(ExAffix);

    (affix.vm as unknown as ExAffixExposed).updatePosition();
    await nextTick();

    expect(affix.get('.ex-affix__content').attributes('style')).toContain('z-index: 2420');
  });
});
