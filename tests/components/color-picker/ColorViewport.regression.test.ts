import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ExColorPicker from '../../../src/components/color-picker/ExColorPicker.vue';

const VIEWPORT_HEIGHT = 375;
const VIEWPORT_EDGE = 8;
const wrappers: Array<ReturnType<typeof mount>> = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('选色面板的视口高度预算', () => {
  it('长色板以视口预算限制盒高，再定位到安全边缘', async () => {
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(VIEWPORT_HEIGHT);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    const wrapper = mount(ExColorPicker, {
      props: { predefine: Array.from({ length: 64 }, () => '#ff0000') },
      attachTo: document.body,
    });
    wrappers.push(wrapper);
    await wrapper.get('.ex-color-picker__trigger').trigger('click');
    await nextTick();
    const panel = document.querySelector<HTMLElement>('.ex-color-picker__panel')!;
    expect(panel.style.maxHeight).toBe(`${VIEWPORT_HEIGHT - VIEWPORT_EDGE * 2}px`);
    expect(panel.style.top).toBe(`${VIEWPORT_EDGE}px`);
  });
});
