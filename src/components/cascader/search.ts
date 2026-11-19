import type { CascaderOption } from './types';

/** 搜索结果保留完整路径和祖先禁用状态。 */
export interface CascaderSearchResult {
  labels: string[];
  values: (string | number)[];
  disabled: boolean;
}

/** 使用显式栈遍历所有可选择路径，避免深层组织数据耗尽调用栈。 */
export function collectCascaderSearchPaths(
  options: CascaderOption[],
  includeBranches: boolean
): CascaderSearchResult[] {
  interface Frame {
    options: CascaderOption[];
    index: number;
    disabled: boolean;
  }
  const frames: Frame[] = [{ options, index: 0, disabled: false }];
  const labels: string[] = [];
  const values: (string | number)[] = [];
  const results: CascaderSearchResult[] = [];
  while (frames.length) {
    const frame = frames[frames.length - 1]!;
    const option = frame.options[frame.index++];
    if (!option) {
      frames.pop();
      labels.pop();
      values.pop();
      continue;
    }
    labels.push(option.label);
    values.push(option.value);
    const disabled = frame.disabled || Boolean(option.disabled);
    if (includeBranches || (!option.children?.length && option.isLeaf !== false))
      results.push({ labels: [...labels], values: [...values], disabled });
    if (option.children?.length) {
      frames.push({ disabled, options: option.children, index: 0 });
    } else {
      labels.pop();
      values.pop();
    }
  }
  return results;
}
