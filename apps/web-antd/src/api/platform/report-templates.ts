import type {
  ReportTemplateView,
  TemplateConfiguration,
} from '../../../../platform-api/utils/domain/capabilities/report/templates/schema';

import { requestClient } from '#/api/request';
export type { ReportTemplateView, TemplateConfiguration };
export const listReportTemplatesApi = (projectId: string) =>
  requestClient.get<ReportTemplateView[]>('/report-templates', {
    params: { projectId },
  });
export const prepareReportTemplateApi = (input: {
  filename: string;
  name: string;
  projectId: string;
  sizeBytes: number;
}) =>
  requestClient.post<{
    id: string;
    upload: { headers: Record<string, string>; url: string };
  }>('/report-templates/uploads', input);
export const completeReportTemplateApi = (id: string) =>
  requestClient.post<ReportTemplateView>(`/report-templates/${id}/complete`);
export const configureReportTemplateApi = (
  id: string,
  input: {
    configuration: TemplateConfiguration;
    name: string;
    revision: number;
  },
) => requestClient.put<ReportTemplateView>(`/report-templates/${id}`, input);
export const downloadReportTemplateApi = (id: string) =>
  requestClient.get<{ url: string }>(`/report-templates/${id}/download`);
export const archiveReportTemplateApi = (id: string) =>
  requestClient.delete(`/report-templates/${id}`);
export const downloadReportStarterApi = (
  format: 'docx' | 'pptx',
  kind: string,
) =>
  requestClient.get<{ url: string }>('/report-templates/starter', {
    params: { format, kind },
  });
