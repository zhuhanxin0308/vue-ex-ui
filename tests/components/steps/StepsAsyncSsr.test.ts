import { flushPromises, mount } from '@vue/test-utils';
import { Comment, createSSRApp, defineComponent, h, nextTick, ref, Suspense, Teleport } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import ExStep from '../../../src/components/steps/ExStep.vue';
import ExSteps from '../../../src/components/steps/ExSteps.vue';

describe('步骤在异步包装与传送中的服务端次序', () => {
  it('嵌套包装可异步返回多步或零步，前后直接子项与初次水合均按视觉次序', async () => {
    let release!: () => void;
    let ready = new Promise<void>(resolve => (release = resolve));
    const titles = vi.fn((text: string) => text);
    const step = (title: string) => h(ExStep, {}, { title: () => titles(title) });
    const pending = vi.fn();
    const Deferred = defineComponent({
      async setup() {
        pending();
        await ready;
        return () => h('section', [step('B'), step('C')]);
      },
    });
    const Empty = defineComponent({ setup: () => () => null });
    const Nested = defineComponent({
      setup: () => () => h('article', [h(Empty), h(Suspense, {}, () => h(Deferred))]),
    });
    const Host = defineComponent({
      setup: () => () => h(ExSteps, { clickable: true }, () => [step('A'), h(Nested), step('D')]),
    });
    const root = document.createElement('div');
    const html = renderToString(createSSRApp(Host));
    await flushPromises();
    release();
    root.innerHTML = await html;
    const rows = Array.from(root.querySelectorAll('.ex-step'));
    const numbers = () => rows.map(row => row.querySelector('.ex-step__icon-number')?.textContent);
    expect(rows.map(row => row.querySelector('.ex-step__title')?.textContent)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(numbers()).toEqual(['1', '2', '3', '4']);
    expect(rows.map(row => row.classList.contains('ex-step--last'))).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(titles).toHaveBeenCalledTimes(4);
    expect(pending).toHaveBeenCalledTimes(1);

    ready = new Promise<void>(resolve => (release = resolve));
    const app = createSSRApp(Host);
    const warnings = vi.fn();
    app.config.warnHandler = warnings;
    app.mount(root);
    await nextTick();
    expect(numbers()).toEqual(['1', '2', '3', '4']);
    release();
    await flushPromises();
    await nextTick();
    expect(numbers()).toEqual(['1', '2', '3', '4']);
    expect(Array.from(root.querySelectorAll('.ex-step'))).toEqual(rows);
    expect(warnings).not.toHaveBeenCalled();
    app.unmount();
  });

  it('步骤内容的浮层保持传送，禁用传送的步骤按原位渲染', async () => {
    const target = document.createElement('div');
    target.id = 'step-details';
    const disabledTarget = document.createElement('div');
    disabledTarget.id = 'steps-disabled';
    document.body.append(target, disabledTarget);
    const Host = defineComponent({
      setup: () => () =>
        h(ExSteps, {}, () => [
          h(Teleport, { to: '#steps-disabled', disabled: true }, [
            h(
              ExStep,
              { title: '详情' },
              { description: () => h(Teleport, { to: '#step-details' }, [h('span', '浮层')]) }
            ),
          ]),
          h(ExStep, { title: '完成' }),
        ]),
    });
    const context: { teleports?: Record<string, string> } = {};
    const root = document.createElement('div');
    root.innerHTML = await renderToString(createSSRApp(Host), context);
    target.innerHTML = context.teleports?.['#step-details'] ?? '';
    disabledTarget.innerHTML = context.teleports?.['#steps-disabled'] ?? '';
    expect(target.textContent).toBe('浮层');
    expect(root.querySelectorAll('.ex-step__line')).toHaveLength(1);
    const app = createSSRApp(Host);
    const warnings = vi.fn();
    app.config.warnHandler = warnings;
    app.mount(root);
    await nextTick();
    expect(target.textContent).toBe('浮层');
    expect(warnings).not.toHaveBeenCalled();
    app.unmount();
    target.remove();
    disabledTarget.remove();
  });

  it('水合时移除尚在等待的条件分支后，剩余步骤立即恢复实时序号', async () => {
    const visible = ref(true);
    let ready = Promise.resolve();
    const Delayed = defineComponent({
      async setup() {
        await ready;
        return () => h(ExStep, { title: '待移除' });
      },
    });
    const Host = defineComponent({
      setup: () => () =>
        h(ExSteps, {}, () => [
          h(ExStep, { key: 'first' }),
          visible.value
            ? h('section', { key: 'delayed' }, [h(Suspense, {}, () => h(Delayed))])
            : null,
          h(ExStep, { key: 'last' }),
        ]),
    });
    const root = document.createElement('div');
    root.innerHTML = await renderToString(createSSRApp(Host));
    let release!: () => void;
    ready = new Promise<void>(resolve => (release = resolve));
    const app = createSSRApp(Host);
    app.mount(root);
    visible.value = false;
    await nextTick();
    await nextTick();
    const number = () =>
      Array.from(root.querySelectorAll('.ex-step__icon-number'), el => el.textContent);
    expect(number()).toEqual(['1', '2']);
    release();
    await flushPromises();
    expect(number()).toEqual(['1', '2']);
    app.unmount();
  });

  it('调用者的 scoped 样式只作用于步骤根，服务端与客户端的作用域属性一致', async () => {
    const Host = defineComponent({
      __scopeId: 'data-v-consumer',
      setup: () => () =>
        h('main', [h(ExSteps, {}, () => h(ExStep, { id: 'scoped-step', title: '确认' }))]),
    });
    const root = document.createElement('div');
    root.innerHTML = await renderToString(createSSRApp(Host));
    const client = mount(Host);
    const scopes = (element: Element) =>
      element
        .getAttributeNames()
        .filter(name => name.startsWith('data-v-'))
        .sort();
    const serverStep = root.querySelector('#scoped-step')!;
    expect(scopes(serverStep)).toEqual(scopes(client.get('#scoped-step').element));
    expect(serverStep.hasAttribute('data-v-consumer')).toBe(true);
    expect(serverStep.querySelector('.ex-step__head')?.hasAttribute('data-v-consumer')).toBe(false);
    client.unmount();
  });

  it('进度点跳过图标插槽，注释标题恢复默认值，客户端仍能切换标题插槽', async () => {
    const show = ref(false);
    const icon = vi.fn(() => h('i'));
    const Host = defineComponent({
      setup: () => () =>
        h(ExSteps, { progressDot: true }, () =>
          h(
            ExStep,
            { title: '原始标题' },
            { icon, title: () => (show.value ? '新标题' : h(Comment)) }
          )
        ),
    });
    const root = document.createElement('div');
    root.innerHTML = await renderToString(createSSRApp(Host));
    expect(root.querySelector('.ex-step__title')?.textContent).toBe('原始标题');
    const app = createSSRApp(Host);
    app.mount(root);
    show.value = true;
    await nextTick();
    expect(root.querySelector('.ex-step__title')?.textContent).toBe('新标题');
    expect(icon).not.toHaveBeenCalled();
    app.unmount();
  });

  it('用户命名插槽和后续包装子项传送到同一目标时保留页面顺序', async () => {
    const portal = (label: string) => h(Teleport, { to: '#details' }, [h('b', label)]);
    const Inline = defineComponent({ setup: () => () => h('div', [portal('B'), h(ExStep)]) });
    const app = createSSRApp({
      render: () =>
        h('main', [
          h(ExSteps, {}, () => [
            h(ExStep, { title: 'A' }, { description: () => portal('A') }),
            h(Inline),
          ]),
          portal('C'),
        ]),
    });
    const context: { teleports?: Record<string, string> } = {};
    await renderToString(app, context);
    const target = document.createElement('div');
    target.innerHTML = context.teleports?.['#details'] ?? '';
    expect(target.textContent).toBe('ABC');
  });

  it.each([true, false])('目标在容器之前：%s，传送步骤水合后按真实顺序操作', async before => {
    const root = document.createElement('div');
    const target = document.createElement('div');
    target.id = 'external-step';
    document.body.append(...(before ? [target, root] : [root, target]));
    const change = vi.fn();
    const Host = defineComponent({
      setup: () => () =>
        h(ExSteps, { clickable: true, onChange: change }, () => [
          h(ExStep, { title: '内部' }),
          h(Teleport, { to: '#external-step' }, [h(ExStep, { title: '外部' })]),
          h(ExStep, { title: '末尾' }),
        ]),
    });
    const context: { teleports?: Record<string, string> } = {};
    root.innerHTML = await renderToString(createSSRApp(Host), context);
    target.innerHTML = context.teleports?.['#external-step'] ?? '';
    const external = target.querySelector<HTMLElement>('.ex-step')!;
    expect(external.querySelector('.ex-step__title')?.textContent).toBe('外部');
    expect(external.querySelector('.ex-step__icon-number')?.textContent).toBe('3');
    const app = createSSRApp(Host);
    const warnings = vi.fn();
    app.config.warnHandler = warnings;
    app.mount(root);
    await nextTick();
    await nextTick();
    expect(warnings).not.toHaveBeenCalled();
    expect(target.querySelector('.ex-step')).toBe(external);
    external.click();
    expect(change).toHaveBeenCalledWith(before ? 0 : 2);
    expect(
      Array.from(document.querySelectorAll('.ex-step__icon-number'), node => node.textContent)
    ).toEqual(['1', '2', '3']);
    app.unmount();
    root.remove();
    target.remove();
  });

  it('仅含外部传送步骤时，逆序完成水合仍保留未就绪步骤的位置', async () => {
    const root = document.createElement('div');
    const target = document.createElement('div');
    target.id = 'pending-external-steps';
    document.body.append(root, target);
    const waits = new Map<string, Promise<void>>();
    const delayed = (title: string) =>
      defineComponent({
        async setup() {
          await waits.get(title);
          return () => h(ExStep, { title });
        },
      });
    const first = delayed('A');
    const second = delayed('B');
    const change = vi.fn();
    const Host = defineComponent({
      setup: () => () =>
        h(ExSteps, { clickable: true, onChange: change }, () =>
          h(Teleport, { to: '#pending-external-steps' }, [
            h(Suspense, {}, () => h(first)),
            h(Suspense, {}, () => h(second)),
          ])
        ),
    });
    const context: { teleports?: Record<string, string> } = {};
    root.innerHTML = await renderToString(createSSRApp(Host), context);
    target.innerHTML = context.teleports?.['#pending-external-steps'] ?? '';
    const rows = Array.from(target.querySelectorAll<HTMLElement>('.ex-step'));
    const numbers = () => rows.map(row => row.querySelector('.ex-step__icon-number')?.textContent);
    expect(numbers()).toEqual(['1', '2']);
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    waits.set('A', new Promise<void>(resolve => (resolveFirst = resolve)));
    waits.set('B', new Promise<void>(resolve => (resolveSecond = resolve)));
    const app = createSSRApp(Host);
    try {
      app.mount(root);
      await nextTick();
      resolveSecond();
      await flushPromises();
      expect(numbers()).toEqual(['1', '2']);
      rows[1]!.click();
      expect(change).toHaveBeenLastCalledWith(1);
      resolveFirst();
      await flushPromises();
      expect(numbers()).toEqual(['1', '2']);
      rows[0]!.click();
      expect(change).toHaveBeenLastCalledWith(0);
      expect(Array.from(target.querySelectorAll('.ex-step'))).toEqual(rows);
    } finally {
      app.unmount();
      root.remove();
      target.remove();
    }
  });

  it('服务端为空的步骤条在水合后可以添加步骤并切换顺序', async () => {
    const names = ref<string[]>([]);
    const Host = defineComponent({
      setup: () => () =>
        h(ExSteps, {}, () => names.value.map(title => h(ExStep, { title, key: title }))),
    });
    const root = document.createElement('div');
    root.innerHTML = await renderToString(createSSRApp(Host));
    const app = createSSRApp(Host);
    app.mount(root);
    expect(root.querySelector('.ex-step')).toBeNull();
    names.value = ['A', 'B'];
    await nextTick();
    names.value = ['B', 'A'];
    await nextTick();
    await nextTick();
    expect(Array.from(root.querySelectorAll('.ex-step__title'), el => el.textContent)).toEqual([
      'B',
      'A',
    ]);
    expect(
      Array.from(root.querySelectorAll('.ex-step__icon-number'), el => el.textContent)
    ).toEqual(['1', '2']);
    app.unmount();
  });
});
