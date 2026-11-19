import { expect, test } from '@playwright/test';

const fixture = '/tests/browser/data-audit-fixture.html';

test('真实图片在固有、单边、双边及受限宽度下保持正确内容尺寸', async ({ page }) => {
  await page.goto(fixture);
  await expect(page.locator('#pictures .ex-image--loaded')).toHaveCount(5);
  for (const [id, width, height] of [
    ['natural', 160, 80],
    ['width', 80, 40],
    ['height', 80, 40],
    ['both', 80, 60],
    ['constrained', 80, 40],
  ] as const) {
    const bounds = await page.locator(`#${id} img`).boundingBox();
    expect(bounds?.width).toBeCloseTo(width, 0);
    expect(bounds?.height).toBeCloseTo(height, 0);
  }
});

test('卡片跨断点保留可操作的排序及全选，键盘操作与行状态一致', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(fixture);
  const sort = page.getByRole('button', { name: 'Name', exact: true });
  const all = page.getByRole('checkbox', { name: 'Select All', exact: true });
  await expect(sort).toBeVisible();
  await sort.press('Enter');
  await expect(page.locator('tbody .ex-table__body-cell').first()).toHaveText('Alpha');
  await all.press('Space');
  await expect(page.locator('tbody input:checked')).toHaveCount(2);
  await expect(page.locator('.ex-table__row').first()).toHaveCSS('display', 'block');
  for (const width of [600, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.ex-table__row').first()).toHaveCSS('display', 'table-row');
    await expect(all).toBeChecked();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await sort.click();
  await expect(page.locator('tbody .ex-table__body-cell').first()).toHaveText('Beta');
  await sort.click();
  await expect(page.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
    'aria-sort',
    'none'
  );
  await all.press('Space');
  await expect(page.locator('tbody input:checked')).toHaveCount(0);
});

test('非虚拟和虚拟树的行缩进一致，展开父行按自身几何区分三个落点', async ({ page }) => {
  await page.goto(fixture);
  const row = (key: string) => page.locator(`[data-node-key="${key}"] > .ex-tree-node__content`);
  const indentation = () =>
    Promise.all(
      ['p', 'c', 'g', 'other'].map(async key => {
        const box = await row(key).locator(':scope > .ex-tree-node__expand-icon').boundingBox();
        return box!.x;
      })
    );
  const nested = await indentation();
  expect(nested[2]! - nested[1]!).toBe(nested[1]! - nested[0]!);
  expect(nested[3]).toBe(nested[1]);
  await row('p').locator('.ex-tree-node__expand-icon').click();
  await expect(row('g')).toHaveCount(0);
  await row('p').locator('.ex-tree-node__expand-icon').click();
  expect(await indentation()).toEqual(nested);
  for (const [fraction, position] of [
    [0.1, 'before'],
    [0.5, 'inner'],
    [0.9, 'after'],
  ] as const) {
    const box = (await row('p').boundingBox())!;
    await row('s').dragTo(row('p'), {
      targetPosition: { x: 25, y: Math.floor(box.height * fraction) },
    });
    await expect(page.locator('#drop')).toHaveText(`s/p/${position}`);
  }
  await page.locator('#virtual').click();
  expect(await indentation()).toEqual(nested);
  await row('p').locator('label').click();
  await expect(page.locator('[data-node-key="p"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-node-key="c"]')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-node-key="p"]')).toHaveAttribute('aria-checked', 'mixed');
});

test('可访问树可按完整日期及签到状态区分跨月同日', async ({ page }) => {
  await page.goto(fixture);
  const grid = page.getByRole('grid', { name: 'March 2025' });
  await expect(grid.getByRole('columnheader')).toHaveCount(7);
  await expect(
    grid.getByRole('gridcell', { name: /Saturday, March 1, 2025.*Checked in/ })
  ).toBeVisible();
  await expect(grid.getByRole('gridcell', { name: /Tuesday, April 1, 2025/ })).toBeVisible();
});
