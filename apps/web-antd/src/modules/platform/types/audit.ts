export interface PlatformAuditEvent {
  action: string;
  actorId?: null | string;
  actorRoles?: string[];
  actorType?: 'admin' | 'system' | 'user';
  createdAt: string;
  durationMs?: null | number;
  id: string;
  ip: string;
  method?: null | string;
  module: string;
  operator: string;
  requestId?: string;
  result: 'failed' | 'success';
  statusCode?: null | number;
  target: string;
  username?: string;
}
