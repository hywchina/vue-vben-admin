import type { ModelUploadStatus, SystemModelFile } from '#/api/platform/models';

export function selectedModelFiles(files: File[]): SystemModelFile[] {
  return files.map((f) => ({
    path: f.webkitRelativePath || f.name,
    size: f.size,
  }));
}
export function matchResumeFiles(manifest: SystemModelFile[], files: File[]) {
  const selected = selectedModelFiles(files);
  if (manifest.length !== selected.length)
    throw new Error('请重新选择本次上传的全部原文件');
  return manifest.map((expected) => {
    const index = selected.findIndex(
      (f) => f.path === expected.path && f.size === expected.size,
    );
    const file = files[index];
    if (!file) throw new Error(`文件与上传记录不匹配：${expected.path}`);
    return file;
  });
}
export async function resumeModelUpload(input: {
  files: File[];
  progress: (bytes: number) => void;
  send: (file: number, part: number, blob: Blob) => Promise<unknown>;
  signal: AbortSignal;
  status: ModelUploadStatus;
}) {
  const files = matchResumeFiles(input.status.files, input.files);
  let transferred = 0;
  for (const [fileIndex, file] of files.entries())
    for (let start = 0; start < file.size; start += input.status.partBytes) {
      if (input.signal.aborted)
        throw new DOMException('上传已暂停', 'AbortError');
      const blob = file.slice(
        start,
        Math.min(start + input.status.partBytes, file.size),
      );
      const partIndex = Math.floor(start / input.status.partBytes);
      const existing = input.status.parts.find(
        (p) => p.fileIndex === fileIndex && p.partIndex === partIndex,
      );
      if (existing) {
        if (!globalThis.crypto?.subtle)
          throw new Error('安全连接不可用，不能核验续传文件');
        const hash = [
          ...new Uint8Array(
            await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
          ),
        ]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
        if (hash !== existing.sha256)
          throw new Error(
            '所选文件内容与已上传分片不同，请使用原文件或新建上传',
          );
      } else await input.send(fileIndex, partIndex, blob);
      transferred += blob.size;
      input.progress(transferred);
    }
}
