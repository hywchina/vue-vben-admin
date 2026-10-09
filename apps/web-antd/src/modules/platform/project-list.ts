import type { PlatformProject } from './types';

export const PROJECT_PREVIEW_LIMIT = 6;

export function projectListTitle(isAdmin: boolean) {
  return isAdmin ? '全部项目' : '我的项目';
}

export function projectMemberOptions(projects: PlatformProject[]) {
  const members = new Map<string, string>();
  for (const project of projects) {
    for (const member of project.memberIdentities ?? []) {
      members.set(member.publicId, `${member.name} · ${member.publicId}`);
    }
  }
  return [...members.entries()]
    .map(([value, label]) => ({ value, label }))
    .toSorted((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

export function filterProjects(
  projects: PlatformProject[],
  keyword: string,
  memberPublicId?: string,
) {
  const query = keyword.trim().toLowerCase();
  return projects.filter(
    (project) =>
      (!memberPublicId ||
        project.memberIdentities?.some(
          (member) => member.publicId === memberPublicId,
        )) &&
      (!query ||
        `${project.name} ${project.publicId ?? project.code} ${project.description} ${(project.legacyCodes ?? []).join(' ')}`
          .toLowerCase()
          .includes(query)),
  );
}
