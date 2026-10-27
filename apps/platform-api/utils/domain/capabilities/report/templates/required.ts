import { ApiError } from '../../../../response';

/** Treat incomplete native structures as a validation failure, never assume them. */
export function requireTemplateValue<T>(value: null | T | undefined): T {
  if (value === null || value === undefined)
    throw new ApiError(
      400,
      'REPORT_TEMPLATE_LAYOUT_INVALID',
      '模板结构或内容位置不完整，请重新确认原文件',
    );
  return value;
}
