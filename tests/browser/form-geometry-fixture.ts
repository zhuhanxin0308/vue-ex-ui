import { createApp, h, nextTick, ref } from 'vue';
import ExColorPicker from '../../src/components/color-picker/ExColorPicker.vue';
import ExRate from '../../src/components/rate/ExRate.vue';
import ExSlider from '../../src/components/slider/ExSlider.vue';
import '../../src/styles/index.scss';

const params = new URLSearchParams(location.search);
const scene = params.get('scene');
const range = params.get('range') === 'true';
const reverse = params.get('reverse') === 'true';
const direction = params.get('direction') === 'vertical' ? 'vertical' : 'horizontal';
const sliderValue = ref<number | [number, number]>(range ? [0, 25] : 0);
const rateValue = ref(0.5);
const colorValue = ref('#ff0000');
const confirmations = ref(0);
const SWATCH_COUNT = 64;
const predefine = Array.from(
  { length: SWATCH_COUNT },
  (_, index) =>
    `#${Math.round((index / (SWATCH_COUNT - 1)) * 0xffffff)
      .toString(16)
      .padStart(6, '0')}`
);
document.documentElement.dataset.theme = 'light';

createApp({
  setup: () => () =>
    h('main', { style: { padding: '64px', width: '528px' } }, [
      scene === 'slider'
        ? h('section', [
            h(ExSlider, {
              modelValue: sliderValue.value,
              'onUpdate:modelValue': value => {
                sliderValue.value = value;
              },
              range,
              reverse,
              direction,
              height: '240px',
              step: 25,
              showStops: true,
              showTooltip: false,
              marks: { 0: '0', 25: '25', 100: '100' },
            }),
            h(
              'div',
              { style: { marginTop: '48px' } },
              [0, 25, 100].map((value, index) =>
                h(
                  'button',
                  {
                    id: `set-value-${value}`,
                    onClick: () => {
                      const ranges: [number, number][] = [
                        [0, 25],
                        [25, 100],
                        [0, 100],
                      ];
                      sliderValue.value = range ? ranges[index]! : value;
                    },
                  },
                  String(value)
                )
              )
            ),
          ])
        : scene === 'rate'
          ? h('section', { id: 'rate-host', dir: params.get('dir') ?? 'ltr' }, [
              h(ExRate, {
                modelValue: rateValue.value,
                'onUpdate:modelValue': value => {
                  rateValue.value = value;
                },
                allowHalf: true,
                showScore: true,
              }),
              h(ExRate, { id: 'readonly-rate', modelValue: 0.5, allowHalf: true, readonly: true }),
            ])
          : h('section', [
              h(ExColorPicker, {
                modelValue: colorValue.value,
                'onUpdate:modelValue': value => {
                  colorValue.value = value;
                },
                predefine: params.get('long') === 'false' ? predefine.slice(0, 4) : predefine,
                showAlpha: true,
                onChange: () => {
                  confirmations.value += 1;
                },
              }),
              h('output', { id: 'confirmations' }, String(confirmations.value)),
            ]),
    ]),
}).mount('#app');

void nextTick(() => {
  document.documentElement.dataset.ready = 'true';
});
