import { z } from 'zod';

import { PLATFORM_ROLE_CODES } from '../roles';

const password = z
  .string()
  .min(8, '密码至少需要 8 个字符')
  .max(128)
  .regex(/[A-Za-z]/, '密码必须包含字母')
  .regex(/\d/, '密码必须包含数字')
  .regex(/[^\dA-Za-z]/, '密码必须包含符号');
const username = z
  .string()
  .trim()
  .min(3, '用户名至少需要 3 个字符')
  .max(32)
  .regex(/^[\w.-]+$/, '用户名只能包含字母、数字、点、横线和下划线');
const realName = z
  .string()
  .trim()
  .min(1, '姓名不能为空')
  .max(100, '姓名不能超过 100 个字符');

// Ignore legacy email fields. Profile updates must not clear existing email data.
export const registerAccountSchema = z.object({
  department: z.string().trim().max(100).optional().default(''),
  password,
  realName: realName.optional(),
  username,
});

export const createAccountSchema = registerAccountSchema.extend({
  realName,
  role: z.enum(PLATFORM_ROLE_CODES).default('user'),
});

export const updateProfileSchema = z.object({
  department: z.string().trim().max(100, '部门名称不能超过 100 个字符'),
  introduction: z.string().trim().max(500, '个人简介不能超过 500 个字符'),
  realName,
});
