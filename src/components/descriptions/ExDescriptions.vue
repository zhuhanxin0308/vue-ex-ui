<template>
  <div :class="rootClasses">
    <div
      v-if="hasHeader"
      class="ex-descriptions__header"
      :class="{ 'has-title': hasTitle }"
    >
      <div
        v-if="hasTitle"
        :id="titleId"
        class="ex-descriptions__title"
      >
        <Cell :nodes="titleContent" />
      </div>
      <div
        v-if="hasExtra"
        class="ex-descriptions__extra"
      >
        <Cell :nodes="extraContent" />
      </div>
    </div>

    <div class="ex-descriptions__body">
      <span
        :id="parkingId"
        hidden
      ></span>
      <table
        class="ex-descriptions__table"
        :aria-labelledby="hasTitle ? titleId : undefined"
      >
        <tbody>
          <tr
            v-for="row in mountedRows"
            :key="row.index"
            :hidden="row.index >= tableRows.length || undefined"
            class="ex-descriptions__row"
          >
            <component
              :is="cell.kind === 'label' ? 'th' : 'td'"
              v-for="cell in row.cells"
              :id="cell.placement !== 'origin' ? cell.id : undefined"
              :key="cell.key"
              :ref="
                cell.placement === 'outlet'
                  ? (el: unknown) => setOutlet(cell.destination, el)
                  : undefined
              "
              :hidden="cell.placement === 'origin' || undefined"
              class="ex-descriptions__cell"
              :class="[`ex-descriptions__${cell.kind}`, cell.className, alignClass(cell.align)]"
              :style="cell.placement === 'origin' ? { display: 'none' } : cell.style"
              :colspan="cell.colspan"
              :headers="cell.headers"
            >
              <Teleport
                v-if="cell.placement !== 'outlet'"
                :disabled="cell.placement === 'inline' || !outlets.has(cell.destination)"
                :to="outlets.get(cell.destination) ?? parkingSelector"
              >
                <span
                  v-if="cell.kind === 'label'"
                  class="ex-descriptions__label-inner"
                >
                  <Cell :nodes="cell.nodes" />
                  <span
                    v-if="showColon && cell.hasLabel"
                    class="ex-descriptions__colon"
                  >
                    :
                  </span>
                </span>
                <Cell
                  v-else
                  :nodes="cell.nodes"
                />
              </Teleport>
            </component>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, Fragment, shallowReactive, useId, useSlots } from 'vue';
import { useRenderComputed } from '../../composables/useRenderComputed';
import { hasRenderableContent } from '../../utils/vnode';
import type { CSSProperties, Slots, VNode, VNodeArrayChildren } from 'vue';
import { useComponentSize } from '../config-provider/composables';
import type { DescriptionsAlign, DescriptionsClass, ExDescriptionsProps } from './types';

defineOptions({
  name: 'ExDescriptions',
});

const props = withDefaults(defineProps<ExDescriptionsProps>(), {
  column: 3,
  border: false,
  size: undefined,
  direction: 'horizontal',
  labelAlign: 'left',
  contentAlign: 'left',
  colon: true,
});

const slots = useSlots();
const componentSize = useComponentSize(computed(() => props.size));
const instanceId = useId();
const safeId = Array.from(instanceId, c => c.codePointAt(0)?.toString(16)).join('-');
const parkingId = `ex-descriptions-anchors-${safeId}`;
const parkingSelector = `#${parkingId}`;
const titleId = `ex-descriptions-title-${instanceId}`;
const titleContent = useRenderComputed(() => {
  const nodes = slots.title?.();
  return hasRenderableContent(nodes) ? nodes : props.title;
});
const hasTitle = computed(() => hasRenderableContent(titleContent.value));
const extraContent = useRenderComputed(() => slots.extra?.());
const hasExtra = computed(() => hasRenderableContent(extraContent.value));
const hasHeader = computed(() => hasTitle.value || hasExtra.value);
const showColon = computed(() => !props.border && props.colon);

const rootClasses = computed(() => [
  'ex-descriptions',
  `ex-descriptions--${componentSize.value}`,
  `ex-descriptions--${props.direction}`,
  { 'ex-descriptions--border': props.border },
]);

/** 渲染已收集的插槽节点，内容始终由 Vue 进行安全转义。 */
const Cell = (cellProps: { nodes: VNode[] | string | undefined }) => cellProps.nodes ?? '';

interface ParsedItem {
  id: string;
  label?: string;
  labelNodes?: VNode[];
  contentNodes: VNode[] | string;
  hasLabel: boolean;
  span: number;
  labelAlign?: DescriptionsAlign;
  contentAlign?: DescriptionsAlign;
  labelClass?: DescriptionsClass;
  contentClass?: DescriptionsClass;
  labelStyle?: CSSProperties;
  contentStyle?: CSSProperties;
}

const MAX_TABLE_COLUMNS = 1000;
const HORIZONTAL_CELLS_PER_ITEM = 2;
const VALID_ALIGNMENTS: readonly DescriptionsAlign[] = ['left', 'center', 'right'];

const normalizePositiveInteger = (value: unknown, fallback: number, maximum: number): number => {
  let numericValue: number;
  try {
    numericValue = typeof value === 'number' ? value : Number(value);
  } catch {
    return fallback;
  }
  if (!Number.isFinite(numericValue)) return fallback;
  const integer = Math.trunc(numericValue);
  return integer > 0 ? Math.min(integer, maximum) : fallback;
};

const normalizedColumn = computed(() =>
  normalizePositiveInteger(
    props.column,
    3,
    props.direction === 'vertical'
      ? MAX_TABLE_COLUMNS
      : MAX_TABLE_COLUMNS / HORIZONTAL_CELLS_PER_ITEM
  )
);

const normalizeAlign = (
  value: DescriptionsAlign | undefined,
  fallback: DescriptionsAlign
): DescriptionsAlign => (value && VALID_ALIGNMENTS.includes(value) ? value : fallback);

const getProp = (vnodeProps: Record<string, unknown> | null, ...names: string[]): unknown => {
  if (!vnodeProps) return undefined;
  for (const name of names) {
    if (vnodeProps[name] !== undefined) return vnodeProps[name];
  }
  return undefined;
};

const isItemVNode = (vnode: VNode): boolean => {
  const type = vnode.type as { name?: string; __name?: string } | undefined;
  return Boolean(
    type &&
    typeof type === 'object' &&
    (type.name === 'ExDescriptionsItem' || type.__name === 'ExDescriptionsItem')
  );
};

/** 递归展开 Fragment 与嵌套数组，兼容 template、v-for 和条件插槽。 */
const flatten = (children: VNodeArrayChildren | undefined): VNode[] => {
  const result: VNode[] = [];
  if (!children) return result;
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flatten(child));
      continue;
    }
    if (child == null || typeof child !== 'object') continue;
    const vnode = child as VNode;
    if (vnode.type === Fragment) result.push(...flatten(vnode.children as VNodeArrayChildren));
    else result.push(vnode);
  }
  return result;
};

let nextItemId = 0;
let itemIds = new Map<PropertyKey, number>();
const items = useRenderComputed<ParsedItem[]>(() => {
  const raw = ((slots as Slots).default?.() ?? []) as VNodeArrayChildren;
  const previousIds = itemIds;
  itemIds = new Map();
  return flatten(raw)
    .filter(isItemVNode)
    .map((vnode, index) => {
      const vnodeProps = (vnode.props ?? {}) as Record<string, unknown>;
      const children = (vnode.children ?? {}) as Record<string, (() => VNode[]) | undefined>;
      const label = getProp(vnodeProps, 'label') as string | undefined;
      const labelNodes = typeof children.label === 'function' ? children.label() : undefined;
      const hasSlotLabel = hasRenderableContent(labelNodes);
      const key = vnode.key;
      const serial = key === null ? undefined : (previousIds.get(key) ?? nextItemId++);
      if (key !== null && serial !== undefined) itemIds.set(key, serial);
      return {
        id: `ex-descriptions-label-${instanceId}-${serial === undefined ? 'index-' + index : 'key-' + serial}`,
        label,
        labelNodes: hasSlotLabel ? labelNodes : undefined,
        contentNodes: typeof children.default === 'function' ? children.default() : '',
        hasLabel: hasSlotLabel || Boolean(label?.trim()),
        span: normalizePositiveInteger(getProp(vnodeProps, 'span') ?? 1, 1, normalizedColumn.value),
        labelAlign: getProp(vnodeProps, 'labelAlign', 'label-align') as
          DescriptionsAlign | undefined,
        contentAlign: getProp(vnodeProps, 'contentAlign', 'content-align') as
          DescriptionsAlign | undefined,
        labelClass: getProp(vnodeProps, 'labelClass', 'label-class') as
          DescriptionsClass | undefined,
        contentClass: getProp(vnodeProps, 'contentClass', 'content-class') as
          DescriptionsClass | undefined,
        labelStyle: getProp(vnodeProps, 'labelStyle', 'label-style') as CSSProperties | undefined,
        contentStyle: getProp(vnodeProps, 'contentStyle', 'content-style') as
          CSSProperties | undefined,
      };
    });
});

/** 按列数分行，并让每行最后一项填充剩余列。 */
const rowGroups = computed<ParsedItem[][]>(() => {
  const column = normalizedColumn.value;
  const rows: ParsedItem[][] = [];
  let current: ParsedItem[] = [];
  let usedColumns = 0;

  for (const sourceItem of items.value) {
    const item = { ...sourceItem, span: Math.min(sourceItem.span, column) };
    if (usedColumns + item.span > column && current.length) {
      current[current.length - 1]!.span += column - usedColumns;
      rows.push(current);
      current = [];
      usedColumns = 0;
    }
    current.push(item);
    usedColumns += item.span;
  }

  if (current.length) {
    current[current.length - 1]!.span += column - usedColumns;
    rows.push(current);
  }
  return rows;
});

interface RenderCell {
  key: string;
  kind: 'label' | 'content';
  nodes: VNode[] | string | undefined;
  colspan: number;
  hasLabel?: boolean;
  id?: string;
  headers?: string;
  align: DescriptionsAlign;
  className?: DescriptionsClass;
  style?: CSSProperties;
}

const labelOf = (item: ParsedItem): VNode[] | string => item.labelNodes ?? item.label ?? '';
const mergedLabelStyle = (item: ParsedItem): CSSProperties => ({
  ...(props.labelStyle || {}),
  ...(item.labelStyle || {}),
});
const mergedContentStyle = (item: ParsedItem): CSSProperties => ({
  ...(props.contentStyle || {}),
  ...(item.contentStyle || {}),
});

const createLabelCell = (item: ParsedItem): RenderCell => ({
  key: `${item.id}-label`,
  kind: 'label',
  id: item.hasLabel ? item.id : undefined,
  nodes: labelOf(item),
  colspan: props.direction === 'vertical' ? item.span : 1,
  hasLabel: item.hasLabel,
  align: normalizeAlign(item.labelAlign, props.labelAlign),
  className: item.labelClass,
  style: mergedLabelStyle(item),
});

const createContentCell = (item: ParsedItem): RenderCell => ({
  key: `${item.id}-content`,
  kind: 'content',
  headers: item.hasLabel ? item.id : undefined,
  nodes: item.contentNodes,
  colspan: props.direction === 'vertical' ? item.span : item.span * 2 - 1,
  align: normalizeAlign(item.contentAlign, props.contentAlign),
  className: item.contentClass,
  style: mergedContentStyle(item),
});

const tableRows = computed<RenderCell[][]>(() => {
  const rows: RenderCell[][] = [];
  for (const group of rowGroups.value) {
    if (props.direction === 'vertical') {
      rows.push(group.map(createLabelCell));
      rows.push(group.map(createContentCell));
    } else {
      rows.push(group.flatMap(item => [createLabelCell(item), createContentCell(item)]));
    }
  }
  return rows;
});

// Vue 的 key 在同一父节点内生效。跨原生表格行时保持插槽的挂载位置，
// 将其输出移至新行的真实单元格，水合首屏和普通同排更新都直接原位渲染。
type MountedCell = RenderCell & {
  placement: 'inline' | 'origin' | 'outlet';
  destination: string;
};
let homeRows = new Map<string, number>();
const mountedRows = computed(() => {
  const previous = homeRows;
  homeRows = new Map();
  const rows = new Map<number, MountedCell[]>();
  const append = (index: number, cell: MountedCell) => {
    const row = rows.get(index);
    if (row) row.push(cell);
    else rows.set(index, [cell]);
  };
  tableRows.value.forEach((row, index) => {
    for (const cell of row) {
      const home = previous.get(cell.key) ?? index;
      homeRows.set(cell.key, home);
      const destination = `${index}-${cell.key}`;
      append(index, { ...cell, destination, placement: home === index ? 'inline' : 'outlet' });
      if (home !== index) append(home, { ...cell, destination, placement: 'origin' });
    }
  });
  return [...rows]
    .sort(([left], [right]) => left - right)
    .map(([index, cells]) => ({ index, cells }));
});
const outlets = shallowReactive(new Map<string, HTMLElement>());
const setOutlet = (key: string, element: unknown) => {
  if (element instanceof HTMLElement) outlets.set(key, element);
  else outlets.delete(key);
};

const alignClass = (align: DescriptionsAlign): string => `ex-descriptions__cell--${align}`;
</script>

<style scoped lang="scss" src="./ExDescriptions.scss"></style>
