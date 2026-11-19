import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createSSRApp, defineComponent, h, nextTick, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import ExSteps from '../../../src/components/steps/ExSteps.vue';
import ExStep from '../../../src/components/steps/ExStep.vue';

describe('步骤子项的交互与内容', () => {
  it('实例导航跳过禁用项，动态包装组件插入或交换后按视觉顺序导航', async () => {
    const names = ref(['A', 'C']);
    const Group = defineComponent({
      setup: () => () =>
        names.value.map(name => h(ExStep, { key: name, title: name, disabled: name === 'B' })),
    });
    const wrapper = mount(ExSteps, { slots: { default: () => h(Group) } });
    names.value = ['A', 'B', 'C'];
    await nextTick();
    await nextTick();
    expect(wrapper.findAllComponents(ExStep).map(child => child.vm.getIndex())).toEqual([0, 1, 2]);
    wrapper.vm.goTo(1);
    wrapper.vm.goTo(Number.NaN);
    wrapper.vm.next();
    await wrapper.setProps({ current: 2 });
    wrapper.vm.prev();
    expect(wrapper.emitted('change')).toEqual([[2], [0]]);
    names.value = ['B', 'C', 'A'];
    await nextTick();
    await nextTick();
    wrapper.vm.prev();
    expect(wrapper.emitted('change')?.at(-1)).toEqual([1]);
    expect(wrapper.findAllComponents(ExStep).map(child => child.vm.getIndex())).toEqual([0, 1, 2]);
    wrapper.unmount();
  });

  it('服务端输出连续序号，独立子项保留内容并省略冗余禁用状态', async () => {
    const app = createSSRApp({
      render: () => h(ExSteps, {}, () => [h(ExStep), h(ExStep), h(ExStep)]),
    });
    const output = document.createElement('div');
    output.innerHTML = await renderToString(app);
    expect(
      [...output.querySelectorAll('.ex-step__icon-number')].map(node => node.textContent?.trim())
    ).toEqual(['1', '2', '3']);
    const standalone = mount(ExStep, { props: { title: '独立步骤' } });
    expect(standalone.get('.ex-step__title').text()).toBe('独立步骤');
    expect(standalone.attributes('aria-disabled')).toBeUndefined();
    standalone.unmount();
  });

  it('独立包装中的步骤在服务端首屏和水合时只给末项移除连接线', async () => {
    const Wrapped = defineComponent({
      props: { title: { type: String, required: true } },
      setup: props => () => h('section', [h(ExStep, { title: props.title })]),
    });
    const Host = defineComponent({
      setup: () => () => h(ExSteps, {}, () => ['A', 'B', 'C'].map(title => h(Wrapped, { title }))),
    });
    const container = document.createElement('div');
    container.innerHTML = await renderToString(createSSRApp(Host));
    const steps = Array.from(container.querySelectorAll('.ex-step'));
    expect(steps.map(step => step.querySelector('.ex-step__line') !== null)).toEqual([
      true,
      true,
      false,
    ]);
    expect(steps.filter(step => step.classList.contains('ex-step--last'))).toEqual([steps[2]]);
    const app = createSSRApp(Host);
    const warn = vi.fn();
    app.config.warnHandler = warn;
    app.mount(container);
    await nextTick();
    expect(warn).not.toHaveBeenCalled();
    expect(Array.from(container.querySelectorAll('.ex-step'))).toEqual(steps);
    app.unmount();
  });

  it('自定义图标与文字样式保留状态语义，键盘只激活当前操作目标', async () => {
    const wrapper = mount(ExSteps, {
      props: { clickable: true, style: 'padding: 4px' },
      slots: {
        default: () => [
          h(
            ExStep,
            {
              title: '待确认',
              description: '核对详情',
              subtitle: '步骤一',
              iconColor: '#123456',
              titleColor: '#654321',
              style: 'margin: 2px',
            },
            {
              icon: () => h('span', { class: 'custom-icon' }, '✓'),
              description: () => h('input'),
            }
          ),
          h(ExStep, { title: '提交', status: 'error', style: { padding: '2px' } }),
          h(ExStep, { title: '完成', status: 'finish', disabled: true }),
        ],
      },
    });
    const first = wrapper.findAllComponents(ExStep)[0]!;
    expect(first.get('.custom-icon').text()).toBe('✓');
    expect(first.get('.ex-step__subtitle').text()).toBe('步骤一');
    expect(first.vm.getIndex()).toBe(0);
    expect(first.vm.getElement()).toBe(first.element);
    await first.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('change')).toEqual([[0]]);
    await first.get('input').trigger('keydown', { key: 'Enter' });
    await first.trigger('keydown', { key: 'Enter', isComposing: true });
    await first.trigger('keydown', { key: 'Escape' });
    await wrapper.findAllComponents(ExStep)[2]!.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('change')).toHaveLength(1);
    expect(wrapper.find('.ex-step__line--error').exists()).toBe(true);
    wrapper.unmount();
  });
});
