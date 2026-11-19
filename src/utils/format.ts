/**
 * 格式化工具函数
 */

import { formatDate } from './date';

const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] as const;
const FILE_SIZE_UNIT_BASE = 1024;
const FILE_SIZE_FRACTION_DIGITS = 2;

/**
 * 格式化时间戳
 * @param timestamp 时间戳（毫秒）
 * @param format 格式字符串，默认 'HH:mm:ss'，方括号中的文本按字面输出
 * @returns 格式化后的时间字符串
 */
export function formatTimestamp(timestamp: number, format: string = 'HH:mm:ss'): string {
  return formatDate(new Date(timestamp), format);
}

/**
 * 格式化文件大小
 * @param size 文件大小（字节）
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(size: number): string {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 0;
  if (safeSize === 0) return '0 B';

  let unitIndex = Math.min(
    Math.max(0, Math.floor(Math.log(safeSize) / Math.log(FILE_SIZE_UNIT_BASE))),
    FILE_SIZE_UNITS.length - 1
  );
  let value = safeSize / FILE_SIZE_UNIT_BASE ** unitIndex;
  let rounded = Number(value.toFixed(FILE_SIZE_FRACTION_DIGITS));
  // 显示精度可能把临界值舍入到下一单位，最高单位则保留实际倍数。
  if (rounded >= FILE_SIZE_UNIT_BASE && unitIndex < FILE_SIZE_UNITS.length - 1) {
    unitIndex += 1;
    value /= FILE_SIZE_UNIT_BASE;
    rounded = Number(value.toFixed(FILE_SIZE_FRACTION_DIGITS));
  }

  // 最多保留两位小数，同时去掉无意义的尾随零。
  return `${rounded} ${FILE_SIZE_UNITS[unitIndex]}`;
}
