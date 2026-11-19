import {
  getCurrentInstance,
  getCurrentScope,
  onMounted,
  onScopeDispose,
  ref,
  toValue,
  watch,
} from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';

export interface UseMediaQueryOptions {
  /** SSR 或不支持媒体查询时使用的初始值；显式传入时保留水合首帧。 */
  initialValue?: boolean;
}

/**
 * 监听媒体查询并随调用作用域自动清理；无作用域时只返回同步快照。
 */
export function useMediaQuery(
  query: MaybeRefOrGetter<string>,
  options: UseMediaQueryOptions = {}
): Ref<boolean> {
  if (!toValue(query).trim()) {
    throw new TypeError('[ExUI] 媒体查询不能为空');
  }

  const matches = ref(options.initialValue ?? false);
  let mediaQueryList: MediaQueryList | null = null;
  const instance = getCurrentInstance();
  const scope = getCurrentScope();
  let disposed = false;
  // 显式 SSR 初值在挂载后切换；纯客户端与独立作用域立即读取真实状态。
  let ready = options.initialValue === undefined || !instance || instance.isMounted;

  const updateMatches = (event: MediaQueryListEvent | MediaQueryList): void => {
    matches.value = event.matches;
  };

  const cleanup = () => {
    if (!mediaQueryList) return;
    if (typeof mediaQueryList.removeEventListener === 'function') {
      mediaQueryList.removeEventListener('change', updateMatches);
    } else {
      mediaQueryList.removeListener(updateMatches);
    }
    mediaQueryList = null;
  };

  const synchronize = () => {
    if (!ready || disposed) return;
    cleanup();
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      matches.value = options.initialValue ?? false;
      return;
    }

    let nextQuery: MediaQueryList;
    try {
      nextQuery = window.matchMedia(toValue(query));
    } catch {
      // 不支持的查询保持调用方提供的初始值，不污染宿主控制台。
      matches.value = options.initialValue ?? false;
      return;
    }

    if (scope) {
      mediaQueryList = nextQuery;
      if (typeof nextQuery.addEventListener === 'function') {
        nextQuery.addEventListener('change', updateMatches);
      } else {
        nextQuery.addListener(updateMatches);
      }
    }
    // 同步订阅者可能立即停止作用域或更换查询，发布后不再访问共享监听句柄。
    matches.value = nextQuery.matches;
  };

  if (scope) watch(() => toValue(query), synchronize, { immediate: true, flush: 'sync' });
  else synchronize();
  if (!ready) {
    onMounted(() => {
      ready = true;
      synchronize();
    });
  }
  if (scope) {
    onScopeDispose(() => {
      disposed = true;
      cleanup();
    });
  }

  return matches;
}

export function useMediaQueries<T extends Record<string, string>>(
  queries: T
): { [K in keyof T]: Ref<boolean> } {
  const result = {} as { [K in keyof T]: Ref<boolean> };

  for (const key of Object.keys(queries) as Array<keyof T>) {
    const query = queries[key];
    if (typeof query !== 'string') {
      throw new TypeError(`[ExUI] 媒体查询 ${String(key)} 必须是字符串`);
    }
    result[key] = useMediaQuery(query);
  }

  return result;
}

export const breakpointQueries = {
  xs: '(max-width: 479px)',
  sm: '(min-width: 480px) and (max-width: 767px)',
  md: '(min-width: 768px) and (max-width: 1023px)',
  lg: '(min-width: 1024px) and (max-width: 1279px)',
  xl: '(min-width: 1280px) and (max-width: 1535px)',
  xxl: '(min-width: 1536px)',
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1279px)',
  desktop: '(min-width: 1280px)',
} as const;

export function useBreakpoints(): {
  [K in keyof typeof breakpointQueries]: Ref<boolean>;
} {
  return useMediaQueries(breakpointQueries);
}
