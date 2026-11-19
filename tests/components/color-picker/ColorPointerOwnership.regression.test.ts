import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ExColorPicker from '../../../src/components/color-picker/ExColorPicker.vue';

const OWNER_POINTER = 11;
const OTHER_POINTER = 22;
const TRACK_SIZE = 100;
const wrappers: Array<ReturnType<typeof mount>> = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function pointer(type: string, pointerId = OWNER_POINTER, options: PointerEventInit = {}) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId,
    pointerType: 'touch',
    clientX: TRACK_SIZE / 2,
    clientY: TRACK_SIZE / 2,
    ...options,
  });
}

async function createPicker(part: string) {
  const wrapper = mount(ExColorPicker, {
    props: { modelValue: '#ff0000', showAlpha: true, teleported: false },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await wrapper.get('.ex-color-picker__trigger').trigger('click');
  const track = wrapper.get<HTMLElement>(`.ex-color-picker__${part}`).element;
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, TRACK_SIZE, TRACK_SIZE)
  );
  return { wrapper, track };
}

describe('选色拖动的指针所有权', () => {
  for (const part of ['sv', 'hue', 'alpha']) {
    it.each([1, 2])(`${part} 忽略鼠标辅助键 %i`, async button => {
      const { wrapper, track } = await createPicker(part);
      const down = pointer('pointerdown', OWNER_POINTER, { pointerType: 'mouse', button });
      track.dispatchEvent(down);
      window.dispatchEvent(pointer('pointerup'));
      expect(down.defaultPrevented).toBe(false);
      expect(wrapper.emitted('active-change')).toBeUndefined();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      expect(wrapper.emitted('change')).toBeUndefined();
    });

    it.each(['pointerup', 'pointercancel'])(
      `${part} 忽略第二指针的按下、移动和 %s 并保留发起指针`,
      async ending => {
        const { wrapper, track } = await createPicker(part);
        track.dispatchEvent(pointer('pointerdown'));
        const initial = wrapper.emitted('active-change')!.at(-1);
        track.dispatchEvent(pointer('pointerdown', OTHER_POINTER, { clientX: 25 }));
        window.dispatchEvent(pointer('pointermove', OTHER_POINTER, { clientX: 75 }));
        window.dispatchEvent(pointer(ending, OTHER_POINTER));
        expect(wrapper.emitted('active-change')).toEqual([initial]);
        expect(wrapper.emitted('change')).toBeUndefined();

        window.dispatchEvent(pointer('pointermove', OWNER_POINTER, { clientX: 75 }));
        expect(wrapper.emitted('active-change')).toHaveLength(2);
        window.dispatchEvent(pointer('pointerup'));
        expect(wrapper.emitted('change')).toEqual([wrapper.emitted('active-change')!.at(-1)]);
        window.dispatchEvent(pointer('pointermove', OWNER_POINTER, { clientX: 90 }));
        expect(wrapper.emitted('active-change')).toHaveLength(2);
      }
    );
  }

  it.each(['mouse', 'touch', 'pen'])('%s 发起指针正常释放只提交一次', async pointerType => {
    const { wrapper, track } = await createPicker('hue');
    track.dispatchEvent(pointer('pointerdown', OWNER_POINTER, { pointerType }));
    window.dispatchEvent(pointer('pointerup', OWNER_POINTER, { pointerType }));
    window.dispatchEvent(pointer('pointerup', OWNER_POINTER, { pointerType }));
    expect(wrapper.emitted('change')).toEqual([['#00ffffff']]);
  });

  it('首次颜色变更的业务回调同步卸载时也清除会话监听', async () => {
    const { wrapper, track } = await createPicker('hue');
    await wrapper.setProps({ 'onActive-change': () => wrapper.unmount() });
    const removed = vi.spyOn(window, 'removeEventListener');
    track.dispatchEvent(pointer('pointerdown'));
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'blur']) {
      expect(removed).toHaveBeenCalledWith(type, expect.any(Function));
    }
  });

  it.each(['pointercancel', 'blur', 'unmount'])('%s 取消拖动后不再写值或提交', async ending => {
    const { wrapper, track } = await createPicker('hue');
    track.dispatchEvent(pointer('pointerdown'));
    if (ending === 'unmount') {
      const removeListener = vi.spyOn(window, 'removeEventListener');
      wrapper.unmount();
      wrappers.splice(wrappers.indexOf(wrapper), 1);
      for (const type of ['pointermove', 'pointerup', 'pointercancel', 'blur']) {
        expect(removeListener).toHaveBeenCalledWith(type, expect.any(Function));
      }
      return;
    } else if (ending === 'blur') window.dispatchEvent(new Event('blur'));
    else window.dispatchEvent(pointer('pointercancel'));
    window.dispatchEvent(pointer('pointermove', OWNER_POINTER, { clientX: 75 }));
    window.dispatchEvent(pointer('pointerup'));
    expect(wrapper.emitted('active-change')).toHaveLength(1);
    expect(wrapper.emitted('change')).toBeUndefined();
  });
});
