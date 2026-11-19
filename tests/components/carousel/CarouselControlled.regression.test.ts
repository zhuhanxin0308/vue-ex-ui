import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import ExCarousel from '../../../src/components/carousel/ExCarousel.vue';
import ExCarouselItem from '../../../src/components/carousel/ExCarouselItem.vue';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.useRealTimers();
});
const slots = {
  default: () => ['a', 'b', 'c'].map(name => h(ExCarouselItem, { key: name }, () => name)),
};

describe('Carousel 严格受控', () => {
  it('RTL 模式物理左键和向右滑动均请求逻辑下一页', async () => {
    const wrapper = mount(ExCarousel, { props: { modelValue: 1, autoplay: false }, slots });
    wrappers.push(wrapper);
    wrapper.element.style.direction = 'rtl';
    await wrapper.trigger('keydown', { key: 'ArrowLeft' });
    const track = wrapper.get('.ex-carousel__track');
    await track.trigger('touchstart', { touches: [{ clientX: 0, clientY: 5 }] });
    await track.trigger('touchend', { changedTouches: [{ clientX: 100, clientY: 5 }] });
    expect(wrapper.emitted('update:modelValue')).toEqual([[2], [2]]);
  });

  it('聚焦轮播后按方向切换或跳至首尾，内部控件独立处理按键', async () => {
    const wrapper = mount(ExCarousel, {
      props: {
        modelValue: 1,
        autoplay: false,
        height: 240,
        style: [{ minHeight: '80px' }, ['color: red']],
      },
      slots,
    });
    wrappers.push(wrapper);
    expect(wrapper.element.style.minHeight).toBe('80px');
    expect(wrapper.element.style.color).toBe('red');
    await wrapper.trigger('keydown', { key: 'ArrowLeft' });
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    await wrapper.trigger('keydown', { key: 'ArrowDown' });
    await wrapper.get('button').trigger('keydown', { key: 'Home' });
    await wrapper.setProps({ direction: 'vertical' });
    await wrapper.trigger('keydown', { key: 'ArrowUp' });
    await wrapper.trigger('keydown', { key: 'ArrowDown' });
    await wrapper.trigger('keydown', { key: 'Home' });
    await wrapper.trigger('keydown', { key: 'End' });
    expect(wrapper.emitted('update:modelValue')).toEqual([[0], [2], [0], [2], [0], [2]]);
  });

  it('按钮、指示器、公开方法只请求切换，被拒绝的请求不会产生过渡锁', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ExCarousel, {
      props: { modelValue: 0, autoplay: false, arrow: 'always' },
      slots,
    });
    wrappers.push(wrapper);
    await wrapper.get('.ex-carousel__arrow--next').trigger('click');
    expect(wrapper.get('.ex-carousel__track').attributes('style')).toContain('translateX(-0%)');
    wrapper.vm.goTo(2);
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[1], [2]]);
    expect(wrapper.findAll('.ex-carousel-item')[1].attributes('inert')).toBeDefined();
    await wrapper.setProps({ modelValue: 1 });
    expect(wrapper.get('.ex-carousel__track').attributes('style')).toContain('translateX(-100%)');
    expect(wrapper.emitted('change')).toEqual([
      [1, 0],
      [2, 0],
    ]);
    await vi.advanceTimersByTimeAsync(300);
    await wrapper.findAll('.ex-carousel__indicator')[2].trigger('click');
    await wrapper.setProps({ modelValue: undefined });
    expect(wrapper.get('.ex-carousel__track').attributes('style')).toContain('translateX(-100%)');
    wrapper.vm.prev();
    await nextTick();
    expect(wrapper.get('.ex-carousel__track').attributes('style')).toContain('translateX(-0%)');
  });

  it('自动播放只重复请求下一张，父级拒绝时不累计索引', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ExCarousel, { props: { modelValue: 0, interval: 500 }, slots });
    wrappers.push(wrapper);
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.emitted('update:modelValue')).toEqual([[1], [1], [1]]);
    expect(wrapper.findAll('.ex-carousel__indicator')[0].attributes('aria-current')).toBe('true');
    await wrapper.setProps({ modelValue: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2]);
  });
});
