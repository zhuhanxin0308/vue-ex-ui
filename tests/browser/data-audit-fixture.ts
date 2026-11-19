import { createApp, h, ref } from 'vue';
import ExCalendar from '../../src/components/calendar';
import ExImage from '../../src/components/image';
import ExTable from '../../src/components/table';
import ExTree from '../../src/components/tree';
import type { TreeNode } from '../../src/components/tree/types';
import '../../src/style-full';

const picture =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="navy"/></svg>'
  );
const files = [
  { key: 'b', name: 'Beta' },
  { key: 'a', name: 'Alpha' },
];
const virtual = ref(false);
const lastDrop = ref('');
const data: TreeNode[] = [
  {
    key: 'p',
    label: 'Parent',
    children: [
      { key: 'c', label: 'Child', children: [{ key: 'g', label: 'Grandchild' }] },
      { key: 'other', label: 'Sibling' },
    ],
  },
  { key: 's', label: 'Source' },
];
createApp({
  render: () => [
    h('section', { id: 'pictures' }, [
      ...[
        { id: 'natural' },
        { id: 'width', width: 82 },
        { id: 'height', height: 42 },
        { id: 'both', width: 82, height: 62 },
        { id: 'class-width', class: 'poster-wide' },
        { id: 'class-height', class: 'poster-tall' },
        { id: 'class-both', class: 'poster-wide poster-tall' },
      ].map(props => h(ExImage, { ...props, src: picture, alt: props.id, lazy: false })),
      h(
        'div',
        { style: { width: '82px' } },
        h(ExImage, { id: 'constrained', src: picture, alt: '受限', lazy: false })
      ),
    ]),
    h(ExTable, {
      columns: [{ key: 'name', title: 'Name', sortable: true }],
      data: files,
      layout: 'card',
      selectable: true,
    }),
    h(
      'button',
      {
        id: 'virtual',
        onClick: () => {
          virtual.value = !virtual.value;
        },
      },
      '切换虚拟模式'
    ),
    h(ExTree, {
      data,
      virtual: virtual.value,
      height: 240,
      checkable: true,
      draggable: true,
      defaultExpandAll: true,
      onNodeDrop: (source: TreeNode, target: TreeNode, position: string) => {
        lastDrop.value = [source.key, target.key, position].join('/');
      },
    }),
    h('output', { id: 'drop' }, lastDrop.value),
    h(ExCalendar, { modelValue: new Date(2025, 2, 1), checkedInDates: [new Date(2025, 2, 1)] }),
  ],
}).mount('#app');
