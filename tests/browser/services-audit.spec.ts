import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/services-audit-missing.png', route => route.fulfill({ status: 404 }));
  await page.route('**/services-audit-file.txt', route =>
    route.fulfill({ contentType: 'text/plain', body: '真实下载内容' })
  );
  await page.goto('/tests/browser/services-audit-fixture.html');
});

test('真实 PNG 编码失败可见且可通过重置与修改目标恢复', async ({ page }) => {
  const editor = page.getByTestId('compress');
  const start = editor.getByRole('button', { name: 'Start compress', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(editor.getByRole('alert')).toContainText('当前格式无法达到目标文件大小');
  await expect(page.getByTestId('compression-error')).toHaveText('TARGET_UNREACHABLE:1');
  await editor.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveCount(0);
  await editor.getByRole('button', { name: '修正目标大小' }).click();
  await start.click();
  await expect(editor.locator('.ex-image-compress__preview-compressed img')).toBeVisible();
  await expect(editor.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('compression-error')).toHaveText('TARGET_UNREACHABLE:1');
});

for (const origin of ['source', 'configuration']) {
  test(`真实 ResizeObserver 不能清除裁剪 ${origin} 错误`, async ({ page }) => {
    const editor = page.getByTestId(`crop-${origin}`);
    const alert = editor.getByRole('alert');
    await expect(alert).toBeVisible();
    const message = await alert.textContent();
    const container = editor.locator('.ex-image-crop__container');
    const initialWidth = (await container.boundingBox())!.width;
    await page.setViewportSize({ width: 720, height: 900 });
    await expect
      .poll(async () => (await container.boundingBox())!.width)
      .toBeLessThan(initialWidth);
    await expect(alert).toHaveText(message!);
  });
}

test('下载成功监听器能够立即启动下一次真实 Fetch 下载', async ({ page }) => {
  const download = page.getByTestId('download');
  await download.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByTestId('download-result')).toHaveText('2:false');
  await expect(download.getByRole('button', { name: 'Download ready' })).toBeEnabled();
  await expect(download.locator('.ex-file-download')).toHaveAttribute('aria-busy', 'false');
});
