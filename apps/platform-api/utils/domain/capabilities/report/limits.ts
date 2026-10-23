/** Shared by request validation, status contracts and the report composer. */
export const REPORT_LIMITS = {
  imagesPerSection: 20,
  sections: 8,
  totalImageBytes: 100 * 1024 * 1024,
  totalImages: 160,
} as const;
