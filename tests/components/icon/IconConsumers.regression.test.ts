import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import ExAlert from '../../../src/components/alert/ExAlert.vue';
import ExDropdownItem from '../../../src/components/dropdown/ExDropdownItem.vue';
import ExList from '../../../src/components/list/ExList.vue';
import ExPopconfirm from '../../../src/components/popconfirm/ExPopconfirm.vue';

describe('复合组件的内置图标与图片地址分流', () => {
  it('菜单项使用内置 SVG，并支持动态切换为外部图片', async () => {
    const wrapper = mount(ExDropdownItem, { props: { icon: 'edit-line' } });
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.find('.ex-icon__image-mask').exists()).toBe(false);
    await wrapper.setProps({ icon: '/assets/user.svg' });
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.get('.ex-icon__image-mask').attributes('style')).toContain('/assets/user.svg');
    wrapper.unmount();
  });

  it('列表行的内置图标不会作为相对图片地址发送请求', () => {
    const wrapper = mount(ExList, {
      props: { data: [{ title: '用户', icon: 'user-line' }] },
    });
    expect(wrapper.find('.ex-list__item-icon svg').exists()).toBe(true);
    expect(wrapper.find('.ex-icon__image').exists()).toBe(false);
    wrapper.unmount();
  });

  it('Alert 正文与关闭图标均识别内置名称', () => {
    const wrapper = mount(ExAlert, {
      props: { icon: 'shield-check-line', closeIcon: 'close-circle-line', closable: true },
    });
    expect(wrapper.findAll('svg')).toHaveLength(2);
    expect(wrapper.find('img').exists()).toBe(false);
    wrapper.unmount();
  });

  it('Popconfirm 显式传入默认内置图标仍渲染 SVG', async () => {
    const wrapper = mount(ExPopconfirm, {
      props: { icon: 'question-line' },
      slots: { default: () => h('button', '确认') },
      attachTo: document.body,
    });
    await wrapper.trigger('click');
    await nextTick();
    expect(document.querySelector('.ex-popconfirm__icon svg')).not.toBeNull();
    expect(document.querySelector('.ex-popconfirm__icon img')).toBeNull();
    wrapper.unmount();
  });
});
