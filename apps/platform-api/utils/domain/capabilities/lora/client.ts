export interface AiToolkitJob {
  id: string;
  info?: string;
  job_ref?: string;
  speed_string?: string;
  status: 'completed' | 'error' | 'queued' | 'running' | 'stopped' | 'stopping';
  step?: number;
  total_steps?: number;
}

export interface AiToolkitArtifact {
  path: string;
  size: number;
}

export class AiToolkitClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AiToolkitClientError';
  }
}

export class AiToolkitClient {
  #apiUrl: string;
  #fetch: typeof fetch;
  #timeoutMs: number;
  #token?: string;

  constructor(input: {
    apiUrl: string;
    fetchImplementation?: typeof fetch;
    timeoutMs: number;
    token?: null | string;
  }) {
    this.#apiUrl = input.apiUrl.replace(/\/+$/, '');
    this.#fetch = input.fetchImplementation ?? fetch;
    this.#timeoutMs = input.timeoutMs;
    this.#token = input.token ?? undefined;
  }

  async cancel(jobId: string) {
    return await this.#json(`/api/jobs/${encodeURIComponent(jobId)}/stop`);
  }

  async createDataset(name: string) {
    return await this.#json<{ name: string; success: boolean }>(
      '/api/datasets/create',
      { body: JSON.stringify({ name }), method: 'POST' },
    );
  }

  async createJob(input: {
    gpuIds: string;
    jobConfig: Record<string, unknown>;
    jobRef: string;
    name: string;
  }) {
    return await this.#json<AiToolkitJob>('/api/jobs', {
      body: JSON.stringify({
        gpu_ids: input.gpuIds,
        job_config: input.jobConfig,
        job_ref: input.jobRef,
        job_type: 'train',
        name: input.name,
      }),
      method: 'POST',
    });
  }

  async download(path: string) {
    return await this.#request(
      `/api/files/${encodeURIComponent(path)}`,
      undefined,
      false,
    );
  }

  async getDatasetRoot() {
    const settings = await this.#json<{ DATASETS_FOLDER?: string }>(
      '/api/settings',
    );
    if (!settings.DATASETS_FOLDER?.trim()) {
      throw new AiToolkitClientError(500, 'AI Toolkit 未返回 DATASETS_FOLDER');
    }
    return settings.DATASETS_FOLDER.trim();
  }

  async getFiles(jobId: string) {
    const result = await this.#json<{ files?: AiToolkitArtifact[] }>(
      `/api/jobs/${encodeURIComponent(jobId)}/files`,
    );
    return (result.files ?? []).filter((file) =>
      file.path.toLowerCase().endsWith('.safetensors'),
    );
  }

  async getJob(jobId: string) {
    return await this.#json<AiToolkitJob>(
      `/api/jobs?id=${encodeURIComponent(jobId)}`,
    );
  }

  async getJobByRef(jobRef: string) {
    const result = await this.#json<AiToolkitJob | AiToolkitJob[] | null>(
      `/api/jobs?job_ref=${encodeURIComponent(jobRef)}`,
    );
    return Array.isArray(result) ? result[0] : result;
  }

  async getLog(jobId: string, offset = 0) {
    return await this.#json<{ log: string; offset: number; reset: boolean }>(
      `/api/jobs/${encodeURIComponent(jobId)}/log?offset=${offset}`,
    );
  }

  async getLoss(jobId: string, sinceStep?: number) {
    const query = new URLSearchParams({ key: 'loss', limit: '2000' });
    if (sinceStep !== undefined) query.set('since_step', String(sinceStep));
    return await this.#json<{
      key: string;
      keys: string[];
      points: Array<{ step: number; value: number; wall_time: number }>;
    }>(`/api/jobs/${encodeURIComponent(jobId)}/loss?${query}`);
  }

  async healthCheck() {
    await this.#json('/api/datasets/list');
  }

  async requestSave(jobId: string) {
    return await this.#json(`/api/jobs/${encodeURIComponent(jobId)}/save_now`);
  }

  async start(jobId: string, gpuIds: string) {
    await this.#json(`/api/jobs/${encodeURIComponent(jobId)}/start`);
    await this.#json(`/api/queue/${encodeURIComponent(gpuIds)}/start`);
  }

  async uploadDataset(
    datasetName: string,
    files: Array<{ bytes: Uint8Array; filename: string; mimeType: string }>,
  ) {
    const form = new FormData();
    form.set('datasetName', datasetName);
    for (const file of files) {
      form.append(
        'files',
        new Blob([Uint8Array.from(file.bytes).buffer], { type: file.mimeType }),
        file.filename,
      );
    }
    return await this.#json<{ files: string[]; message: string }>(
      '/api/datasets/upload',
      { body: form, method: 'POST' },
      false,
    );
  }

  async #json<T = unknown>(
    path: string,
    init?: RequestInit,
    jsonContentType = true,
  ) {
    const response = await this.#request(path, init, jsonContentType);
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AiToolkitClientError(
        response.status,
        `AI Toolkit 返回了无效 JSON：${text.slice(0, 200)}`,
      );
    }
  }

  async #request(path: string, init?: RequestInit, jsonContentType = true) {
    const headers = new Headers(init?.headers);
    if (this.#token) headers.set('Authorization', `Bearer ${this.#token}`);
    if (jsonContentType && init?.body) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await this.#fetch(`${this.#apiUrl}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) {
      const responseText = await response.text();
      const message = responseText.slice(0, 500);
      throw new AiToolkitClientError(
        response.status,
        `AI Toolkit 请求失败（HTTP ${response.status}）：${message || response.statusText}`,
      );
    }
    return response;
  }
}
