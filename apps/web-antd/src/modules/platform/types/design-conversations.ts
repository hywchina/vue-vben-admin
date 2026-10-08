export interface DesignConversation {
  activeJobCount: number;
  createdAt: string;
  id: string;
  /** Stable business number; optional only for cached legacy responses. */
  publicId?: string;
  legacy: boolean;
  lastAppKey: null | string;
  previewAssetId: null | string;
  roundCount: number;
  title: string;
  updatedAt: string;
}
