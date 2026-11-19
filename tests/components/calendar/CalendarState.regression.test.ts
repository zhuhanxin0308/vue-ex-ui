import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ExCalendar from '../../../src/components/calendar/ExCalendar.vue';
import { setLocale } from '../../../src/locale';
import type { ExCalendarExposed } from '../../../src/components/calendar/types';

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('日历日期导航和网格语义', () => {
  it('日视图跨年同时通知月份和年份，传入非法日期保留当前视图', async () => {
    const wrapper = mount(ExCalendar, {
      props: { modelValue: new Date(2024, 11, 31), mode: 'day', showSolarTerm: false },
    });
    wrappers.push(wrapper);
    await wrapper.get('[aria-label="Next day"]').trigger('click');
    expect(wrapper.emitted('year-change')).toEqual([[2025]]);
    expect(wrapper.emitted('month-change')).toEqual([[2025, 1]]);
    const before = wrapper.text();
    (wrapper.vm as unknown as ExCalendarExposed).selectDate(new Date(NaN));
    await wrapper.setProps({ modelValue: new Date(NaN) });
    expect(wrapper.text()).toBe(before);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('公开翻月和翻年后保留唯一可用键盘入口，动态禁用会迁移入口', async () => {
    const wrapper = mount(ExCalendar, {
      props: { modelValue: new Date(2024, 0, 15), showSolarTerm: false },
    });
    wrappers.push(wrapper);
    const api = wrapper.vm as unknown as ExCalendarExposed;
    for (const navigate of [api.nextMonth, api.prevMonth, api.nextYear, api.prevYear]) {
      navigate();
      await nextTick();
      expect(wrapper.findAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
    }
    const oldDate = Number(wrapper.get('[role="gridcell"][tabindex="0"]').attributes('data-date'));
    await wrapper.setProps({ disabledDate: date => date.getTime() === oldDate });
    const current = wrapper.get('[role="gridcell"][tabindex="0"]');
    expect(current.attributes('data-date')).not.toBe(String(oldDate));
    expect(current.attributes('aria-disabled')).toBe('false');
  });

  it.each([
    ['PageDown', new Date(2024, 0, 31), new Date(2024, 1, 29)],
    ['PageUp', new Date(2024, 2, 31), new Date(2024, 1, 29)],
  ] as const)('%s 月末导航限制在相邻月份', async (key, start, end) => {
    const wrapper = mount(ExCalendar, {
      props: { modelValue: start, showSolarTerm: false },
      attachTo: document.body,
    });
    wrappers.push(wrapper);
    await wrapper.get('[role="gridcell"][tabindex="0"]').trigger('keydown', { key });
    expect(wrapper.get('[role="gridcell"][tabindex="0"]').attributes('data-date')).toBe(
      String(end.getTime())
    );
    expect(document.activeElement).toBe(wrapper.get('[role="gridcell"][tabindex="0"]').element);
  });

  it('今天操作不能选择禁用日期', async () => {
    const wrapper = mount(ExCalendar, {
      props: { modelValue: new Date(2024, 0, 15), showSolarTerm: false, disabledDate: () => true },
    });
    wrappers.push(wrapper);
    await wrapper.get('.ex-calendar__today-btn').trigger('click');
    (wrapper.vm as unknown as ExCalendarExposed).goToday();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it.each(['month', 'week'] as const)('%s 网格为日期单元格提供七列行结构', mode => {
    const wrapper = mount(ExCalendar, { props: { mode, showSolarTerm: false } });
    wrappers.push(wrapper);
    const grid = wrapper.get('[role="grid"]');
    expect(grid.findAll('[role="row"] > [role="columnheader"]')).toHaveLength(7);
    const rows = grid.findAll('.ex-calendar__grid-row[role="row"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.findAll(':scope > [role="gridcell"]').length === 7)).toBe(true);
    expect(wrapper.findAll('[role="grid"] > [role="gridcell"]')).toHaveLength(0);
  });

  it('跨月同日拥有本地化完整日期和签到名称', async () => {
    const march = new Date(2025, 2, 1);
    const april = new Date(2025, 3, 1);
    const wrapper = mount(ExCalendar, { props: { modelValue: march, checkedInDates: [march] } });
    wrappers.push(wrapper);
    try {
      for (const locale of ['en-US', 'zh-CN'] as const) {
        setLocale(locale);
        await nextTick();
        const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
        const first = wrapper.get(`[data-date="${march.getTime()}"]`);
        expect(first.attributes('aria-label')).toContain(formatter.format(march));
        expect(first.attributes('aria-label')).toContain(
          locale === 'zh-CN' ? '已签到' : 'Checked in'
        );
        expect(wrapper.get(`[data-date="${april.getTime()}"]`).attributes('aria-label')).toContain(
          formatter.format(april)
        );
      }
    } finally {
      setLocale('en-US');
    }
  });
});
