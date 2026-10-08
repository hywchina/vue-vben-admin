import { icons as lucide } from '@iconify-json/lucide';
import { describe, expect, it } from 'vitest';

import { assetGenerationModules } from '#/modules/platform/asset-browser';
import { assetTypeIcon, assetTypeIcons } from '#/modules/platform/asset-types';
import {
  applicationSemanticIcon,
  capabilitySemanticIcons,
} from '#/modules/platform/capability-icons';
import { comfyMaskIcon } from '#/modules/platform/custom-icons';
import { designModes } from '#/modules/platform/design-modes';
import { designImageResultActions } from '#/modules/platform/design-result-actions';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { platformUiIcons } from '#/modules/platform/ui-icons';

const sources = import.meta.glob<string>('../**/*.{vue,ts}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const shared = import.meta.glob<string>(
  [
    '../../../../packages/effects/layouts/src/basic/header/header.vue',
    '../../../../packages/@core/ui-kit/tabs-ui/src/components/widgets/tool-refresh.vue',
    '../../../../packages/effects/layouts/src/widgets/preferences/preferences-drawer.vue',
    '../../../../packages/@core/ui-kit/popup-ui/src/modal/modal.vue',
    '../../../../packages/effects/layouts/src/widgets/breadcrumb.vue',
  ],
  { query: '?raw', import: 'default', eager: true },
);
const sharedSource = (path: string) => shared[`../../../../${path}`];

describe('platform icon semantics', () => {
  it('keeps asset entry distinct from real file types', () => {
    expect(platformSemanticIcons.assets).toBe('lucide:library-big');
    expect(assetTypeIcons.image).toBe('lucide:image');
    expect(Object.keys(assetTypeIcons)).toHaveLength(8);
    for (const [kind, icon] of Object.entries(assetTypeIcons)) {
      expect(assetTypeIcon(kind)).toBe(icon);
      expect(icon).not.toBe(platformSemanticIcons.assets);
    }
    expect(assetTypeIcon('unknown')).toBe(platformUiIcons.file);
    expect(assetTypeIcon('__proto__')).toBe(platformUiIcons.file);
  });

  it('uses identical category icons in design modes and asset filters', () => {
    for (const mode of designModes) {
      expect(mode.icon).toBe(platformSemanticIcons[mode.key]);
      expect(
        assetGenerationModules.find((item) => item.key === mode.key)?.icon,
      ).toBe(mode.icon);
    }
  });

  it('keeps save and mask result tools consistent with business entries', () => {
    for (const mode of ['cabin', 'cmf', 'component'] as const) {
      const actions = designImageResultActions(mode);
      expect(actions.find((item) => item.key === 'save')?.icon).toBe(
        platformSemanticIcons.assets,
      );
      expect(actions.find((item) => item.key === 'mask')?.icon).toBe(
        platformSemanticIcons.mask,
      );
    }
    expect(capabilitySemanticIcons['inpaint-single']).toBe(
      platformSemanticIcons.mask,
    );
    expect(comfyMaskIcon.body).toContain('currentColor');
    const component = sources['../components/platform/comfy-mask-icon.vue'];
    expect(component).toContain('platformSemanticIcons.mask');
    const resultCard = sources['../components/platform/workflow-run-card.vue'];
    expect(resultCard).not.toMatch(/:icon="[^"]*activeOutput\.saved/);
    expect(resultCard).toContain(':icon="platformSemanticIcons.assets"');
  });

  it('normalizes persisted app icons and safely handles unknown apps', () => {
    expect(
      applicationSemanticIcon({
        key: 'lora-training',
        icon: 'lucide:brain-circuit',
      }),
    ).toBe(platformSemanticIcons.modelTraining);
    expect(
      applicationSemanticIcon({
        key: 'report-generator',
        icon: 'lucide:file-text',
      }),
    ).toBe(platformSemanticIcons.report);
    expect(
      applicationSemanticIcon({
        key: 'inpaint-single',
        icon: 'lucide:paintbrush',
      }),
    ).toBe(platformSemanticIcons.mask);
    expect(
      applicationSemanticIcon({ key: 'custom', icon: assetTypeIcons.image }),
    ).toBe(assetTypeIcons.image);
    expect(
      applicationSemanticIcon({ key: 'custom', icon: 'unregistered:alien' }),
    ).toBe(platformSemanticIcons.applications);
    expect(applicationSemanticIcon({ key: 'custom' })).toBe(
      platformSemanticIcons.applications,
    );
  });

  it('registers every centralized glyph locally, without missing network icons', () => {
    const all = [
      ...Object.values(platformSemanticIcons),
      ...Object.values(platformUiIcons),
      ...Object.values(assetTypeIcons),
      ...Object.values(capabilitySemanticIcons),
    ];
    for (const icon of all) {
      if (icon === platformSemanticIcons.mask) continue;
      expect(icon.startsWith('lucide:')).toBe(true);
      const name = icon.slice('lucide:'.length);
      expect({
        icon,
        exists: Boolean(lucide.icons[name] || lucide.aliases?.[name]),
      }).toEqual({ icon, exists: true });
    }
    expect(sources['../bootstrap.ts']).toContain(
      'addIcon(platformSemanticIcons.mask, comfyMaskIcon)',
    );
  });

  it('prevents runtime pages and route configs from scattering literal glyph IDs', () => {
    const allowed = new Set([
      'asset-types.ts',
      'bootstrap.ts',
      'semantic-icons.ts',
      'ui-icons.ts',
    ]);
    const violations = Object.keys(sources)
      .filter(
        (path) =>
          /\.(vue|ts)$/.test(path) &&
          !path.endsWith('.test.ts') &&
          ![...allowed].some((name) => path.endsWith(`/${name}`)),
      )
      .filter((path) =>
        /['"](?:lucide|rail):[^'"]+['"]/.test(sources[path] ?? ''),
      );
    expect(violations).toEqual([]);
  });

  it('keeps shared refresh, reset, fullscreen and home icons consistent', () => {
    for (const path of [
      'packages/effects/layouts/src/basic/header/header.vue',
      'packages/@core/ui-kit/tabs-ui/src/components/widgets/tool-refresh.vue',
    ]) {
      expect(sharedSource(path)).toContain('RefreshCw');
    }
    expect(
      sharedSource(
        'packages/effects/layouts/src/widgets/preferences/preferences-drawer.vue',
      ),
    ).toContain('RotateCcw');
    expect(
      sharedSource('packages/@core/ui-kit/popup-ui/src/modal/modal.vue'),
    ).toContain('Maximize2');
    expect(
      sharedSource('packages/effects/layouts/src/widgets/breadcrumb.vue'),
    ).toContain(platformSemanticIcons.home);
  });
});
