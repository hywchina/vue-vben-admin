import type { PlatformJob } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export type ReportFormat = 'docx' | 'md' | 'pptx';
export type ReportGenerationMode = 'ai' | 'template';
export type ReportType =
  | 'cmf-design'
  | 'component-design'
  | 'design-proposal'
  | 'project-summary';

export interface ReportStatus {
  configured: boolean;
  formats: Array<{ key: ReportFormat; label: string }>;
  generationModes: Array<{
    configured: boolean;
    description: string;
    key: ReportGenerationMode;
    label: string;
  }>;
  limits: { imagesPerSection: number; sections: number; totalImages: number };
  reportTypes: Array<{ key: ReportType; label: string }>;
  supportedImageMimeTypes: string[];
  template: { key: string; label: string; version: number };
}

export interface CreateReportInput {
  format: ReportFormat;
  generationMode: ReportGenerationMode;
  name: string;
  projectId: string;
  reportType: ReportType;
  sections: Array<{
    body: string;
    images: Array<{ assetId: string; caption: string }>;
    title: string;
  }>;
  summary: string;
  templateKey: 'rail-design-standard-v1';
  title: string;
}

export function getReportStatusApi() {
  return requestClient.get<ReportStatus>('/reports/status');
}

export function createReportApi(input: CreateReportInput) {
  return requestClient.post<PlatformJob>('/reports/generations', input);
}
