import { createApp, defineComponent, h, onUnmounted } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExConfigProvider from '../../../src/components/config-provider/ExConfigProvider.vue';
import { ExMessage } from '../../../src/components/message';
import { createMessageService, useMessageService } from '../../../src/components/message/message';
import type { MessageService } from '../../../src/components/message/types';

describe('Message 服务同步回调重入', () => {
  let service: MessageService;
  const contents = () =>
    Array.from(document.querySelectorAll('.ex-message__content'), element => element.textContent);

  beforeEach(() => {
    service = createMessageService();
    service.config({ duration: 0, maxCount: 1 });
  });

  afterEach(() => {
    service.closeAll();
    document.body.replaceChildren();
  });

  it('淘汰时先登记外层请求，回调中新建的消息按实际请求顺序占用容量', () => {
    const intermediateClosed = vi.fn();
    const first = service.info({ content: 'A', onClose: () => service.info('B') });
    const intermediate = service.info({ content: 'C', onClose: intermediateClosed });

    expect(contents()).toEqual(['B']);
    expect(first.close()).toBe(false);
    expect(intermediate.close()).toBe(false);
    expect(intermediateClosed).toHaveBeenCalledOnce();
  });

  it('回调中新建的消息保持实际创建顺序，且收缩容量仍满足约束', () => {
    service.config({ maxCount: 3 });
    service.info({ content: 'A', onClose: () => service.info('D') });
    service.info('B');
    service.info('C');
    service.config({ maxCount: 2 });
    expect(contents()).toEqual(['C', 'D']);
  });

  it('回调合并尚未挂载的新消息时保留最新计时和全部关闭通知', async () => {
    vi.useFakeTimers();
    try {
      const firstClosed = vi.fn();
      const groupedClosed = vi.fn();
      service.info({
        content: 'A',
        onClose: () =>
          service.info({ content: 'C', grouping: true, duration: 20, onClose: groupedClosed }),
      });
      service.info({ content: 'C', grouping: true, duration: 1000, onClose: firstClosed });
      await vi.advanceTimersByTimeAsync(20);
      expect(firstClosed).toHaveBeenCalledOnce();
      expect(groupedClosed).toHaveBeenCalledOnce();
    } finally {
      service.closeAll();
      vi.useRealTimers();
    }
  });

  it('淘汰回调异常会撤销未提交的外层请求，不遗留记录或宿主', () => {
    const failure = new Error('业务关闭失败');
    service.info({
      content: 'A',
      onClose: () => {
        throw failure;
      },
    });
    expect(() => service.info('C')).toThrow(failure);
    expect(document.querySelector('.ex-message-container')).toBeNull();
    service.info('恢复');
    expect(contents()).toEqual(['恢复']);
  });

  it('批量关闭拒绝同步重开并清理所有记录，关闭后仍可正常使用', () => {
    service.config({ maxCount: 2 });
    const otherClosed = vi.fn();
    service.info({ content: 'A', onClose: () => service.info('重开') });
    service.info({ content: 'B', onClose: otherClosed });
    expect(() => service.closeAll()).toThrow(/批量关闭/);
    expect(otherClosed).toHaveBeenCalledOnce();
    expect(document.querySelector('.ex-message-container')).toBeNull();
    service.info('新消息');
    expect(contents()).toEqual(['新消息']);
  });

  it.each(['App', 'ConfigProvider'])('%s 卸载不允许回调留下孤立消息', scope => {
    let owned!: MessageService;
    const unmounted = vi.fn();
    const Page = defineComponent(() => {
      owned = useMessageService();
      onUnmounted(unmounted);
      return () => h('main', '业务页面');
    });
    const app = createApp({
      render: () => (scope === 'App' ? h(Page) : h(ExConfigProvider, {}, () => h(Page))),
    });
    app.use(ExMessage);
    const root = document.createElement('div');
    document.body.appendChild(root);
    app.mount(root);
    owned.info({ content: '原消息', duration: 0, onClose: () => owned.info('重开') });

    expect(() => app.unmount()).not.toThrow();
    expect(unmounted).toHaveBeenCalledOnce();
    expect(root.childElementCount).toBe(0);
    expect(document.querySelector('.ex-message-container')).toBeNull();
  });

  it.each([false, true])('自动释放保留业务异常，分组=%s', grouping => {
    let owned!: MessageService;
    const Page = defineComponent(() => {
      owned = useMessageService();
      return () => h('main');
    });
    const app = createApp({ render: () => h(ExConfigProvider, {}, () => h(Page)) });
    const handler = vi.fn();
    app.config.errorHandler = handler;
    const root = document.createElement('div');
    app.mount(root);
    const failure = new Error('业务异常不能被内部重开拒绝覆盖');
    owned.info({ content: '重开', duration: 0, grouping, onClose: () => owned.info('重开') });
    owned.info({
      content: grouping ? '重开' : '另一条',
      duration: 0,
      grouping,
      onClose: () => {
        throw failure;
      },
    });
    app.unmount();
    expect(handler.mock.calls.map(([error]) => error)).toEqual([failure]);
    expect(document.querySelector('.ex-message-container')).toBeNull();
  });

  it.each(['App', 'ConfigProvider'])('%s 已释放的服务拒绝子组件卸载后的重开', scope => {
    let owned!: MessageService;
    const handler = vi.fn();
    const Page = defineComponent(() => {
      owned = useMessageService();
      onUnmounted(() => owned.info('子组件卸载提示'));
      return () => h('main');
    });
    const app = createApp({
      render: () => (scope === 'App' ? h(Page) : h(ExConfigProvider, {}, () => h(Page))),
    });
    app.use(ExMessage);
    app.config.errorHandler = handler;
    const root = document.createElement('div');
    app.mount(root);
    app.unmount();

    expect(root.childElementCount).toBe(0);
    expect(document.querySelector('.ex-message-container')).toBeNull();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      message: expect.stringContaining('已释放'),
    });
    expect(() => owned.info('过期引用')).toThrow(/已释放/);
  });

  it('托管释放后也拒绝关闭回调排入微任务的重开', async () => {
    let owned!: MessageService;
    let delayed!: Promise<void>;
    const Page = defineComponent(() => {
      owned = useMessageService();
      return () => h('main');
    });
    const app = createApp({ render: () => h(ExConfigProvider, {}, () => h(Page)) });
    const root = document.createElement('div');
    app.mount(root);
    owned.info({
      content: '待关闭',
      duration: 0,
      onClose: () => {
        delayed = Promise.resolve().then(() => {
          expect(() => owned.info('延迟重开')).toThrow(/已释放/);
        });
      },
    });
    app.unmount();
    await delayed;
    expect(document.querySelector('.ex-message-container')).toBeNull();
  });

  it('Provider 已释放后不能在子组件卸载钩子中首次获取新服务', () => {
    const Page = defineComponent(() => {
      onUnmounted(() => useMessageService().info('卸载时首次创建'));
      return () => h('main');
    });
    const app = createApp({ render: () => h(ExConfigProvider, {}, () => h(Page)) });
    const handler = vi.fn();
    app.config.errorHandler = handler;
    const root = document.createElement('div');
    app.mount(root);
    app.unmount();

    expect(root.childElementCount).toBe(0);
    expect(document.querySelector('.ex-message-container')).toBeNull();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      message: expect.stringContaining('已释放'),
    });
  });
});
