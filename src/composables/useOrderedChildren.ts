import { onBeforeUnmount, onMounted, onUpdated, shallowReactive } from 'vue';
import type { Ref } from 'vue';

interface OrderedChild {
  uid: symbol;
  getElement: () => HTMLElement | null;
}

/** setup 注册顺序用于首屏与 SSR，挂载后以真实 DOM 校准包装组件内的移动。 */
export function useOrderedChildren<T extends OrderedChild>(
  root: Ref<HTMLElement | undefined>,
  onSync?: () => void
) {
  const children = shallowReactive<T[]>([]);
  const indexOf = (uid: symbol) => children.findIndex(child => child.uid === uid);
  const register = (child: T) => {
    const index = indexOf(child.uid);
    if (index < 0) children.push(child);
    else children[index] = child;
  };
  const unregister = (uid: symbol) => {
    const index = indexOf(uid);
    if (index >= 0) children.splice(index, 1);
  };
  const sync = () => {
    const ordered = [...children].sort((left, right) => {
      const a = left.getElement();
      const b = right.getElement();
      if (!a || !b || a === b) return 0;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    if (ordered.some((child, index) => child !== children[index])) {
      children.splice(0, children.length, ...ordered);
    }
    onSync?.();
  };

  let observer: MutationObserver | undefined;
  onMounted(() => {
    sync();
    if (root.value && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(sync);
      observer.observe(root.value, { childList: true, subtree: true });
    }
  });
  onUpdated(sync);
  onBeforeUnmount(() => observer?.disconnect());
  return { children, register, unregister, indexOf, sync };
}
