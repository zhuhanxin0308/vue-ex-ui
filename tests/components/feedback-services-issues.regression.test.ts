import { mount } from '@vue/test-utils';
import { createApp, defineComponent, nextTick } from 'vue';
import ExLoading, {
  destroyLoading,
  loadingService,
  showLoading,
} from '../../src/components/loading';
import { createMessageService } from '../../src/components/message/message';
import { createNotificationService } from '../../src/components/notification/notification';

afterEach(() => {
  destroyLoading();
  loadingService.destroyAll();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('反馈服务的安装与重复调用生命周期', () => {
  it('单独安装 ExLoading 注册组件、指令与隔离服务', async () => {
    const app = createApp({ render: () => null });
    app.use(ExLoading);
    expect(app.component('ExLoading')).toBeDefined();
    expect(app.directive('loading')).toBeDefined();
    expect(app.config.globalProperties.$loading).toBeDefined();
    const wrapper = mount(
      defineComponent({ template: '<section v-loading="true">内容</section>' }),
      { attachTo: document.body, global: { plugins: [ExLoading] } }
    );
    await nextTick();
    expect(wrapper.find('.ex-loading').exists()).toBe(true);
    wrapper.unmount();
  });

  it('单例局部加载后省略 target 会回到全屏，显式更新则仍可保留目标', async () => {
    const target = document.createElement('section');
    document.body.append(target);
    const first = showLoading({ target, text: '局部' });
    await nextTick();
    expect(target.querySelector('.ex-loading')).not.toBeNull();
    first.updateConfig({ text: '局部更新' });
    await nextTick();
    expect(target.textContent).toContain('局部更新');
    const second = showLoading({ text: '全屏' });
    await nextTick();
    expect(second).toBe(first);
    expect(target.querySelector('.ex-loading')).toBeNull();
    expect(document.querySelector('.ex-loading--fullscreen')).not.toBeNull();
  });

  it('分组消息重新开始倒计时，所有调用的关闭回调各执行一次', async () => {
    vi.useFakeTimers();
    const service = createMessageService();
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    try {
      const first = service({
        content: '保存成功',
        grouping: true,
        duration: 1000,
        onClose: firstClose,
      });
      await nextTick();
      await vi.advanceTimersByTimeAsync(900);
      const second = service({
        content: '保存成功',
        grouping: true,
        duration: 500,
        onClose: secondClose,
      });
      expect(second.id).toBe(first.id);
      await vi.advanceTimersByTimeAsync(499);
      expect(firstClose).not.toHaveBeenCalled();
      expect(secondClose).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(firstClose).toHaveBeenCalledOnce();
      expect(secondClose).toHaveBeenCalledOnce();
      service.closeAll();
      expect(firstClose).toHaveBeenCalledOnce();
      expect(secondClose).toHaveBeenCalledOnce();
    } finally {
      service.closeAll();
    }
  });

  it('分组消息在悬停时续期仍保持暂停，离开后才开始新倒计时', async () => {
    vi.useFakeTimers();
    const service = createMessageService();
    const closed = vi.fn();
    try {
      service({ content: '保存成功', grouping: true, duration: 1000 });
      await nextTick();
      const element = document.querySelector<HTMLElement>('.ex-message')!;
      element.dispatchEvent(new MouseEvent('mouseenter'));
      service({ content: '保存成功', grouping: true, duration: 500, onClose: closed });
      await vi.advanceTimersByTimeAsync(1000);
      expect(closed).not.toHaveBeenCalled();
      element.dispatchEvent(new MouseEvent('mouseleave'));
      await vi.advanceTimersByTimeAsync(500);
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      service.closeAll();
    }
  });

  it('关闭回调中重开同 ID 通知不会被旧实例销毁', async () => {
    vi.useFakeTimers();
    const service = createNotificationService();
    const reopenedClose = vi.fn();
    const oldClose = vi.fn(() =>
      service({ id: 'connection', title: '已重连', duration: 0, onClose: reopenedClose })
    );
    try {
      const old = service({ id: 'connection', title: '连接断开', duration: 0, onClose: oldClose });
      await nextTick();
      expect(() => old.close()).not.toThrow();
      await vi.runAllTimersAsync();
      await nextTick();
      expect(oldClose).toHaveBeenCalledOnce();
      expect(document.querySelectorAll('.ex-notification')).toHaveLength(1);
      expect(document.body.textContent).toContain('已重连');
      expect(old.close()).toBe(false);
      expect(reopenedClose).not.toHaveBeenCalled();
      expect(service.close('connection')).toBe(true);
      expect(reopenedClose).toHaveBeenCalledOnce();
    } finally {
      service.closeAll();
    }
  });
});
