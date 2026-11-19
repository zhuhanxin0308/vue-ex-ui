import { expect, test, type Locator, type Page } from '@playwright/test';

const open = (page: Page, scene: string) =>
  page.goto('/tests/browser/navigation-audit-fixture.html?scene=' + scene);
const bounds = (element: Locator) =>
  element.evaluate(node => {
    const { x, y, width, height, right, bottom } = node.getBoundingClientRect();
    return { x, y, width, height, right, bottom, cx: x + width / 2, cy: y + height / 2 };
  });

test('栅格的推拉位移随断点与书写方向生效', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 700 });
  await open(page, 'grid');
  for (const rtl of [false, true]) {
    if (rtl) await page.locator('#direction').click();
    for (const [width, offset] of [
      [600, 100],
      [1024, 250],
    ] as const) {
      await page.setViewportSize({ width, height: 700 });
      const grid = await bounds(page.locator('.ex-grid'));
      const item = await bounds(page.locator('.ex-grid-item'));
      expect(rtl ? grid.right - item.right : item.x - grid.x).toBeCloseTo(offset);
    }
  }
});

test('移动端指示器让出内容点击区且轮播在 RTL 反转后保持对齐', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'carousel');
  const viewport = page.locator('.ex-carousel__container');
  const active = page.locator('.ex-carousel-item--active');
  const indicator = await bounds(page.locator('.ex-carousel__indicator').first());
  const button = active.getByRole('button');
  const action = await bounds(button);
  expect(indicator.bottom).toBeLessThan(action.y);
  expect(indicator.height).toBeGreaterThanOrEqual(24);
  await button.click();
  await expect(page.locator('#clicks')).toHaveText('1');
  await page.locator('.ex-carousel__arrow--next').click();
  for (const rtl of [false, true]) {
    if (rtl) await page.locator('#direction').click();
    expect((await bounds(active)).cx).toBeCloseTo((await bounds(viewport)).cx);
  }
  await page.locator('.ex-carousel').press('ArrowLeft');
  await expect(active).toHaveText('操作 3');
  expect((await bounds(active)).cx).toBeCloseTo((await bounds(viewport)).cx);
});

test('嵌套锚点的指示球对齐标题的实际中心', async ({ page }) => {
  await open(page, 'anchor');
  const title = page.getByText('父标题', { exact: true });
  await title.click();
  const ball = page.locator('.ex-anchor__ink-ball');
  await expect
    .poll(async () => Math.abs((await bounds(ball)).cy - (await bounds(title)).cy))
    .toBeLessThan(1);
});

test('独立堆叠上下文中的侧栏按钮实际命中并触发', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await open(page, 'sider');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#sider-action').click();
  await expect(page.locator('#clicks')).toHaveText('1');
});

for (const size of ['small', 'medium', 'large']) {
  test(`${size} 标签切换与关闭命中区域分离，溢出可翻页并跟随受控切换`, async ({ page }) => {
    await open(page, 'tabs&size=' + size);
    const tab = page.getByRole('tab', { name: 'I', exact: true });
    const close = tab.locator('..').getByRole('button');
    const label = await bounds(tab.locator('.ex-tabs__tab-label'));
    const remove = await bounds(close);
    expect(label.right).toBeLessThanOrEqual(remove.x);
    expect(remove.width).toBeGreaterThanOrEqual(44);
    await page.mouse.click(label.cx, label.cy);
    await expect(page.locator('#last-closed')).toHaveText('0');
    await close.click();
    await expect(page.locator('#last-closed')).toHaveText('1');
    const scroll = page.locator('.ex-tabs__nav-scroll');
    await page.locator('.ex-tabs__overflow-select').selectOption({ label: '标签页 9' });
    await expect(page.getByRole('tab', { name: '标签页 9', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await page.locator('#add-tab').click();
    await page.locator('#select-last').click();
    const last = page.getByRole('tab', { name: '标签页 10', exact: true });
    await expect(last).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => (await bounds(last)).right - (await bounds(scroll)).right)
      .toBeLessThanOrEqual(1);
  });
}

test('交替时间线的轴在桌面和单侧断点连续', async ({ page }) => {
  await open(page, 'timeline');
  for (const width of [1024, 375]) {
    await page.setViewportSize({ width, height: 700 });
    const axes = page.locator('.ex-timeline-item__node');
    const first = await bounds(axes.first());
    for (const axis of await axes.all()) expect((await bounds(axis)).cx).toBeCloseTo(first.cx);
    const left = await bounds(page.locator('.ex-timeline-item__content--left').first());
    const right = await bounds(page.locator('.ex-timeline-item__content--right').first());
    expect(right.x).toBeGreaterThan(first.cx);
    if (width > 480) expect(left.right).toBeLessThan(first.cx);
    else expect(left.x).toBeGreaterThan(first.cx);
  }
});

test('无宿主 reset 时列表行和右端操作仍在容器内', async ({ page }) => {
  await open(page, 'list');
  const row = await bounds(page.locator('.ex-list__item'));
  const surface = await bounds(page.locator('.ex-list__item-surface'));
  expect(surface.right).toBeLessThanOrEqual(row.right + 1);
  expect((await bounds(page.locator('#extra'))).right).toBeLessThanOrEqual(row.right);
  await page.locator('#extra').click();
  await expect(page.locator('#clicks')).toHaveText('1');
});

test('关闭装饰效果后步骤保留键盘焦点环', async ({ page }) => {
  await open(page, 'steps');
  await page.locator('#direction').focus();
  await page.keyboard.press('Tab');
  const step = page.locator('.ex-step');
  await expect(step).toBeFocused();
  await expect(step).toHaveCSS('outline-style', 'solid');
});

test('双向嵌套的亮色按钮与独立主题拥有相同前景和背景', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'theme');
  for (const theme of ['neon-blue', 'light']) {
    await expect(page.locator('#inner')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('#reference')).toHaveAttribute('data-theme', theme);
    const [inner, reference] = await page.locator('#inner, #reference').evaluateAll(roots =>
      roots.map(root =>
        Array.from(root.querySelectorAll('button'), button => {
          const style = getComputedStyle(button);
          return [style.color, style.backgroundColor, style.backgroundImage];
        })
      )
    );
    expect(inner).toHaveLength(2);
    expect(inner).toEqual(reference);
    await page.locator('#theme-switch').click();
  }
});

test('正文尊重系统滚动偏好和原生有序列表编号', async ({ page }) => {
  await open(page, 'prose');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.ex-app')).toHaveCSS('scroll-behavior', 'smooth');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ex-app')).toHaveCSS('scroll-behavior', 'auto');
  for (const li of await page.locator('li').all()) {
    expect(await li.evaluate(el => getComputedStyle(el, '::before').content)).toMatch(
      /^(none|normal)$/
    );
    await expect(li).toHaveCSS('list-style-type', 'decimal');
  }
});
