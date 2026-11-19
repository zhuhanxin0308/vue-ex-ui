import { expect, test, type Locator, type Page } from '@playwright/test';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

const FIXTURE_ORIGIN = 'https://form-geometry.test';
const BUILD_TIMEOUT_MS = 60000;
const PIXEL_TOLERANCE = 1;
const LOW_VIEWPORT_HEIGHT = 375;
let fixtureHtml: string;

test.use({ reducedMotion: 'reduce' });

test.beforeAll(async () => {
  test.setTimeout(BUILD_TIMEOUT_MS);
  // 真实 Sass 与组件一起构建，所有尺寸断言由浏览器测量。
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [vue()],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      lib: {
        entry: resolve('tests/browser/form-geometry-fixture.ts'),
        name: 'FormGeometryFixture',
        formats: ['iife'],
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result =>
    'output' in result ? result.output : []
  );
  const script = outputs.find(output => output.type === 'chunk');
  const styles = outputs.filter(
    output => output.type === 'asset' && output.fileName.endsWith('.css')
  );
  if (script?.type !== 'chunk' || styles.length === 0) throw new Error('缺少几何验收资源');
  fixtureHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; } ${styles.map(style => (style.type === 'asset' ? String(style.source) : '')).join('\n')}
    </style></head><body><div id="app"></div><script>${script.code}</script></body></html>`;
});

async function open(page: Page, query: string) {
  await page.route(`${FIXTURE_ORIGIN}/**`, route =>
    route.fulfill({ contentType: 'text/html', body: fixtureHtml })
  );
  await page.goto(`${FIXTURE_ORIGIN}/?${query}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

async function assertCenter(locator: Locator, axis: 'x' | 'y', expected: number) {
  const bounds = (await locator.boundingBox())!;
  const center = bounds[axis] + (axis === 'x' ? bounds.width : bounds.height) / 2;
  expect(Math.abs(center - expected)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
}

for (const direction of ['horizontal', 'vertical']) {
  for (const reverse of [false, true]) {
    for (const range of [false, true]) {
      test(`滑块 ${direction} reverse=${reverse} range=${range} 中心对齐数值`, async ({ page }) => {
        await open(page, `scene=slider&direction=${direction}&reverse=${reverse}&range=${range}`);
        const vertical = direction === 'vertical';
        const axis = vertical ? 'y' : 'x';
        const track = page.locator('.ex-slider__track-wrapper');
        const thumbs = page.locator('.ex-slider__thumb');
        const trackBounds = (await track.boundingBox())!;
        const position = (value: number) => {
          const forward = vertical ? reverse : !reverse;
          const fraction = (forward ? value : 100 - value) / 100;
          return trackBounds[axis] + fraction * (vertical ? trackBounds.height : trackBounds.width);
        };

        for (const value of [0, 25, 100]) {
          await page.locator(`#set-value-${value}`).click();
          for (const thumb of await thumbs.all()) {
            const current = Number(await thumb.getAttribute('aria-valuenow'));
            await assertCenter(thumb, axis, position(current));
            await thumb.hover();
            await assertCenter(thumb, axis, position(current));
            await thumb.focus();
            await assertCenter(thumb, axis, position(current));
            const bounds = (await thumb.boundingBox())!;
            await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            await page.mouse.down();
            await expect(thumb).toHaveClass(/is-dragging/);
            await assertCenter(thumb, axis, position(current));
            await page.mouse.up();
          }
          const bar = await page.locator('.ex-slider__bar').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          });
          const values = await thumbs.evaluateAll(elements =>
            elements.map(element => Number(element.getAttribute('aria-valuenow')))
          );
          const coordinates = (range ? values : [0, values[0]!]).map(position);
          expect(Math.abs(bar[axis] - Math.min(...coordinates))).toBeLessThanOrEqual(
            PIXEL_TOLERANCE
          );
          const barEnd = bar[axis] + (vertical ? bar.height : bar.width);
          expect(Math.abs(barEnd - Math.max(...coordinates))).toBeLessThanOrEqual(PIXEL_TOLERANCE);
        }
        for (const [index, stop] of (await page.locator('.ex-slider__stop').all()).entries()) {
          await assertCenter(stop, axis, position((index + 1) * 25));
        }
        for (const mark of await page.locator('.ex-slider__mark').all()) {
          await assertCenter(mark, axis, position(Number(await mark.textContent())));
        }
      });
    }
  }
}

for (const direction of ['ltr', 'rtl']) {
  test(`评分 ${direction} 半星命中、只读填充和动态方向一致`, async ({ page }) => {
    await open(page, `scene=rate&dir=${direction}`);
    const rate = page.locator('.ex-rate').first();
    const star = rate.locator('.ex-rate__star').first();
    for (const current of [direction, direction === 'rtl' ? 'ltr' : 'rtl']) {
      await page
        .locator('#rate-host')
        .evaluate((host, dir) => host.setAttribute('dir', dir), current);
      const bounds = (await star.boundingBox())!;
      const offset = bounds.width * (current === 'rtl' ? 0.75 : 0.25);
      await page.mouse.click(bounds.x + offset, bounds.y + bounds.height / 2);
      await page.mouse.move(0, 0);
      await expect(rate).toHaveAttribute('aria-valuenow', '0.5');
      const clip = current === 'rtl' ? 'inset(0px 0px 0px 50%)' : 'inset(0px 50% 0px 0px)';
      await expect(star.locator('.ex-rate__icon--active')).toHaveCSS('clip-path', clip);
      await expect(page.locator('#readonly-rate .is-half .ex-rate__icon--active')).toHaveCSS(
        'clip-path',
        clip
      );
      await rate.press(current === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
      await expect(rate).toHaveAttribute('aria-valuenow', '1');
    }
  });
}

for (const largeText of [false, true]) {
  test(`375px 视口的 64 色板可滚动确认，放大文字=${largeText}`, async ({ page }) => {
    await page.setViewportSize({ width: 812, height: LOW_VIEWPORT_HEIGHT });
    await open(page, 'scene=color');
    if (largeText)
      await page.addStyleTag({
        content:
          '.ex-color-picker__panel { font-size: 200%; --ex-text-sm: 2rem; --ex-text-xs: 1.5rem; }',
      });
    await page.locator('.ex-color-picker__trigger').click();
    const panel = page.getByRole('dialog');
    await expect(panel.locator('.ex-color-picker__predefine-item')).toHaveCount(64);
    const bounds = (await panel.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(LOW_VIEWPORT_HEIGHT);
    expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const confirm = panel.locator('.ex-color-picker__btn--primary');
    await panel.hover();
    await page.mouse.wheel(0, LOW_VIEWPORT_HEIGHT * 2);
    await expect(confirm).toBeInViewport();
    // 焦点移动也必须触发原生滚动，使键盘用户能看见最终操作。
    await panel.evaluate(element => {
      element.scrollTop = 0;
    });
    await panel.locator('.ex-color-picker__input').focus();
    for (let index = 0; index < 66; index += 1) await page.keyboard.press('Tab');
    await expect(confirm).toBeFocused();
    await expect(confirm).toBeInViewport();
    const previousConfirmations = Number(await page.locator('#confirmations').textContent());
    await confirm.click();
    await expect(panel).not.toBeVisible();
    await expect(page.locator('#confirmations')).toHaveText(String(previousConfirmations + 1));
  });
}

test('正常高视口的短色板保持自然高度且无需滚动', async ({ page }) => {
  await open(page, 'scene=color&long=false');
  await page.locator('.ex-color-picker__trigger').click();
  const panel = page.getByRole('dialog');
  expect(await panel.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(panel.locator('.ex-color-picker__btn--primary')).toBeInViewport();
});

test.describe('触摸设备的选色确认', () => {
  test.use({ hasTouch: true });

  test('低视口长色板滚动后可触摸确认', async ({ page }) => {
    await page.setViewportSize({ width: 812, height: LOW_VIEWPORT_HEIGHT });
    await open(page, 'scene=color');
    await page.locator('.ex-color-picker__trigger').tap();
    const panel = page.getByRole('dialog');
    const confirm = panel.locator('.ex-color-picker__btn--primary');
    // 使用浏览器原生滚动定位后验证真实触摸点击，不以合成事件模拟滚动手势。
    await confirm.scrollIntoViewIfNeeded();
    expect(await panel.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(confirm).toBeInViewport();
    await confirm.tap();
    await expect(panel).not.toBeVisible();
    await expect(page.locator('#confirmations')).toHaveText('1');
  });
});
