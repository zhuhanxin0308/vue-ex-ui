import { defineComponent, renderSlot } from 'vue';
import type { ComponentInternalInstance, Slots } from 'vue';
import { ssrRenderSlot, ssrRenderSlotInner } from 'vue/server-renderer';
import { createSharedInjectionKey } from '../../utils/shared-runtime';
import { createStepOutlet, slotScopeIds } from './step-outlet';
import type { StepRenderChunk as Chunk, StepServerRender } from './step-outlet';

type DeferredStep = { uid: symbol; content: Promise<string[]>; render: () => void };

// Vue 的 SSR 插槽输出由文本、子数组和异步子数组构成；先保留步骤位置，
// 待所有包装的输出就绪后再运行各步内容，异步完成顺序不会改变页面顺序。
async function collect<T>(
  chunks: Chunk[],
  positions: Map<Chunk, T>,
  parts: Array<string | T>
): Promise<void> {
  for (const chunk of chunks) {
    if (typeof chunk === 'string') {
      parts.push(chunk);
    } else {
      const position = positions.get(chunk);
      if (position !== undefined) parts.push(position);
      else await collect(await chunk, positions, parts);
    }
  }
}

const makeContent = (singleRoot: boolean, ssrRender?: StepServerRender) =>
  defineComponent({
    name: singleRoot ? 'ExStepContent' : 'ExStepsContent',
    inheritAttrs: false,
    render() {
      return singleRoot
        ? this.$slots.default?.({ rootScope: this.$attrs })[0]
        : renderSlot(this.$slots, 'default');
    },
    ssrRender,
  });

export const StandaloneStepContent = makeContent(true);

const readStep = async (
  slots: Slots,
  parent: ComponentInternalInstance,
  rootScope: Record<string, unknown>
) => {
  const chunks: Chunk[] = [];
  ssrRenderSlotInner(slots, 'default', { rootScope }, null, part => chunks.push(part), parent);
  const parts: string[] = [];
  await collect(chunks, new Map<Chunk, never>(), parts);
  return parts;
};

export function createStepsContent(setOrder: (uids: symbol[]) => void) {
  const positions = new Map<Chunk, DeferredStep>();
  let ordered = false;

  const stepContent = (uid: symbol, slots: Slots, names: () => readonly string[]) => {
    const { StepOutlet, prepare } = createStepOutlet(slots, true);
    const StepContent = makeContent(true, (context, push, parent, attrs) => {
      // 先按原时机渲染业务插槽，使 Teleport、嵌套组件与后续兄弟保持原次序。
      prepare(names(), parent);
      // 父 SFC 的普通作用域只属于步骤根元素，不能作为插槽作用域铺到整个子树。
      const rootScope = Object.fromEntries(
        Object.entries({ ...context.$attrs, ...attrs }).filter(
          ([key]) => key.startsWith('data-v-') && key !== parent.vnode.scopeId
        )
      );
      const render = () => readStep(context.$slots, parent, rootScope);
      if (ordered) {
        push(render());
        return;
      }
      let start!: () => void;
      const content = new Promise<string[]>(resolve => {
        start = () => resolve(render());
      });
      positions.set(content, { uid, content, render: start });
      push(content);
    });
    return { StepOutlet, StepContent };
  };

  const readGroup = async (
    slots: Slots,
    parent: ComponentInternalInstance,
    attrs?: Record<string, unknown>
  ) => {
    const chunks: Chunk[] = [];
    ssrRenderSlot(
      slots,
      'default',
      null,
      null,
      part => chunks.push(part),
      parent,
      slotScopeIds(attrs)
    );
    const parts: Array<string | DeferredStep> = [];
    await collect(chunks, positions, parts);
    const steps = parts.filter(part => typeof part !== 'string');
    setOrder(steps.map(step => step.uid));
    ordered = true;
    // 按视觉次序运行插槽，外部 Teleport 中的步骤也需要释放到自己的目标。
    for (const step of new Set([...steps, ...positions.values()])) step.render();
    positions.clear();
    return (
      await Promise.all(parts.map(part => (typeof part === 'string' ? part : part.content)))
    ).flat();
  };
  const SlotContent = makeContent(false, (context, push, parent, attrs) =>
    push(readGroup(context.$slots, parent, attrs))
  );
  return { stepContent, SlotContent };
}

export const stepContentKey =
  createSharedInjectionKey<ReturnType<typeof createStepsContent>['stepContent']>(
    'ordered-step-content'
  );
