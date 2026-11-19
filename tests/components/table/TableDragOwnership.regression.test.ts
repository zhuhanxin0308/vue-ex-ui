import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick, ref } from 'vue';
import ExTable from '../../../src/components/table/ExTable.vue';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('表格列拖动属于当前实例和当前会话', () => {
  it('排序行按视图索引着色，动态详情列随父级插槽出现', async () => {
    const details = ref(false);
    const props = {
      data: [{ score: 3 }, { score: 1 }, { score: 2 }],
      columns: [{ key: 'score', title: '分数', dataIndex: 'score', sortable: true }],
      striped: true,
      rowClassName: (_record: unknown, index: number) => `display-${index}`,
    };
    const wrapper = mount({
      render: () => h(ExTable, props, details.value ? { 'expanded-row': () => '详情' } : {}),
    });
    wrappers.push(wrapper);
    await wrapper.get('.ex-table__sort-button').trigger('click');
    expect(wrapper.findAll('.ex-table__row--striped').map(row => row.text())).toEqual(['2']);
    expect(wrapper.get('.display-0').text()).toBe('1');
    details.value = true;
    await nextTick();
    expect(wrapper.find('th.ex-table__detail-column').exists()).toBe(true);
  });

  it('末列下半区接受拖放至末尾', async () => {
    const wrapper = mount(ExTable, {
      props: {
        data: [],
        columns: [{ key: 'a' }, { key: 'b' }],
        reorderableColumns: true,
      },
    });
    wrappers.push(wrapper);
    const [source, target] = wrapper.findAll('.ex-table-column-controls__drag');
    const transfer = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => transfer.set(key, value),
      getData: (key: string) => transfer.get(key) ?? '',
    };
    vi.spyOn(target!.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40));
    await source!.trigger('dragstart', { dataTransfer });
    await target!.trigger('drop', { dataTransfer, clientY: 35 });
    expect(wrapper.emitted('update:columnOrder')).toEqual([[['b', 'a']]]);
  });

  it('两侧固定列预留实际工具列宽，展开与选择列同时固定', async () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    const measure = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.matches('.ex-table__selection-column')) return new DOMRect(0, 0, 52, 36);
        if (this.matches('.ex-table__detail-column')) return new DOMRect(0, 0, 40, 36);
        if (this.matches('.ex-table__actions-column')) return new DOMRect(0, 0, 126, 36);
        return original.call(this);
      });
    try {
      const wrapper = mount(ExTable, {
        props: {
          data: [{ key: 'r' }],
          selectable: true,
          editable: true,
          columns: [
            { key: 'a', title: '甲', fixed: 'left' },
            { key: 'b', title: '乙', fixed: 'right' },
          ],
        },
        slots: { 'expanded-row': () => '详情' },
      });
      wrappers.push(wrapper);
      await nextTick();
      expect(wrapper.get<HTMLElement>('th[data-column-key="a"]').element.style.left).toBe('92px');
      expect(wrapper.get<HTMLElement>('th[data-column-key="b"]').element.style.right).toBe('126px');
      expect(wrapper.get<HTMLElement>('td.ex-table__detail-column').element.style.left).toBe(
        '52px'
      );
    } finally {
      measure.mockRestore();
    }
  });
  it.each([false, true])('自定义格式丢失=%s 时仍隔离跨表、过期和禁用来源', async missing => {
    const props = {
      data: [],
      columns: [
        { key: 'a', title: '甲' },
        { key: 'b', title: '乙' },
      ],
      reorderableColumns: true,
    };
    const first = mount(ExTable, { props, attachTo: document.body });
    const second = mount(ExTable, { props, attachTo: document.body });
    wrappers.push(first, second);
    const data = new Map<string, string>();
    const transfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => (missing && type !== 'text/plain' ? '' : (data.get(type) ?? '')),
    };
    const start = () =>
      first
        .findAll('.ex-table-column-controls__drag')[1]!
        .trigger('dragstart', { dataTransfer: transfer });
    const drop = (table: typeof first) =>
      table
        .findAll('.ex-table-column-controls__drag')[0]!
        .trigger('drop', { dataTransfer: transfer });
    await start();
    await drop(second);
    expect(second.emitted('update:columnOrder')).toBeUndefined();
    await drop(first);
    expect(first.emitted('update:columnOrder')).toEqual([[['b', 'a']]]);
    await drop(first);
    expect(first.emitted('update:columnOrder')).toHaveLength(1);
    await start();
    document.dispatchEvent(new Event('dragstart', { bubbles: true }));
    await drop(first);
    expect(first.emitted('update:columnOrder')).toHaveLength(1);
    await start();
    await first.setProps({ loading: true });
    await first.setProps({ loading: false });
    await drop(first);
    expect(first.emitted('update:columnOrder')).toHaveLength(1);
  });
});
