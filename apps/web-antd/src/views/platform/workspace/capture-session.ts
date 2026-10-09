export interface CaptureSession {
  isCurrent: () => boolean;
}

/** A stopped session may finish an upload/request, but must never submit another frame. */
export async function submitCaptureFrame(
  isCurrent: () => boolean,
  actions: {
    cancel: (jobId: string) => Promise<unknown>;
    select: (assetId: string) => Promise<unknown>;
    submit: () => Promise<undefined | { id: string; status: string }>;
    track: (jobId?: string) => void;
    upload: () => Promise<{ id: string }>;
    wait: (jobId: string) => Promise<boolean>;
  },
) {
  if (!isCurrent()) return false;
  const asset = await actions.upload();
  if (!isCurrent()) return false;
  await actions.select(asset.id);
  if (!isCurrent()) return false;
  const job = await actions.submit();
  if (!job || job.status === 'failed') return false;
  actions.track(job.id);
  try {
    if (!isCurrent()) {
      await actions.cancel(job.id);
      return false;
    }
    return await actions.wait(job.id);
  } finally {
    actions.track();
  }
}
