interface PresignedFileUpload {
  headers: Record<string, string>;
  method: 'PUT';
  url: string;
}

export async function uploadPresignedFile(
  upload: PresignedFileUpload,
  file: File,
  errorLabel: string,
) {
  const response = await fetch(upload.url, {
    body: file,
    headers: upload.headers,
    method: upload.method,
  });
  if (!response.ok) {
    throw new Error(`${errorLabel}（HTTP ${response.status}）`);
  }
}
