// @vitest-environment node
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h, type Component } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ExImageCompress from '../../../src/components/image-compress/ExImageCompress.vue';
import ExImageCrop from '../../../src/components/image-crop/ExImageCrop.vue';

const editors: Array<[string, Component]> = [
  ['ImageCompress', ExImageCompress],
  ['ImageCrop', ExImageCrop],
];

describe('图片编辑组件的服务端初始状态', () => {
  it.each(editors)('%s 在挂载前不加载浏览器资源或发布虚假的错误', async (_name, component) => {
    const onError = vi.fn();
    const onLoad = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const html = await renderToString(
        createSSRApp({
          render: () => h(component, { src: 'https://example.com/photo.png', onError, onLoad }),
        })
      );
      await Promise.resolve();

      expect(typeof window).toBe('undefined');
      expect(typeof Image).toBe('undefined');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onLoad).not.toHaveBeenCalled();
      expect(html).not.toContain('role="alert"');
      expect(html).toContain('aria-busy="false"');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
