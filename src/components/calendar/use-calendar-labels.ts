import { computed, type Ref } from 'vue';
import { useI18n } from '../../locale';
import { createDateFormatter } from '../../locale/date-formatter';
import type { CalendarDateCell } from './types';

/** 日期名包含星期、完整日期和可见历法提示，网格名随当前月份切换。 */
export function useCalendarLabels(currentDate: Readonly<Ref<Date>>) {
  const { t, locale } = useI18n();
  const fullDate = computed(() => createDateFormatter(locale.value, { dateStyle: 'full' }));
  const gridLabel = computed(() =>
    createDateFormatter(locale.value, { year: 'numeric', month: 'long' }).format(currentDate.value)
  );
  const dateLabel = (cell: CalendarDateCell) =>
    [
      fullDate.value.format(cell.date),
      cell.holiday || cell.solarTerm || cell.lunar,
      cell.checkedIn && t('calendar.checkedIn'),
    ]
      .filter(Boolean)
      .join(', ');
  return { gridLabel, dateLabel };
}
