import type { PlatformProject } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  filterProjects,
  PROJECT_PREVIEW_LIMIT,
  projectListTitle,
  projectMemberOptions,
} from '#/modules/platform/project-list';

const members = Array.from({ length: 4 }, (_, index) => ({
  name: `成员${index + 1}`,
  publicId: `USR-0000000${index + 1}`,
}));
const first: PlatformProject = {
  id: 'first',
  code: 'PRJ-00000001',
  publicId: 'PRJ-00000001',
  legacyCodes: ['PRJ-001'],
  name: '座椅设计',
  description: '客室项目',
  ownerId: 'owner',
  isOwner: true,
  isPinned: false,
  canDelete: true,
  stage: 'design',
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
  assetCount: 0,
  activeJobCount: 0,
  jobCount: 0,
  members: 4,
  memberIdentities: members,
  memberPreviews: members
    .slice(0, 3)
    .map((member) => ({ ...member, avatar: null })),
};
const second: PlatformProject = {
  ...first,
  id: 'second',
  name: '照明设计',
  code: 'PRJ-00000002',
  publicId: 'PRJ-00000002',
  legacyCodes: [],
  memberIdentities: members.slice(0, 1),
  members: 1,
};

describe('project list scope and member filter', () => {
  it('uses one role-aware title and previews up to six projects', () => {
    expect(projectListTitle(true)).toBe('全部项目');
    expect(projectListTitle(false)).toBe('我的项目');
    expect(PROJECT_PREVIEW_LIMIT).toBe(6);
  });
  it('lists all members once with searchable name and canonical ID', () => {
    const options = projectMemberOptions([first, second]);
    expect(options).toHaveLength(4);
    expect(options[3]).toEqual({
      label: '成员4 · USR-00000004',
      value: 'USR-00000004',
    });
  });
  it('includes projects owned by and participated in by a member', () => {
    expect(filterProjects([first, second], '', 'USR-00000001')).toEqual([
      first,
      second,
    ]);
    expect(filterProjects([first, second], '', 'USR-00000004')).toEqual([
      first,
    ]);
  });
  it('never relies on the three-avatar preview for filtering', () => {
    expect(
      first.memberPreviews.some((member) => member.publicId === 'USR-00000004'),
    ).toBe(false);
    expect(filterProjects([first], '', 'USR-00000004')).toHaveLength(1);
  });
  it('combines member and text filters without mutating the source collection', () => {
    const projects = [first, second];
    expect(filterProjects(projects, ' 照明 ', 'USR-00000004')).toEqual([]);
    expect(filterProjects(projects, ' 照明 ', 'USR-00000001')).toEqual([
      second,
    ]);
    expect(projects).toEqual([first, second]);
  });
  it('clearing restores all accessible projects and searches public IDs', () => {
    expect(filterProjects([first, second], '', undefined)).toEqual([
      first,
      second,
    ]);
    expect(filterProjects([first, second], ' prj-00000001 ')).toEqual([first]);
  });
  it('does not add inaccessible users or projects to a scoped list', () => {
    expect(projectMemberOptions([second])).toHaveLength(1);
    expect(filterProjects([second], '', 'USR-00000004')).toEqual([]);
  });
  it('handles empty lists and removed members', () => {
    expect(projectMemberOptions([])).toEqual([]);
    expect(filterProjects([], '', 'USR-00000001')).toEqual([]);
    expect(
      filterProjects([{ ...first, memberIdentities: [] }], '', 'USR-00000004'),
    ).toEqual([]);
  });
});
