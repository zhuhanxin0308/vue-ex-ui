import { defineComponent, renderSlot } from 'vue';
import type { ComponentInternalInstance, ComponentPublicInstance, Slots } from 'vue';
import { ssrRenderSlot, ssrRenderSlotInner } from 'vue/server-renderer';

type Push = Parameters<typeof ssrRenderSlot>[4];
export type StepRenderChunk = Parameters<Push>[0];
export type StepServerRender = (
  context: ComponentPublicInstance,
  push: Push,
  parent: ComponentInternalInstance,
  attrs?: Record<string, unknown>
) => void;

export const slotScopeIds = (attrs?: Record<string, unknown>) =>
  Object.keys(attrs ?? {})
    .filter(key => key.startsWith('data-v-') && key.endsWith('-s'))
    .join(' ');

/** 原位执行用户插槽，延迟绘制步骤外壳时复用输出与传送位置。 */
export function createStepOutlet(slots: Slots, deferShell = false) {
  const replay: Record<string, (_props: unknown, push: Push) => void> = {};
  const prepare = (names: readonly string[], parent: ComponentInternalInstance) => {
    for (const name of names) {
      if (!slots[name]) continue;
      const chunks: StepRenderChunk[] = [];
      ssrRenderSlotInner(slots, name, null, null, part => chunks.push(part), parent);
      // 有效的 Teleport 在原位置只有注释，仍需保留整段输出供水合定位。
      if (chunks.length) replay[name] = (_props, push) => push(chunks);
    }
  };

  const renderPrepared: StepServerRender = (context, push, parent, attrs) => {
    const { name } = context.$props as { name: string };
    const fallback = () => ssrRenderSlotInner(context.$slots, 'default', null, null, push, parent);
    ssrRenderSlot(replay, name, null, fallback, push, parent, slotScopeIds(attrs));
  };
  const StepOutlet = defineComponent({
    name: 'ExStepSlot',
    props: { name: { type: String, required: true } },
    render() {
      return renderSlot(slots, this.name, {}, this.$slots.default);
    },
    ssrRender: deferShell ? renderPrepared : undefined,
  });
  return { StepOutlet, prepare };
}
