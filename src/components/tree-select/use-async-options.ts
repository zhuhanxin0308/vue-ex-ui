import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { pruneTreeCycles } from '../../utils/tree-cycles';

export type OptionValue = string | number;
export interface AsyncOption<T> {
  value: OptionValue;
  label: string;
  children?: T[];
  disabled?: boolean;
  isLeaf?: boolean;
}
export interface OptionLoadContext {
  signal: AbortSignal;
  path: OptionValue[];
}
export interface OptionLoadState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error?: unknown;
}
export interface OptionEntry<T> {
  node: T;
  source: T;
  path: OptionValue[];
  disabled: boolean;
}
interface IndexedEntry<T> extends OptionEntry<T> {
  start: number;
  end: number;
}
interface AsyncOptions<T extends AsyncOption<T>> {
  data: () => T[];
  loader: () => ((node: T, context: OptionLoadContext) => Promise<T[]>) | undefined;
  blocked: () => boolean;
  active: () => boolean;
  identity: 'value' | 'path';
  onLoad: (node: T, children: T[], path: OptionValue[]) => void;
  onError: (error: unknown, node: T, path: OptionValue[]) => void;
}

/** 共享异步生命周期；树选择按值识别，级联选择按完整路径识别。 */
export function useAsyncOptions<T extends AsyncOption<T>>(options: AsyncOptions<T>) {
  const safeData = computed(() =>
    pruneTreeCycles(
      options.data(),
      options.identity === 'value' ? 'TreeSelect' : 'Cascader',
      options.identity === 'value' && !options.loader() ? node => node.value : undefined
    )
  );
  const branches = shallowRef(new Map<string, { source: T; children: T[] }>());
  const states = shallowRef(new Map<string, OptionLoadState>());
  const requestedPaths = shallowRef<OptionValue[][]>([]);
  const pending = new Map<
    string,
    {
      controller: AbortController;
      promise: Promise<boolean>;
      settle: (value: boolean) => void;
      expandedOnly: boolean;
    }
  >();
  const cancelled = new Set<string>();
  let previousWanted = new Set<string>();
  let mounted = false;
  let disposed = false;
  const keyFor = (path: readonly OptionValue[]) =>
    JSON.stringify(options.identity === 'value' ? path[path.length - 1] : path);

  const indexed = computed(() => {
    const data: T[] = [];
    const entries = new Map<string, IndexedEntry<T>>();
    const orderedKeys: string[] = [];
    const ancestors = new Set<T>();
    const parents = new WeakMap<OptionEntry<T>, OptionEntry<T>>();
    const stack: Array<{
      source: T;
      target: T[];
      parent?: OptionEntry<T>;
      disabled: boolean;
      exit?: IndexedEntry<T>;
    }> = safeData.value.map(source => ({ source, target: data, disabled: false })).reverse();
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) {
        frame.exit.end = orderedKeys.length;
        ancestors.delete(frame.source);
        continue;
      }
      const source = frame.source;
      if (!source || typeof source !== 'object' || ancestors.has(source)) {
        throw new TypeError('选项必须是无循环引用的树节点');
      }
      const key = keyFor(
        options.identity === 'value'
          ? [source.value]
          : [...(frame.parent?.path ?? []), source.value]
      );
      if (entries.has(key)) throw new TypeError('选项身份重复，无法可靠选择或加载');
      const branch = branches.value.get(key);
      const loaded = branch?.source === source ? branch : undefined;
      const children = loaded?.children ?? source.children;
      const node = { ...source } as T;
      if (loaded) node.isLeaf = loaded.children.length === 0;
      frame.target.push(node);
      const disabled = frame.disabled || Boolean(node.disabled);
      const entry: IndexedEntry<T> = {
        node,
        source,
        disabled,
        start: orderedKeys.length,
        end: orderedKeys.length + 1,
        // 唯一值树只在实际加载时生成路径，深树初始化保持线性空间。
        get path() {
          const path: OptionValue[] = [];
          let cursor: OptionEntry<T> | undefined = entry;
          while (cursor) {
            path.push(cursor.node.value);
            cursor = parents.get(cursor);
          }
          return path.reverse();
        },
      };
      if (frame.parent) parents.set(entry, frame.parent);
      entries.set(key, entry);
      orderedKeys.push(key);
      if (children) {
        node.children = [];
        ancestors.add(source);
        stack.push({ ...frame, exit: entry });
        for (let index = children.length - 1; index >= 0; index--) {
          stack.push({ source: children[index]!, target: node.children, parent: entry, disabled });
        }
      }
    }
    return { data, entries, orderedKeys };
  });

  const stateFor = (path: readonly OptionValue[]): OptionLoadState => ({
    ...(states.value.get(keyFor(path)) ?? { status: 'idle' }),
  });
  const setState = (key: string, state: OptionLoadState) => {
    const next = new Map(states.value);
    next.set(key, state);
    states.value = next;
  };
  const cancelKey = (key: string): boolean => {
    const request = pending.get(key);
    if (!request) return false;
    pending.delete(key);
    cancelled.add(key);
    request.controller.abort();
    request.settle(false);
    setState(key, { status: branches.value.has(key) ? 'loaded' : 'idle' });
    return true;
  };
  const cancel = (path: readonly OptionValue[]) => cancelKey(keyFor(path));
  const cancelAll = () => {
    for (const key of [...pending.keys()]) {
      const entry = indexed.value.entries.get(key);
      if (entry) cancel(entry.path);
      else {
        const request = pending.get(key)!;
        pending.delete(key);
        request.controller.abort();
        request.settle(false);
      }
    }
  };

  /** 校验并复制返回结构，拒绝重复身份、循环、无效字段及其他分支身份冲突。 */
  const cloneChildren = (value: unknown, parent: IndexedEntry<T>, checkConflicts = false): T[] => {
    if (!Array.isArray(value)) throw new TypeError('loadData 必须返回子节点数组');
    const occupied = new Set<string>();
    const existingEntries = checkConflicts ? indexed.value.entries : undefined;
    const result: T[] = [];
    const seen = new Set<object>();
    const basePath = options.identity === 'path' ? parent.path : [];
    const stack = value
      .map(node => ({ node: node as unknown, target: result, path: basePath }))
      .reverse();
    while (stack.length) {
      const { node, target, path } = stack.pop()!;
      if (!node || typeof node !== 'object' || Array.isArray(node) || seen.has(node)) {
        throw new TypeError('loadData 返回了无效或循环节点');
      }
      const candidate = node as T;
      const validValue =
        typeof candidate.value === 'string' ||
        (typeof candidate.value === 'number' && Number.isFinite(candidate.value));
      if (!validValue || typeof candidate.label !== 'string') {
        throw new TypeError('子节点必须具有有效 value 和字符串 label');
      }
      for (const field of ['disabled', 'isLeaf'] as const) {
        if (candidate[field] !== undefined && typeof candidate[field] !== 'boolean') {
          throw new TypeError(`子节点 ${field} 必须是布尔值`);
        }
      }
      if (candidate.children !== undefined && !Array.isArray(candidate.children)) {
        throw new TypeError('子节点 children 必须是数组');
      }
      const nextPath = options.identity === 'path' ? [...path, candidate.value] : [candidate.value];
      const key = keyFor(nextPath);
      const existing = existingEntries?.get(key);
      // 深度优先序中，只有被替换子树内部的已有身份允许重用。
      if (
        occupied.has(key) ||
        (existing && (existing.start <= parent.start || existing.start >= parent.end))
      ) {
        throw new TypeError('loadData 返回了重复或冲突的选项身份');
      }
      occupied.add(key);
      seen.add(node);
      const copy = { ...candidate } as T;
      target.push(copy);
      if (candidate.children) {
        copy.children = [];
        for (let index = candidate.children.length - 1; index >= 0; index--) {
          stack.push({ node: candidate.children[index], target: copy.children, path: nextPath });
        }
      }
    }
    return result;
  };

  const load = (
    path: readonly OptionValue[],
    force = false,
    expandedOnly = false
  ): Promise<boolean> => {
    const key = keyFor(path);
    const entry = indexed.value.entries.get(key);
    const loader = options.loader();
    if (
      !mounted ||
      disposed ||
      options.blocked() ||
      !options.active() ||
      !entry ||
      entry.disabled ||
      !loader ||
      (force ? entry.source.isLeaf : entry.node.isLeaf)
    ) {
      return Promise.resolve(false);
    }
    const existing = pending.get(key);
    if (existing && !force) return existing.promise;
    if (force) cancel(path);
    else if (branches.value.has(key) || entry.node.children?.length) return Promise.resolve(true);
    if (!force && (cancelled.has(key) || states.value.get(key)?.status === 'error'))
      return Promise.resolve(false);
    cancelled.delete(key);
    const controller = new AbortController();
    let settle!: (value: boolean) => void;
    const promise = new Promise<boolean>(resolve => {
      settle = resolve;
    });
    const request = { controller, promise, settle, expandedOnly };
    pending.set(key, request);
    setState(key, { status: 'loading' });
    const isCurrent = () => !disposed && pending.get(key) === request && !controller.signal.aborted;
    void (async () => {
      try {
        const input = { ...entry.node };
        if (entry.node.children) input.children = cloneChildren(entry.node.children, entry);
        const value = await loader(input, { signal: controller.signal, path: [...entry.path] });
        if (!isCurrent()) return;
        const { entries, orderedKeys } = indexed.value;
        const current = entries.get(key)!;
        const children = cloneChildren(value, current, true);
        const next = new Map(branches.value);
        const nextStates = new Map(states.value);
        for (let index = current.start + 1; index < current.end; index++) {
          const childKey = orderedKeys[index]!;
          cancelKey(childKey);
          next.delete(childKey);
          nextStates.delete(childKey);
          cancelled.delete(childKey);
        }
        next.set(key, { source: current.source, children });
        pending.delete(key);
        states.value = nextStates;
        branches.value = next;
        setState(key, { status: 'loaded' });
        settle(true);
        const output = {
          ...indexed.value.entries.get(key)!.node,
          children: cloneChildren(children, current),
        };
        options.onLoad(output, cloneChildren(children, current), [...current.path]);
      } catch (error) {
        if (!isCurrent()) return;
        pending.delete(key);
        setState(key, { status: 'error', error });
        settle(false);
        options.onError(error, entry.node, [...entry.path]);
      }
    })();
    return promise;
  };
  const expandable = (node: T, path: readonly OptionValue[]) =>
    Boolean(node.children?.length) ||
    Boolean(options.loader() && node.isLeaf === false && !branches.value.has(keyFor(path)));

  const synchronize = () => {
    if (!options.loader()) return;
    const wanted = new Map<string, readonly OptionValue[]>();
    if (options.active() && !options.blocked()) {
      for (const path of requestedPaths.value) {
        const key = keyFor(path);
        const entry = indexed.value.entries.get(key);
        if (entry && !entry.disabled) wanted.set(key, path);
      }
    }
    for (const [key, request] of pending) {
      if (!options.active() || options.blocked() || (request.expandedOnly && !wanted.has(key))) {
        const entry = indexed.value.entries.get(key);
        if (entry) cancelKey(key);
      }
    }
    for (const [key, path] of wanted) {
      const entry = indexed.value.entries.get(key)!;
      if (!previousWanted.has(key)) {
        cancelled.delete(key);
        if (states.value.get(key)?.status === 'error') setState(key, { status: 'idle' });
      }
      // 保留调用方的身份路径，静态展开分支不必生成完整父链；真正加载时再构造回调路径。
      if (expandable(entry.node, path)) void load(path, false, true);
    }
    previousWanted = new Set(wanted.keys());
  };
  const invalidate = () => {
    cancelAll();
    branches.value = new Map();
    states.value = new Map();
    cancelled.clear();
    previousWanted = new Set();
  };
  // 显式迭代读取结构依赖，避免 Vue 的 deep 遍历在万层树上耗尽调用栈。
  const sourceSnapshot = computed(() => {
    const data = options.data();
    if (!options.loader()) return [data];
    const snapshot: unknown[] = [data];
    const seen = new Set<T>();
    const stack = [...data];
    while (stack.length) {
      const node = stack.pop()!;
      if (!node || seen.has(node)) continue;
      seen.add(node);
      snapshot.push(node, node.value, node.label, node.disabled, node.isLeaf, node.children);
      for (const child of node.children ?? []) stack.push(child);
    }
    return snapshot;
  });
  watch([sourceSnapshot, options.loader], invalidate, { flush: 'sync' });
  watch(
    [
      () => (options.loader() ? indexed.value : null),
      requestedPaths,
      options.blocked,
      options.active,
    ],
    synchronize
  );
  onMounted(() => {
    mounted = true;
    synchronize();
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancelAll();
  });
  return {
    data: computed(() => (options.loader() ? indexed.value.data : safeData.value)),
    entries: computed(() => indexed.value.entries),
    keyFor,
    expandable,
    stateFor,
    load,
    reload: (path: readonly OptionValue[]) => load(path, true),
    cancel,
    cancelAll,
    syncExpanded: (paths: OptionValue[][]) => {
      if (JSON.stringify(paths) !== JSON.stringify(requestedPaths.value))
        requestedPaths.value = paths;
    },
  };
}
