export interface ComfyOutputFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

export interface ComfyExecutionSnapshot {
  errorCode?: string;
  errorMessage?: string;
  outputs?: Record<string, Record<string, unknown>>;
  progress: number;
  status: 'failed' | 'queued' | 'running' | 'succeeded';
}

export interface ComfyUiClientOptions {
  apiToken?: null | string;
  apiUrl: string;
  fetchImplementation?: typeof globalThis.fetch;
  timeoutMs: number;
}

function executionError(job: Record<string, unknown>) {
  const status = job.status as
    | undefined
    | { messages?: unknown[]; status_str?: string };
  const messages = Array.isArray(status?.messages) ? status.messages : [];
  const entry = [...messages]
    .toReversed()
    .find(
      (message) =>
        Array.isArray(message) &&
        message[0] === 'execution_error' &&
        message[1] &&
        typeof message[1] === 'object',
    ) as [string, Record<string, unknown>] | undefined;
  const details = entry?.[1];
  return {
    code: 'COMFYUI_EXECUTION_FAILED',
    message:
      (typeof details?.exception_message === 'string'
        ? details.exception_message
        : null) ?? 'ComfyUI 工作流执行失败',
  };
}

export class ComfyUiClient {
  readonly #apiToken: null | string;
  readonly #baseUrl: URL;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  constructor(options: ComfyUiClientOptions) {
    this.#baseUrl = new URL(
      options.apiUrl.endsWith('/') ? options.apiUrl : `${options.apiUrl}/`,
    );
    if (!['http:', 'https:'].includes(this.#baseUrl.protocol)) {
      throw new Error('COMFYUI_API_URL 必须使用 http 或 https');
    }
    this.#apiToken = options.apiToken ?? null;
    this.#fetch = options.fetchImplementation ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs;
  }

  async cancel(promptId: string) {
    const headers = { 'Content-Type': 'application/json' };
    const results = await Promise.allSettled([
      this.#requestJson('queue', {
        body: JSON.stringify({ delete: [promptId] }),
        headers,
        method: 'POST',
      }),
      this.#requestJson('interrupt', {
        body: JSON.stringify({ prompt_id: promptId }),
        headers,
        method: 'POST',
      }),
    ]);
    if (results.every((result) => result.status === 'rejected')) {
      throw new Error('ComfyUI 取消请求失败');
    }
  }

  async download(file: ComfyOutputFile) {
    const query = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder ?? '',
      type: file.type ?? 'output',
    });
    const response = await this.#request(`view?${query.toString()}`, {
      headers: { Accept: '*/*' },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      mimeType:
        response.headers.get('content-type')?.split(';')[0]?.trim() ||
        'application/octet-stream',
    };
  }

  async getStatus(promptId: string): Promise<ComfyExecutionSnapshot> {
    const history = await this.#requestJson(
      `history/${encodeURIComponent(promptId)}`,
    );
    const job = history[promptId];
    if (job && typeof job === 'object' && !Array.isArray(job)) {
      const typedJob = job as Record<string, unknown>;
      const status = typedJob.status as undefined | { status_str?: unknown };
      if (status?.status_str === 'error') {
        const error = executionError(typedJob);
        return {
          errorCode: error.code,
          errorMessage: error.message,
          progress: 100,
          status: 'failed',
        };
      }
      if (status?.status_str === 'success') {
        return {
          outputs:
            typedJob.outputs &&
            typeof typedJob.outputs === 'object' &&
            !Array.isArray(typedJob.outputs)
              ? (typedJob.outputs as Record<string, Record<string, unknown>>)
              : {},
          progress: 100,
          status: 'succeeded',
        };
      }
    }

    const queue = await this.#requestJson('queue');
    const running = Array.isArray(queue.queue_running)
      ? queue.queue_running.some(
          (item) => Array.isArray(item) && item[1] === promptId,
        )
      : false;
    if (running) return { progress: 35, status: 'running' };
    const pending = Array.isArray(queue.queue_pending)
      ? queue.queue_pending.findIndex(
          (item) => Array.isArray(item) && item[1] === promptId,
        )
      : -1;
    return {
      progress: pending >= 0 ? Math.max(5, 20 - Math.min(pending, 15)) : 5,
      status: 'queued',
    };
  }

  async submit(prompt: Record<string, unknown>, platformJobId: string) {
    const result = await this.#requestJson('prompt', {
      body: JSON.stringify({
        client_id: platformJobId,
        extra_data: { platform_job_id: platformJobId },
        prompt,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (typeof result.prompt_id !== 'string' || !result.prompt_id) {
      throw new Error('ComfyUI /prompt 未返回 prompt_id');
    }
    return {
      externalJobId: result.prompt_id,
      queueNumber:
        typeof result.number === 'number' ? result.number : undefined,
    };
  }

  async uploadInput(input: {
    bytes: Uint8Array;
    filename: string;
    mimeType: string;
    subfolder: string;
  }) {
    const form = new FormData();
    const fileBytes = new Uint8Array(input.bytes);
    form.set(
      'image',
      new Blob([fileBytes], { type: input.mimeType }),
      input.filename,
    );
    form.set('overwrite', 'true');
    form.set('subfolder', input.subfolder);
    form.set('type', 'input');
    const result = await this.#requestJson('upload/image', {
      body: form,
      method: 'POST',
    });
    if (typeof result.name !== 'string' || !result.name) {
      throw new Error('ComfyUI /upload/image 未返回文件名');
    }
    const subfolder =
      typeof result.subfolder === 'string' ? result.subfolder : input.subfolder;
    return {
      name: result.name,
      subfolder,
      value: subfolder ? `${subfolder}/${result.name}` : result.name,
    };
  }

  async #request(path: string, init?: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    const headers = new Headers(init?.headers);
    headers.set('Accept', headers.get('Accept') ?? 'application/json');
    if (this.#apiToken) {
      headers.set('Authorization', `Bearer ${this.#apiToken}`);
    }
    try {
      const response = await this.#fetch(new URL(path, this.#baseUrl), {
        ...init,
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        const bodySummary = body ? `：${body.slice(0, 500)}` : '';
        throw new Error(`ComfyUI 返回 HTTP ${response.status}${bodySummary}`);
      }
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('ComfyUI 请求超时', { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async #requestJson(path: string, init?: RequestInit) {
    const response = await this.#request(path, init);
    return (await response.json()) as Record<string, unknown>;
  }
}
