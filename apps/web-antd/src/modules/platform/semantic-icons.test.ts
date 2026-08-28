import { describe, expect, it } from 'vitest';

import { platformSemanticIcons } from './semantic-icons';

describe('platform semantic icons', () => {
  it('keeps stable icons for shared platform meanings', () => {
    expect(platformSemanticIcons.assets).toBe('lucide:library-big');
    expect(platformSemanticIcons.jobs).toBe('lucide:list-checks');
    expect(platformSemanticIcons.projects).toBe('lucide:folder-kanban');
    expect(platformSemanticIcons.workbench).toBe('lucide:panels-top-left');
  });

  it('does not reuse an icon for unrelated navigation meanings', () => {
    const navigationIcons = [
      platformSemanticIcons.home,
      platformSemanticIcons.design,
      platformSemanticIcons.modelTraining,
      platformSemanticIcons.assets,
      platformSemanticIcons.report,
      platformSemanticIcons.workbench,
    ];

    expect(new Set(navigationIcons).size).toBe(navigationIcons.length);
  });
});
