import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileString } from 'sass-embedded';
import { compileStyle } from '@vue/compiler-sfc';
import postcss from 'postcss';
import ExSwitch from '../../../src/components/switch/ExSwitch.vue';
import ExCascader from '../../../src/components/cascader/ExCascader.vue';
import ExDateTimePicker from '../../../src/components/datetime-picker/ExDateTimePicker.vue';
import ExRate from '../../../src/components/rate/ExRate.vue';
import ExFormItem from '../../../src/components/form/ExFormItem.vue';
import ExInput from '../../../src/components/input/ExInput.vue';
import ExNumberInput from '../../../src/components/number-input/ExNumberInput.vue';
import ExTreeSelect from '../../../src/components/tree-select/ExTreeSelect.vue';
import ExTimePicker from '../../../src/components/time-picker/ExTimePicker.vue';
import ExColorPicker from '../../../src/components/color-picker/ExColorPicker.vue';
import ExTooltip from '../../../src/components/tooltip/ExTooltip.vue';
import ExPopover from '../../../src/components/popover/ExPopover.vue';
import ExNotification from '../../../src/components/notification/ExNotification.vue';
import ExConfigProvider from '../../../src/components/config-provider/ExConfigProvider.vue';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

function selectorsForToken(file: string, scopeId: string, token: string): string[] {
  const source = compileString(readFileSync(file, 'utf8'), {
    url: pathToFileURL(resolve(file)),
  }).css;
  const compiled = compileStyle({ source, filename: file, scoped: true, id: scopeId });
  expect(compiled.errors).toEqual([]);
  const selectors: string[] = [];
  postcss.parse(compiled.code).walkRules(rule => {
    rule.walkDecls(declaration => {
      if (declaration.value.includes(token)) selectors.push(rule.selector);
    });
  });
  return selectors;
}

describe('字段实际 DOM 与公开样式契约', () => {
  it.each(['success', 'warning', 'error'] as const)('选中的 Switch 命中 %s 背景规则', status => {
    const wrapper = mount(ExSwitch, { props: { modelValue: true, validateStatus: status } });
    wrappers.push(wrapper);
    const core = wrapper.get('.ex-switch__core').element;
    const scopeId = (wrapper.element as HTMLElement)
      .getAttributeNames()
      .find(name => name.startsWith('data-v-'))!;
    const selectors = selectorsForToken(
      'src/components/switch/ExSwitch.scss',
      scopeId,
      `linear-gradient(135deg, var(--ex-color-${status})`
    );
    expect(selectors.some(selector => core.matches(selector))).toBe(true);
  });

  it('Teleport Cascader 的动态尺寸样式能够命中浮层选项', async () => {
    const wrapper = mount(ExCascader, {
      props: { size: 'small', options: [{ value: 'a', label: '甲' }] },
      attachTo: document.body,
    });
    wrappers.push(wrapper);
    await wrapper.get('input').trigger('click');
    const option = document.querySelector('.ex-cascader__option')!;
    const scopeId = (wrapper.element as HTMLElement)
      .getAttributeNames()
      .find(name => name.startsWith('data-v-'))!;
    const matches = (token: string) =>
      selectorsForToken('src/components/cascader/ExCascader.scss', scopeId, token).some(selector =>
        option.matches(selector)
      );
    expect(matches('--ex-input-height-sm')).toBe(true);
    await wrapper.setProps({ size: 'large' });
    expect(matches('--ex-input-height-lg')).toBe(true);
    expect(matches('--ex-input-height-sm')).toBe(false);
  });

  it('DateTimePicker 的选择状态由 gridcell 承载', async () => {
    const wrapper = mount(ExDateTimePicker, {
      props: { modelValue: new Date(2024, 0, 15) },
      attachTo: document.body,
    });
    wrappers.push(wrapper);
    await wrapper.get('input').trigger('click');
    expect(
      document.querySelector('[role="gridcell"][aria-selected="true"]')?.textContent?.trim()
    ).toBe('15');
    expect(document.querySelector('button[aria-selected]')).toBeNull();
  });

  it('Rate 文本颜色及自定义半星插槽保留公开视觉能力', () => {
    const wrapper = mount(ExRate, {
      props: { modelValue: 1.5, allowHalf: true, showScore: true, textColor: 'red' },
      slots: { 'icon-active': '<span class="custom-star">★</span>' },
    });
    wrappers.push(wrapper);
    expect(wrapper.get<HTMLElement>('.ex-rate__text').element.style.color).toBe('red');
    expect(wrapper.get<HTMLElement>('.is-half .ex-rate__icon--active').element.style.clipPath).toBe(
      'inset(0 50% 0 0)'
    );
  });

  it.each(['success', 'warning', 'error'] as const)(
    'FormItem 的 %s 校验边框规则精准命中各控件壳体且排除内部无边框 input',
    status => {
      const wrapper = mount({
        components: {
          ExFormItem,
          ExInput,
          ExNumberInput,
          ExTreeSelect,
          ExDateTimePicker,
          ExTimePicker,
          ExColorPicker,
        },
        template: `
          <ExFormItem label="字段" validate-status="${status}">
            <div>
              <ExInput model-value="abc" />
              <ExNumberInput :model-value="12" />
              <ExTreeSelect :data="[]" />
              <ExDateTimePicker />
              <ExTimePicker />
              <ExColorPicker />
            </div>
          </ExFormItem>
        `,
      });
      wrappers.push(wrapper);

      const formItemEl = wrapper.get('.ex-form-item').element;
      const scopeId = formItemEl.getAttributeNames().find(name => name.startsWith('data-v-'))!;
      const selectors = selectorsForToken(
        'src/components/form/ExFormItem.scss',
        scopeId,
        `var(--ex-color-${status})`
      );

      for (const shellSelector of [
        '.ex-input__inner',
        '.ex-number-input',
        '.ex-tree-select__trigger',
        '.ex-datetime-picker__input',
        '.ex-time-picker__trigger',
        '.ex-color-picker__trigger',
      ]) {
        const shell = wrapper.get(shellSelector).element;
        expect(selectors.some(selector => shell.matches(selector))).toBe(true);
      }

      for (const innerSelector of ['.ex-input__control', '.ex-number-input__input']) {
        const inner = wrapper.get(innerSelector).element;
        expect(selectors.some(selector => inner.matches(selector))).toBe(false);
      }
    }
  );

  it('Tooltip 与 Popover 渲染后霓虹边框层保持绝对定位覆盖而非文档流块级占位', () => {
    const tooltipScopeId = (ExTooltip as unknown as { __scopeId: string }).__scopeId;
    const popoverScopeId = (ExPopover as unknown as { __scopeId: string }).__scopeId;
    const tooltipSelectors = selectorsForToken(
      'src/components/tooltip/ExTooltip.scss',
      tooltipScopeId,
      'absolute'
    );
    const popoverSelectors = selectorsForToken(
      'src/components/popover/ExPopover.scss',
      popoverScopeId,
      'absolute'
    );

    const tooltipWrapper = mount(ExTooltip, {
      props: { modelValue: true, content: '提示' },
      slots: { default: '<button type="button">触发</button>' },
      attachTo: document.body,
    });
    const popoverWrapper = mount(ExPopover, {
      props: { modelValue: true, title: '标题', content: '详情' },
      slots: { default: '<button type="button">触发</button>' },
      attachTo: document.body,
    });
    wrappers.push(tooltipWrapper, popoverWrapper);

    const tooltipBorder = document.body.querySelector('.ex-tooltip__border')!;
    const popoverBorder = document.body.querySelector('.ex-popover__border')!;
    expect(tooltipSelectors.some(selector => tooltipBorder.matches(selector))).toBe(true);
    expect(popoverSelectors.some(selector => popoverBorder.matches(selector))).toBe(true);
  });

  it('禁用霓虹效果时 Notification 四种状态图标仍保持独立语义色规则', () => {
    const scopeId = (ExNotification as unknown as { __scopeId: string }).__scopeId;

    for (const type of ['info', 'success', 'warning', 'error'] as const) {
      const wrapper = mount({
        components: { ExConfigProvider, ExNotification },
        template: `
          <ExConfigProvider :neon-effect="false">
            <ExNotification type="${type}" title="通知" content="内容" :duration="0" />
          </ExConfigProvider>
        `,
      });
      wrappers.push(wrapper);

      const icon = wrapper.get(`.ex-notification__icon--${type}`).element;
      const colorSelectors = selectorsForToken(
        'src/components/notification/ExNotification.scss',
        scopeId,
        `var(--ex-color-${type})`
      );
      expect(colorSelectors.some(selector => icon.matches(selector))).toBe(true);
    }
  });
});
