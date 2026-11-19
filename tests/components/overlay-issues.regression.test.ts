import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createCommentVNode, defineComponent, h, nextTick, ref, type Component } from 'vue';
import ExDialog from '../../src/components/dialog/ExDialog.vue';
import ExDrawer from '../../src/components/drawer/ExDrawer.vue';
import ExPopover from '../../src/components/popover/ExPopover.vue';
import ExTooltip from '../../src/components/tooltip/ExTooltip.vue';
import ExPopconfirm from '../../src/components/popconfirm/ExPopconfirm.vue';

enableAutoUnmount(afterEach);
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('浮层的模型、关闭与标题契约', () => {
  it.each([
    ['Popover', ExPopover, '.ex-popover__popper'],
    ['Tooltip', ExTooltip, '.ex-tooltip__popper'],
  ] as const)('%s 透传 undefined 时保留非受控交互', async (_, component, selector) => {
    const wrapper = mount(component as Component, {
      props: { modelValue: undefined, trigger: 'click', closeDelay: 0 },
      slots: { default: () => h('button', '触发') },
      attachTo: document.body,
    });
    await wrapper.get('button').trigger('click');
    expect(document.querySelector(selector)).not.toBeNull();
    await wrapper.setProps({ modelValue: false });
    await wrapper.get('button').trigger('click');
    expect(document.querySelector(selector)).toBeNull();
    await wrapper.setProps({ modelValue: undefined });
    await wrapper.get('button').trigger('click');
    expect(document.querySelector(selector)).not.toBeNull();
  });

  it.each([
    ['Popover', ExPopover, '.ex-popover__popper'],
    ['Tooltip', ExTooltip, '.ex-tooltip__popper'],
  ] as const)('%s 等待打开时点击外部会撤销延迟意图', async (_, component, selector) => {
    vi.useFakeTimers();
    const wrapper = mount(component as Component, {
      props: { trigger: 'click', openDelay: 100 },
      slots: { default: () => h('button', '触发') },
      attachTo: document.body,
    });
    (wrapper.get('button').element as HTMLButtonElement).click();
    document.body.click();
    await vi.advanceTimersByTimeAsync(300);
    expect(document.querySelector(selector)).toBeNull();
    expect(wrapper.emitted('show')).toBeUndefined();
  });

  it('点击 Tooltip 内容保持打开，点击外部关闭', async () => {
    const wrapper = mount(ExTooltip, {
      props: { trigger: 'click', closeDelay: 0 },
      slots: { default: () => h('button', '触发'), content: () => h('button', '复制内容') },
      attachTo: document.body,
    });
    await wrapper.get('button').trigger('click');
    document.querySelector<HTMLButtonElement>('.ex-tooltip__content button')!.click();
    await nextTick();
    expect(document.querySelector('.ex-tooltip__popper')).not.toBeNull();
    document.body.click();
    await nextTick();
    expect(document.querySelector('.ex-tooltip__popper')).toBeNull();
  });

  it('修改关闭延时不会取消 Popover 仍有效的打开意图', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ExPopover, {
      props: { trigger: 'click', openDelay: 100, closeDelay: 200 },
      slots: { default: () => h('button', '触发') },
      attachTo: document.body,
    });
    await wrapper.get('button').trigger('click');
    await wrapper.setProps({ closeDelay: 0 });
    await vi.advanceTimersByTimeAsync(110);
    expect(document.querySelector('.ex-popover__popper')).not.toBeNull();
  });

  it('右键弹层忽略内部右键，并在外部右键后关闭', async () => {
    const wrapper = mount(ExPopover, {
      props: { trigger: 'contextmenu', closeDelay: 0, content: '菜单' },
      slots: { default: () => h('button', '触发') },
      attachTo: document.body,
    });
    await wrapper.get('button').trigger('contextmenu');
    const panel = document.querySelector<HTMLElement>('.ex-popover__popper')!;
    panel.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await nextTick();
    expect(document.querySelector('.ex-popover__popper')).toBe(panel);
    document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await nextTick();
    expect(document.querySelector('.ex-popover__popper')).toBeNull();
  });

  it('动态切换为点击触发后关闭恢复触发器焦点', async () => {
    const wrapper = mount(ExPopover, {
      props: { trigger: 'hover', closeDelay: 0 },
      slots: { default: () => h('button', '触发'), content: () => h('button', '内容') },
      attachTo: document.body,
    });
    await wrapper.setProps({ trigger: 'click' });
    const trigger = wrapper.get('button').element;
    trigger.focus();
    trigger.click();
    await nextTick();
    const content = document.querySelector<HTMLButtonElement>('.ex-popover__content button')!;
    content.focus();
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(document.activeElement).toBe(trigger);
  });

  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY])(
    '非法浮层宽度 %s 回退为自动宽度',
    width => {
      mount(ExPopover, { props: { modelValue: true, width }, attachTo: document.body });
      expect(document.querySelector<HTMLElement>('.ex-popover__popper')!.style.width).toBe('auto');
    }
  );

  it('无遮罩 Dialog 不持有滚动锁，并跟随遮罩切换配对释放', async () => {
    const originalOverflow = document.body.style.overflow;
    const wrapper = mount(ExDialog, {
      props: { modelValue: true, mask: false },
      attachTo: document.body,
    });
    await nextTick();
    expect(document.body.style.overflow).toBe(originalOverflow);
    await wrapper.setProps({ mask: true });
    expect(document.body.style.overflow).toBe('hidden');
    await wrapper.setProps({ mask: false });
    expect(document.body.style.overflow).toBe(originalOverflow);
  });

  it.each([
    ['Dialog', ExDialog],
    ['Drawer', ExDrawer],
  ] as const)('%s 已关闭时不会重复执行关闭守卫或发送模型更新', async (_, component) => {
    const beforeClose = vi.fn(() => true);
    const wrapper = mount(component as Component, { props: { modelValue: false, beforeClose } });
    await (wrapper.vm as unknown as { close(): Promise<boolean> }).close();
    expect(beforeClose).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it.each([
    ['Dialog', ExDialog, '.ex-dialog'],
    ['Drawer', ExDrawer, '.ex-drawer'],
    ['Popover', ExPopover, '.ex-popover__popper'],
  ] as const)('%s 动态标题插槽消失后移除空标题引用', async (_, component, selector) => {
    const show = ref(false);
    mount(
      defineComponent({
        setup: () => () =>
          h(
            component as Component,
            { modelValue: true },
            {
              ...(show.value ? { title: () => h('span', '业务标题') } : {}),
            }
          ),
      }),
      { attachTo: document.body }
    );
    await nextTick();
    const panel = document.querySelector(selector)!;
    expect(panel.getAttribute('aria-labelledby')).toBeNull();
    show.value = true;
    await nextTick();
    const titleId = panel.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)?.textContent).toContain('业务标题');
    show.value = false;
    await nextTick();
    expect(panel.getAttribute('aria-labelledby')).toBeNull();
  });

  it('Drawer 纯注释 header 插槽使用默认无障碍名称', () => {
    mount(ExDrawer, {
      props: { modelValue: true },
      slots: { header: () => createCommentVNode('无标题') },
      attachTo: document.body,
    });
    const panel = document.querySelector('.ex-drawer')!;
    expect(panel.getAttribute('aria-labelledby')).toBeNull();
    expect(panel.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('Popconfirm 受控状态与异步确认', () => {
  it.each(['click', 'hover'] as const)(
    '%s 异步确认被否决后不会执行确认期间遗留的关闭计时',
    async trigger => {
      vi.useFakeTimers();
      let resolveConfirm!: (value: boolean) => void;
      const wrapper = mount(ExPopconfirm, {
        props: {
          trigger,
          beforeConfirm: () =>
            new Promise<boolean>(resolve => {
              resolveConfirm = resolve;
            }),
        },
        slots: { default: () => h('button', '触发') },
        attachTo: document.body,
      });
      await wrapper.trigger(trigger === 'click' ? 'click' : 'mouseenter');
      const buttons = document.querySelectorAll<HTMLButtonElement>('.ex-popconfirm__footer button');
      buttons[buttons.length - 1]!.click();
      await nextTick();
      if (trigger === 'hover') await wrapper.trigger('mouseleave');
      else document.body.click();
      await vi.advanceTimersByTimeAsync(20);
      resolveConfirm(false);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(300);
      expect(document.querySelector('.ex-popconfirm')).not.toBeNull();
      expect(wrapper.emitted('confirm')).toBeUndefined();
      expect(wrapper.emitted('update:visible')).toEqual([[true]]);
    }
  );

  it('visible 由父组件控制，关闭请求不会抢先隐藏', async () => {
    const wrapper = mount(ExPopconfirm, {
      props: { visible: true, title: '是否提交' },
      attachTo: document.body,
    });
    await nextTick();
    expect(document.querySelector('.ex-popconfirm')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('.ex-popconfirm__footer button')!.click();
    await nextTick();
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
    expect(document.querySelector('.ex-popconfirm')).not.toBeNull();
    await wrapper.setProps({ visible: false });
    expect(document.querySelector('.ex-popconfirm')).toBeNull();
  });

  it('异步确认期间忽略外部点击与 Escape，完成后只确认一次', async () => {
    vi.useFakeTimers();
    let resolveConfirm!: (value: boolean) => void;
    const wrapper = mount(ExPopconfirm, {
      props: {
        beforeConfirm: () =>
          new Promise<boolean>(resolve => {
            resolveConfirm = resolve;
          }),
      },
      slots: { default: () => h('button', '触发') },
      attachTo: document.body,
    });
    await wrapper.get('button').trigger('click');
    const buttons = document.querySelectorAll<HTMLButtonElement>('.ex-popconfirm__footer button');
    buttons[buttons.length - 1]!.click();
    await nextTick();
    document.body.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    expect(document.querySelector('.ex-popconfirm')).not.toBeNull();
    resolveConfirm(true);
    await flushPromises();
    expect(wrapper.emitted('confirm')).toEqual([[]]);
    expect(document.querySelector('.ex-popconfirm')).toBeNull();
  });
});
