import { platformSemanticIcons } from '#/modules/platform/semantic-icons';

export interface WorkbenchTool {
  description: string;
  icon: string;
  key: 'access' | 'audit' | 'workflows';
  path: string;
  title: string;
}

export function getWorkbenchTools(isAdmin: boolean): WorkbenchTool[] {
  return [
    ...(isAdmin
      ? [
          {
            description: '管理平台账号、角色及权限边界',
            icon: platformSemanticIcons.access,
            key: 'access' as const,
            path: '/administration/access',
            title: '用户与权限',
          },
          {
            description: '维护外部工作流版本与发布状态',
            icon: platformSemanticIcons.workflow,
            key: 'workflows' as const,
            path: '/administration/workflows',
            title: '工作流管理',
          },
        ]
      : []),
    {
      description: isAdmin
        ? '查看全部账号的平台操作元数据'
        : '查看当前账号自己的操作记录',
      icon: platformSemanticIcons.audit,
      key: 'audit',
      path: '/audit',
      title: '操作日志',
    },
  ];
}
