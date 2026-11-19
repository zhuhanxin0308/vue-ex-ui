import type { IconSize } from './types';
import { getBuiltinIcon } from './icons';

const ICON_CLASS_TOKEN = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/;

/** 复合组件共用图标分流：注册表名称使用 SVG，其余字符串保留图片地址语义。 */
export function resolveIconSource(source?: string, fallback?: string) {
  if (!source) return { icon: fallback, src: undefined };
  return getBuiltinIcon(source)
    ? { icon: source, src: undefined }
    : { icon: undefined, src: source };
}

/** 将图标尺寸规范为可复用的 CSS 长度。 */
export function normalizeIconSize(size: IconSize, fallback = 16): string {
  if (typeof size === 'number') {
    return Number.isFinite(size) && size >= 0 ? `${size}px` : `${fallback}px`;
  }

  const normalized = size.trim();
  return normalized || `${fallback}px`;
}

/** 将静态旋转角限制在一圈内，同时保留正反方向。 */
export function normalizeIconRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  return rotation % 360;
}

/**
 * 将图片地址安全放入 CSS url() 字符串；转义会破坏声明边界的字符。
 */
export function createIconMaskUrl(source: string): string {
  const escaped = source
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, character => `\\${character.charCodeAt(0).toString(16)} `);
  return `url("${escaped}")`;
}

const normalizeClassToken = (value: string | undefined): string => {
  const token = value?.trim() ?? '';
  return ICON_CLASS_TOKEN.test(token) ? token : '';
};

/** 生成字体图标类名，拒绝会被拆分成多个类的异常输入。 */
export function getFontIconClasses(name: string | undefined, prefix?: string): string[] {
  const normalizedName = normalizeClassToken(name);
  if (!normalizedName) return [];

  const normalizedPrefix = normalizeClassToken(prefix);
  return normalizedPrefix
    ? [normalizedPrefix, `${normalizedPrefix}-${normalizedName}`]
    : [normalizedName];
}
