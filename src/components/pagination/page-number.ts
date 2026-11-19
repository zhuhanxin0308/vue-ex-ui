export const DEFAULT_PAGE_SIZE = 10;

/** 分页参数先校验有限正数，再将取整结果限定为至少一项。 */
export function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback;
}
