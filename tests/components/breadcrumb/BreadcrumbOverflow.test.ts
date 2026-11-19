import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import ExBreadcrumb from '../../../src/components/breadcrumb/ExBreadcrumb.vue';
import ExBreadcrumbItem from '../../../src/components/breadcrumb/ExBreadcrumbItem.vue';

describe('面包屑折叠与导航边界', () => {
  it('声明式子项支持内容插槽与当前页，父级监听器可拦截浏览器导航', () => {
    const home = { label: '首页', path: '#home' };
    const wrapper = mount(ExBreadcrumb, {
      props: { separator: '→', onClick: (_item, _index, event) => event.preventDefault() },
      slots: {
        default: () => [
          h(ExBreadcrumbItem, { item: home }, () => h('strong', '主页')),
          h(ExBreadcrumbItem, {}, '当前'),
        ],
      },
    });
    const event = new MouseEvent('click', { cancelable: true, bubbles: true });
    wrapper.get('a').element.dispatchEvent(event);
    expect(wrapper.get('strong').text()).toBe('主页');
    expect(wrapper.get('[aria-current="page"]').text()).toBe('当前');
    expect(wrapper.get('.ex-breadcrumb-item__separator').text()).toBe('→');
    expect(wrapper.emitted('click')).toEqual([[home, 0, event]]);
    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('折叠导航保留原始索引并将图标与分隔符传给首尾项目', async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      label: `第${index}级`,
      path: `#level-${index}`,
    }));
    const wrapper = mount(ExBreadcrumb, {
      props: { items, maxItems: 3 },
      slots: {
        icon: ({ index }: { index: number }) => h('i', { class: 'path-icon' }, String(index)),
        separator: () => h('span', { class: 'path-divider' }, '→'),
      },
    });
    expect(wrapper.findAll('.path-icon').map(icon => icon.text())).toEqual(['0', '3', '4']);
    expect(wrapper.findAll('.path-divider')).toHaveLength(3);
    await wrapper.findAll('a')[1]!.trigger('click');
    expect(wrapper.emitted('click')?.at(-1)).toEqual([items[3], 3, expect.any(MouseEvent)]);
    await wrapper.setProps({ maxItems: 10 });
    expect(wrapper.find('.ex-breadcrumb__ellipsis').exists()).toBe(false);
    expect(wrapper.findAll('.path-icon')).toHaveLength(5);
    await wrapper.setProps({ clickable: false });
    expect(wrapper.find('a').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 2.9])(
    '异常数量 %s 不丢失首尾导航且空数据可恢复',
    async maxItems => {
      const wrapper = mount(ExBreadcrumb, {
        props: {
          maxItems,
          separator: '',
          items: [{ label: '根', path: '#root' }, { label: '中间' }, { label: '当前' }],
        },
      });
      expect(wrapper.findAll('.ex-breadcrumb-item')).toHaveLength(2);
      expect(wrapper.get('[aria-current="page"]').text()).toBe('当前');
      await wrapper.setProps({ items: [] });
      expect(wrapper.find('.ex-breadcrumb__ellipsis').exists()).toBe(false);
      wrapper.unmount();
    }
  );
});
