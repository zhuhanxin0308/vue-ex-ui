import { mount } from '@vue/test-utils';
import { defineComponent, effectScope, h, nextTick, ref, watch } from 'vue';
import { useMediaQuery } from '../../src/composables/useMediaQuery';

afterEach(() => vi.restoreAllMocks());

function createMediaQuery(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener)
    ),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener)
    ),
  } as unknown as MediaQueryList;
  return { media, listeners };
}

describe('媒体查询在组件与独立作用域中的首次读取', () => {
  it('纯客户端 setup 已读取真实匹配值，首帧不会先渲染 false', () => {
    const { media } = createMediaQuery(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const setupValues: boolean[] = [];
    const wrapper = mount(
      defineComponent({
        setup() {
          const matches = useMediaQuery('(min-width: 1px)');
          setupValues.push(matches.value);
          return () => h('span', String(matches.value));
        },
      })
    );
    expect(setupValues).toEqual([true]);
    expect(wrapper.text()).toBe('true');
    wrapper.unmount();
  });

  it('独立 scope 响应查询替换并释放旧查询与新查询监听', async () => {
    const first = createMediaQuery(true);
    const second = createMediaQuery(false);
    vi.spyOn(window, 'matchMedia').mockImplementation(query =>
      query === '(first)' ? first.media : second.media
    );
    const query = ref('(first)');
    const scope = effectScope();
    const matches = scope.run(() => useMediaQuery(query))!;
    try {
      expect(matches.value).toBe(true);
      expect(first.listeners.size).toBe(1);
      query.value = '(second)';
      await nextTick();
      expect(matches.value).toBe(false);
      expect(first.listeners.size).toBe(0);
      expect(second.listeners.size).toBe(1);
      second.listeners.forEach(listener => listener({ matches: true } as MediaQueryListEvent));
      expect(matches.value).toBe(true);
    } finally {
      scope.stop();
    }
    expect(second.listeners.size).toBe(0);
  });

  it('挂载前已停止的嵌套作用域不会重新注册媒体监听', () => {
    const { media, listeners } = createMediaQuery(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const wrapper = mount(
      defineComponent({
        setup() {
          const scope = effectScope();
          scope.run(() => useMediaQuery('(min-width: 1px)', { initialValue: false }));
          scope.stop();
          return () => null;
        },
      })
    );
    expect(listeners.size).toBe(0);
    wrapper.unmount();
    expect(listeners.size).toBe(0);
  });

  it('无作用域时返回同步快照，不留下无法释放的查询监听', () => {
    const { media, listeners } = createMediaQuery(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const query = ref('(first)');
    expect(useMediaQuery(query).value).toBe(true);
    query.value = '(second)';
    expect(listeners.size).toBe(0);
    expect(window.matchMedia).toHaveBeenCalledOnce();
  });

  it('切换到同样匹配的查询不会短暂发布回退值', () => {
    const { media } = createMediaQuery(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const scope = effectScope();
    const changes: boolean[] = [];
    const query = ref('(first)');
    scope.run(() => {
      const matches = useMediaQuery(query);
      watch(matches, value => changes.push(value), { flush: 'sync' });
    });
    query.value = '(second)';
    expect(changes).toEqual([]);
    scope.stop();
  });

  it('同步订阅者在匹配变化时停止作用域也能完整释放监听', () => {
    const first = createMediaQuery(false);
    const second = createMediaQuery(true);
    vi.spyOn(window, 'matchMedia').mockImplementation(query =>
      query === '(first)' ? first.media : second.media
    );
    const scope = effectScope();
    const query = ref('(first)');
    scope.run(() => {
      const matches = useMediaQuery(query);
      watch(
        matches,
        value => {
          if (value) scope.stop();
        },
        { flush: 'sync' }
      );
    });
    expect(() => {
      query.value = '(second)';
    }).not.toThrow();
    expect(first.listeners.size).toBe(0);
    expect(second.listeners.size).toBe(0);
  });
});
