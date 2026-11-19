import { getCurrentScope, onScopeDispose, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

type EventTargetSource<T extends EventTarget> = MaybeRefOrGetter<T | null | undefined>;

export function useEventListener<K extends keyof WindowEventMap>(
  target: EventTargetSource<Window>,
  type: K,
  listener: (this: Window, ev: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): () => void;
export function useEventListener<K extends keyof DocumentEventMap>(
  target: EventTargetSource<Document>,
  type: K,
  listener: (this: Document, ev: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): () => void;
export function useEventListener<E extends HTMLElement>(
  target: EventTargetSource<E>,
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions
): () => void;
export function useEventListener(
  target: EventTargetSource<EventTarget>,
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions
): () => void;
/** 目标变化时重新绑定，并允许独立作用域或异步调用者显式释放监听。 */
export function useEventListener(
  target: EventTargetSource<EventTarget>,
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions
): () => void {
  const stop = watch(
    () => toValue(target),
    (element, _previous, onCleanup) => {
      if (!element) return;
      // 移除监听只依赖 capture，快照它以免调用方随后修改 options。
      const capture = typeof options === 'boolean' ? options : options?.capture;
      element.addEventListener(type, listener, options);
      onCleanup(() => element.removeEventListener(type, listener, capture));
    },
    { immediate: true, flush: 'post' }
  );

  if (getCurrentScope()) onScopeDispose(stop);
  return stop;
}
