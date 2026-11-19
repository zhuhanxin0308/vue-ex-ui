import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExBarcode from '../../../src/components/barcode/ExBarcode.vue';
import type { ExBarcodeExposed, ExBarcodeProps } from '../../../src/components/barcode/types';
import { setLocale } from '../../../src/locale';

/** 仅控制浏览器解码边界，SVG 尺寸仍由真实 JsBarcode 生成。 */
class DecodedImage {
  static instances: DecodedImage[] = [];
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';

  constructor() {
    DecodedImage.instances.push(this);
  }

  complete(width: number, height: number): void {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.onload?.();
  }
}

describe('条码导出身份与错误本地化', () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    setLocale('en-US');
    DecodedImage.instances = [];
    vi.stubGlobal('Image', DecodedImage);
    let nextUrl = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:barcode-${++nextUrl}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      measureText: () => ({ width: 0 }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,new');
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    setLocale('en-US');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const createBarcode = async (props: ExBarcodeProps) => {
    wrapper = mount(ExBarcode, { props: { displayValue: false, ...props } });
    const api = wrapper.vm as unknown as ExBarcodeExposed;
    await api.refresh();
    await flushPromises();
    return api;
  };

  it('超像素预算的旧导出不能覆盖新条码状态或阻断新导出', async () => {
    const api = await createBarcode({
      value: 'A'.repeat(180),
      width: 8,
      height: 2048,
      margin: 0,
    });
    const svg = wrapper!.get('svg');
    expect(svg.attributes('width')).toBe('16120px');
    expect(svg.attributes('height')).toBe('2048px');
    const obsolete = api.toDataURL();
    const oldImage = DecodedImage.instances[0]!;

    await wrapper!.setProps({ value: 'ABC' });
    await flushPromises();
    expect(svg.attributes('width')).toBe('544px');
    oldImage.complete(16120, 2048);
    await expect(obsolete).resolves.toBe('');
    await nextTick();
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false);
    const current = api.toDataURL();
    DecodedImage.instances[1]!.complete(544, 2048);
    await expect(current).resolves.toBe('data:image/png;base64,new');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('更新条码后丢弃尚未完成的 PNG 下载回调', async () => {
    const api = await createBarcode({ value: 'OLD' });
    let finishBlob!: BlobCallback;
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      finishBlob = callback;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    api.download('旧条码.png');
    DecodedImage.instances[0]!.complete(200, 100);
    await flushPromises();
    await wrapper!.setProps({ value: 'NEW' });
    await flushPromises();
    finishBlob(new Blob(['old'], { type: 'image/png' }));

    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('格式校验错误使用当前语言，切换语言无需重新生成失败的条码', async () => {
    await createBarcode({ value: '123', format: 'EAN13' });
    expect(wrapper!.get('[role="alert"]').text()).toContain('Invalid barcode value');
    setLocale('zh-CN');
    await nextTick();
    expect(wrapper!.get('[role="alert"]').text()).toContain('无效的条码值');
  });

  it('空值错误和自定义文案在语言切换后保留正确优先级', async () => {
    await createBarcode({ value: '' });
    expect(wrapper!.get('[role="alert"]').text()).toContain('Invalid barcode value');
    setLocale('zh-CN');
    await nextTick();
    expect(wrapper!.get('[role="alert"]').text()).toContain('无效的条码值');
    await wrapper!.setProps({ errorText: '请扫描订单号' });
    setLocale('en-US');
    await nextTick();
    expect(wrapper!.get('[role="alert"]').text()).toContain('请扫描订单号');
  });

  it('像素预算错误跟随语言切换，且始终在创建 Canvas 之前拒绝', async () => {
    setLocale('zh-CN');
    const api = await createBarcode({ value: 'A'.repeat(180), width: 8, height: 2048, margin: 0 });
    const context = vi.mocked(HTMLCanvasElement.prototype.getContext);
    context.mockClear();
    const result = api.toDataURL();
    DecodedImage.instances[0]!.complete(16120, 2048);
    await expect(result).resolves.toBe('');
    await nextTick();

    expect(context).not.toHaveBeenCalled();
    expect(wrapper!.get('[role="alert"]').text()).toContain('条码图像超过浏览器像素安全上限');
    setLocale('en-US');
    await nextTick();
    expect(wrapper!.get('[role="alert"]').text()).toContain(
      'Barcode image exceeds browser safe pixel limits'
    );
  });
});
