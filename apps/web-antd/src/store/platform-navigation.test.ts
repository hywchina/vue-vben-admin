import { describe, expect, it } from 'vitest';

import platformRoutes from '#/router/routes/modules/platform';
import { getWorkbenchTools } from '#/views/platform/overview/workbench-tools';

describe('platform navigation', () => {
  it('keeps only the agreed primary entries in sidebar order', () => {
    const visibleRoutes = platformRoutes
      .filter((route) => !route.meta?.hideInMenu)
      .toSorted(
        (a, b) => Number(a.meta?.order ?? 0) - Number(b.meta?.order ?? 0),
      );

    expect(visibleRoutes.map((route) => route.meta?.title)).toEqual([
      '首页',
      '设计生成',
      '模型训练',
      '资产中心',
      '报告生成',
      '设计工作台',
    ]);
  });

  it('keeps project task and governance routes available outside the sidebar', () => {
    for (const routeName of [
      'PlatformJobs',
      'PlatformAdministration',
      'PlatformAudit',
    ]) {
      expect(
        platformRoutes.find((route) => route.name === routeName)?.meta
          ?.hideInMenu,
      ).toBe(true);
    }
  });

  it('shows governance tools according to the current role', () => {
    expect(getWorkbenchTools(false).map((tool) => tool.key)).toEqual(['audit']);
    expect(getWorkbenchTools(false)[0]?.description).toContain('当前账号');
    expect(getWorkbenchTools(true).map((tool) => tool.key)).toEqual([
      'access',
      'workflows',
      'audit',
    ]);
  });
});
