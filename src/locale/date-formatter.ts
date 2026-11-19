import { DEFAULT_LOCALE } from './index';

/** 注入语言可能来自外部应用，Intl 无法识别的语言标记使用库默认语言。 */
export function createDateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, options);
  }
}
