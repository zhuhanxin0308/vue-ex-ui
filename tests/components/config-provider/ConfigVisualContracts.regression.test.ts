import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import ExConfigProvider from '../../../src/components/config-provider/ExConfigProvider.vue';
import {
  useAnimation,
  useConfigTheme,
  useGlobalSize,
  useNeonEffect,
  useThemeOverrides,
  useZIndex,
  useZIndexLayer,
} from '../../../src/components/config-provider/composables';
import { useI18n } from '../../../src/locale';

vi.mock('../../../src/locale', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/locale')>();
  return { ...original, useI18n: vi.fn(original.useI18n) };
});

afterEach(() => vi.clearAllMocks());

describe('视觉配置的依赖边界和 Vue 样式契约', () => {
  it('主题、尺寸、效果与层级钩子不初始化语言服务', () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          const values = [
            useConfigTheme(),
            useGlobalSize(),
            useThemeOverrides(),
            useAnimation(),
            useNeonEffect(),
            useZIndex(),
            useZIndexLayer('tooltip'),
          ];
          return () => h('div', values.map(value => JSON.stringify(value.value)).join('|'));
        },
      })
    );
    expect(useI18n).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('medium');
    expect(wrapper.text()).toContain('1090');
    wrapper.unmount();
  });

  it('递归合并对象、字符串和嵌套数组样式，后面的外部声明优先', async () => {
    const wrapper = mount(ExConfigProvider, {
      props: {
        style: [
          { display: 'block', minHeight: '100px', '--ex-color-primary': 'red' },
          ['min-height: 200px', { backgroundColor: 'blue', '--ex-color-primary': 'green' }],
          false,
        ],
      },
    });
    const element = wrapper.element as HTMLElement;
    expect(element.style.display).toBe('block');
    expect(element.style.minHeight).toBe('200px');
    expect(element.style.backgroundColor).toBe('blue');
    expect(element.style.getPropertyValue('--ex-color-primary')).toBe('green');
    expect(element.style.getPropertyValue('--ex-z-index-base')).toBe('1000');
    await wrapper.setProps({ style: 'display: grid; min-height: 300px' });
    expect(element.style.display).toBe('grid');
    expect(element.style.minHeight).toBe('300px');
    expect(element.style.backgroundColor).toBe('');
    wrapper.unmount();
  });
});
