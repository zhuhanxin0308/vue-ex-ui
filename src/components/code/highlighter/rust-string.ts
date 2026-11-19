import type { GrammarRule } from './engine';

/** 组合正则不能含捕获组。按开头的井号数定位结束符，未闭合时保留至编辑区末尾。 */
export const rustRawString: GrammarRule = {
  type: 'string',
  re: /\b(?:b|c)?r#*"/,
  resolve(code, start, opener) {
    const delimiter = '"' + opener.slice(opener.indexOf('r') + 1, -1);
    const end = code.indexOf(delimiter, start + opener.length);
    return code.slice(start, end < 0 ? code.length : end + delimiter.length);
  },
};
