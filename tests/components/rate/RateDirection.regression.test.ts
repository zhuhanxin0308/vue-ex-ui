import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { compile } from 'sass-embedded';
import ExRate from '../../../src/components/rate/ExRate.vue';

const STAR_LEFT = 100;
const STAR_WIDTH = 20;
const wrappers: Array<ReturnType<typeof mount>> = [];
const style = document.createElement('style');

beforeAll(() => {
  // 使用真实 Sass 检查裁剪方向，几何中心另由浏览器用例验收。
  style.textContent = compile('src/components/rate/ExRate.scss').css;
  document.head.append(style);
});
afterAll(() => style.remove());

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function createRate(direction: 'ltr' | 'rtl', props = {}) {
  const host = document.createElement('section');
  host.dir = direction;
  document.body.append(host);
  const wrapper = mount(ExRate, {
    props: { allowHalf: true, ...props },
    attachTo: host,
  });
  wrappers.push(wrapper);
  const star = wrapper.get('.ex-rate__star');
  vi.spyOn(star.element, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(STAR_LEFT, 0, STAR_WIDTH, STAR_WIDTH)
  );
  return { wrapper, star, host };
}

describe('评分继承宿主的文字方向', () => {
  it.each(['ltr', 'rtl'] as const)('%s 只读半星从起始侧裁剪，整数不裁剪', async direction => {
    const { wrapper, star, host } = createRate(direction, { modelValue: 0.5, readonly: true });
    const icon = star.get('.ex-rate__icon--active').element;
    expect(getComputedStyle(icon).clipPath).toBe(
      direction === 'rtl' ? 'inset(0 0 0 50%)' : 'inset(0 50% 0 0)'
    );
    host.dir = direction === 'rtl' ? 'ltr' : 'rtl';
    expect(getComputedStyle(icon).clipPath).toBe(
      direction === 'rtl' ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)'
    );
    await wrapper.setProps({ modelValue: 1 });
    expect(getComputedStyle(icon).clipPath).toBe('');
  });

  it.each(['ltr', 'rtl'] as const)('%s 半星命中和悬停使用起始侧', async direction => {
    const { wrapper, star } = createRate(direction);
    const leadingX = STAR_LEFT + STAR_WIDTH * (direction === 'rtl' ? 0.75 : 0.25);
    const trailingX = STAR_LEFT + STAR_WIDTH * (direction === 'rtl' ? 0.25 : 0.75);
    await star.trigger('mouseenter');
    await star.trigger('mousemove', { clientX: leadingX });
    expect(star.classes()).toContain('is-half');
    await star.trigger('click', { clientX: leadingX });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([0.5]);
    await star.trigger('mousemove', { clientX: trailingX });
    expect(star.classes()).toContain('is-active');
    await star.trigger('click', { clientX: trailingX });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1]);
  });

  for (const direction of ['ltr', 'rtl'] as const) {
    it.each([false, true])(`${direction} 整星与半星键盘保持视觉方向：半星=%s`, async allowHalf => {
      const { wrapper } = createRate(direction, { allowHalf });
      const increment = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const decrement = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      const step = allowHalf ? 0.5 : 1;
      for (const [key, value] of [
        [increment, step],
        ['ArrowUp', step * 2],
        [decrement, step],
        ['ArrowDown', 0],
        ['End', 5],
        ['Home', 0],
      ] as const) {
        await wrapper.trigger('keydown', { key });
        expect(wrapper.attributes('aria-valuenow')).toBe(String(value));
      }
    });
  }

  it('宿主动态切换方向后，命中与键盘立即跟随且只读保持原值', async () => {
    const { wrapper, star, host } = createRate('ltr');
    await star.trigger('click', { clientX: STAR_LEFT + STAR_WIDTH * 0.75 });
    expect(wrapper.attributes('aria-valuenow')).toBe('1');
    host.dir = 'rtl';
    await star.trigger('click', { clientX: STAR_LEFT + STAR_WIDTH * 0.75 });
    expect(wrapper.attributes('aria-valuenow')).toBe('0.5');
    await wrapper.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.attributes('aria-valuenow')).toBe('1');
    await wrapper.setProps({ readonly: true });
    await star.trigger('click', { clientX: STAR_LEFT + STAR_WIDTH * 0.75 });
    await wrapper.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.attributes('aria-valuenow')).toBe('1');
  });
});
