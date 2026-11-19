import { createApp, defineComponent, h, onUnmounted } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExConfigProvider from '../../../src/components/config-provider/ExConfigProvider.vue';
import { ExNotification } from '../../../src/components/notification';
import {
  createNotificationService,
  useNotificationService,
} from '../../../src/components/notification/notification';
import type { NotificationService } from '../../../src/components/notification/types';

describe('Notification 服务的同步重入', () => {
  let service: NotificationService;
  const titles = () =>
    Array.from(document.querySelectorAll('.ex-notification__title'), node => node.textContent);

  beforeEach(() => {
    service = createNotificationService();
    service.config({ duration: 0, maxCount: 1 });
  });

  afterEach(() => {
    service.closeAll();
    document.body.replaceChildren();
  });

  it('淘汰回调能看到外层新请求占用的 ID，拒绝重复创建', () => {
    const old = service({
      title: '旧通知',
      onClose: () => {
        expect(() => service({ id: 'b', title: '内层通知' })).toThrow(/重复/);
      },
    });
    const current = service({ id: 'b', title: '外层通知' });
    expect(titles()).toEqual(['外层通知']);
    expect(old.close()).toBe(false);
    expect(service.close(current.id)).toBe(true);
  });

  it('淘汰回调抛错时撤销未完成的创建并释放 ID 和宿主', () => {
    service({ title: '旧通知', onClose: () => service({ id: 'b', title: '冲突' }) });
    expect(() => service({ id: 'b', title: '未完成' })).toThrow(/重复/);
    expect(document.querySelector('.ex-notification-container')).toBeNull();
    expect(service.close('b')).toBe(false);
    service({ id: 'b', title: '重新创建' });
    expect(titles()).toEqual(['重新创建']);
  });

  it('淘汰回调创建不同 ID 时按请求顺序淘汰尚未挂载的记录', () => {
    const onClose = vi.fn();
    service({ title: '首条通知', onClose: () => service({ id: 'c', title: '最新通知' }) });
    const intermediate = service({ id: 'b', title: '中间通知', onClose });
    expect(titles()).toEqual(['最新通知']);
    expect(onClose).toHaveBeenCalledOnce();
    expect(intermediate.close()).toBe(false);
    expect(service.close('c')).toBe(true);
  });

  it('内容挂载期间被新通知淘汰时完整卸载原组件', () => {
    const unmounted = vi.fn();
    const content = h(
      defineComponent(() => {
        onUnmounted(unmounted);
        service({ id: 'c', title: '保留通知' });
        return () => h('span', '原通知内容');
      })
    );
    const old = service({ id: 'b', title: '正在挂载', content });
    expect(titles()).toEqual(['保留通知']);
    expect(old.close()).toBe(false);
    expect(unmounted).toHaveBeenCalledOnce();
  });

  it('挂载中的批量关闭也约束延迟执行的内容卸载回调', () => {
    const unmounted = vi.fn(() => {
      expect(() => service({ title: '卸载时重开' })).toThrow(/批量关闭/);
    });
    const content = h(
      defineComponent(() => {
        onUnmounted(unmounted);
        service.closeAll();
        return () => h('span');
      })
    );
    const instance = service({ id: 'a', title: '正在挂载', content });
    expect(unmounted).toHaveBeenCalledOnce();
    expect(instance.close()).toBe(false);
    expect(document.querySelector('.ex-notification-container')).toBeNull();
    service({ id: 'a', title: '正常重开' });
    expect(titles()).toEqual(['正常重开']);
  });

  it('关闭中的 ID 重开后保持真实请求顺序，旧句柄不能关闭新实例', () => {
    service.config({ maxCount: 3 });
    const original = service({ id: 'a', title: '旧通知' });
    service({ id: 'b', title: '保留通知' });
    expect(original.close()).toBe(true);
    service({ id: 'a', title: '重开通知' });
    expect(titles()).toEqual(['保留通知', '重开通知']);
    expect(original.close()).toBe(false);
    expect(service.close('a')).toBe(true);
  });

  it('收缩上限时逐位置完成淘汰，再向调用方报告回调错误', () => {
    service.config({ maxCount: 2 });
    const failure = new Error('关闭失败');
    service({
      id: 'a',
      title: '先淘汰',
      onClose: () => {
        throw failure;
      },
    });
    service({ title: '保留右上' });
    service({ id: 'b', title: '随后淘汰', position: 'bottom-left' });
    service({ title: '保留左下', position: 'bottom-left' });
    expect(() => service.config({ maxCount: 1 })).toThrow(failure);
    expect(titles()).toEqual(['保留右上', '保留左下']);
    expect(service.close('a')).toBe(false);
    expect(service.close('b')).toBe(false);
  });

  it('批量关闭期间拒绝无条件重开并继续清理，结束后允许正常创建', () => {
    const otherClosed = vi.fn();
    const reopen = () => service({ id: 'a', title: '重开', onClose: reopen });
    service.config({ maxCount: 2 });
    reopen();
    service({ id: 'b', title: '另一条', onClose: otherClosed });
    expect(() => service.closeAll()).toThrow(/批量关闭/);
    expect(otherClosed).toHaveBeenCalledOnce();
    expect(document.querySelector('.ex-notification-container')).toBeNull();
    expect(service.close('a')).toBe(false);
    service({ id: 'a', title: '新通知' });
    expect(titles()).toEqual(['新通知']);
  });

  it.each(['App', 'ConfigProvider'])('%s 自动释放时重开不会中断 Vue 卸载', scope => {
    let owned!: NotificationService;
    const unmounted = vi.fn();
    const Page = defineComponent(() => {
      owned = useNotificationService();
      onUnmounted(unmounted);
      return () => h('main', '业务页面');
    });
    const app = createApp({
      render: () => (scope === 'App' ? h(Page) : h(ExConfigProvider, {}, () => h(Page))),
    });
    app.use(ExNotification);
    const root = document.createElement('div');
    document.body.appendChild(root);
    app.mount(root);
    owned({ id: 'a', title: '原通知', onClose: () => owned({ id: 'a', title: '重开' }) });
    expect(() => app.unmount()).not.toThrow();
    expect(root.childElementCount).toBe(0);
    expect(unmounted).toHaveBeenCalledOnce();
    expect(document.querySelector('.ex-notification-container')).toBeNull();
  });

  it('自动释放只吸收内部重开拒绝，业务异常仍由 Vue 错误处理器接收', () => {
    let owned!: NotificationService;
    const app = createApp({
      render: () =>
        h(ExConfigProvider, {}, () =>
          h(
            defineComponent(() => {
              owned = useNotificationService();
              return () => h('div');
            })
          )
        ),
    });
    const handler = vi.fn();
    app.config.errorHandler = handler;
    const root = document.createElement('div');
    app.mount(root);
    const failure = new Error('业务关闭失败');
    owned({ title: '重开', onClose: () => owned({ title: '重开' }) });
    owned({
      title: '业务回调',
      onClose: () => {
        throw failure;
      },
    });
    app.unmount();
    expect(handler.mock.calls.map(([error]) => error)).toEqual([failure]);
    expect(root.childElementCount).toBe(0);
    expect(document.querySelector('.ex-notification-container')).toBeNull();
  });
});
