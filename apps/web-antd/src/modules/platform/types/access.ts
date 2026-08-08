export interface PlatformUser {
  department: string;
  email: string;
  id: string;
  lastActive: string;
  name: string;
  projectCount: number;
  roleCodes: string[];
  roles: string[];
  status: 'disabled' | 'enabled';
  username: string;
}

export interface PlatformRole {
  code: string;
  description: string;
  id: string;
  name: string;
  permissionCount: number;
  scope: string;
  userCount: number;
}
