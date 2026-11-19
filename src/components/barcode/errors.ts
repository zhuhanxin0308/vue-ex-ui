export type BarcodeErrorCode =
  'invalidValue' | 'valueTooLong' | 'loadFailed' | 'pixelLimit' | 'error';

/** 用稳定错误类别驱动界面翻译，同时保留原始异常供开发调试。 */
export class BarcodeError extends Error {
  constructor(
    readonly code: BarcodeErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'BarcodeError';
  }
}
