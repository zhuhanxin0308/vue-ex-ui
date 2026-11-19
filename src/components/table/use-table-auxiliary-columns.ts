import { computed, onBeforeUnmount, onMounted, onUpdated, reactive, type Ref } from 'vue';
import { TABLE_STICKY_LAYER } from './use-table-columns';

const roles = ['selection', 'detail', 'actions'] as const;
type ColumnRole = (typeof roles)[number];

/** 选择、展开和编辑列的实际轨道宽度由表格布局决定，会随控件、字体和主题变化。 */
export function useTableAuxiliaryColumns(
  root: Ref<HTMLElement | undefined>,
  fixed: (side: 'left' | 'right') => boolean
) {
  const widths = reactive({ selection: 0, detail: 0, actions: 0 });
  const sides = { left: computed(() => fixed('left')), right: computed(() => fixed('right')) };
  const cells = new Map<ColumnRole, HTMLElement>();
  let observer: ResizeObserver | undefined;
  const measure = () => {
    for (const [role, cell] of cells) widths[role] = cell.getBoundingClientRect().width;
  };
  const synchronize = () => {
    if (!sides.left.value && !sides.right.value && !cells.size) return;
    const table = root.value?.querySelector<HTMLTableElement>(':scope > div > table');
    const first = table?.tHead?.rows[0] ?? table?.tBodies[0]?.querySelector('tr.ex-table__row');
    for (const role of roles) {
      const side = role === 'actions' ? 'right' : 'left';
      const cell = sides[side].value
        ? first?.querySelector<HTMLElement>(`:scope > .ex-table__${role}-column`)
        : null;
      const old = cells.get(role);
      if (old === (cell ?? undefined)) continue;
      if (old) observer?.unobserve(old);
      cells.delete(role);
      widths[role] = 0;
      if (!cell) continue;
      cells.set(role, cell);
      if (!observer && typeof ResizeObserver !== 'undefined')
        observer = new ResizeObserver(measure);
      observer?.observe(cell);
      widths[role] = cell.getBoundingClientRect().width;
    }
  };
  onMounted(synchronize);
  onUpdated(synchronize);
  onBeforeUnmount(() => observer?.disconnect());
  const offset = (side: 'left' | 'right') =>
    side === 'left' ? widths.selection + widths.detail : widths.actions;
  const style = (role: ColumnRole, header = false) => {
    const side = role === 'actions' ? 'right' : 'left';
    if (!sides[side].value) return;
    return {
      position: 'sticky' as const,
      [side]: `${role === 'detail' ? widths.selection : 0}px`,
      zIndex: header ? TABLE_STICKY_LAYER.header : TABLE_STICKY_LAYER.body,
      background: header ? 'var(--ex-color-bg-elevated)' : 'var(--ex-color-bg-primary)',
    };
  };
  return { offset, style };
}
