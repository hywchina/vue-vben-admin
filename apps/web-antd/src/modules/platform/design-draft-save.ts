import type { WorkflowWorkspaceDraft } from './types';

export interface DesignDraftPayload {
  appKey: string;
  conversationId: string;
  designMode?: 'cabin' | 'cmf' | 'component';
  inputAssetIds: Record<string, string>;
  parameterValues: Record<string, unknown>;
  projectId: string;
}
export interface DraftWriteToken {
  baseRevision: number;
  sequence: number;
  writerId: string;
}
type Write = (
  input: DesignDraftPayload & { writeToken: DraftWriteToken },
) => Promise<unknown>;
interface Entry {
  acknowledged?: string;
  error?: string;
  payload?: DesignDraftPayload;
  pending?: { promise: Promise<boolean>; sequence: number };
  revision: number;
  sequence: number;
}
export function designDraftKey(
  input: Pick<
    DesignDraftPayload,
    'appKey' | 'conversationId' | 'designMode' | 'projectId'
  >,
) {
  return `${input.projectId}:${input.conversationId}:${input.appKey}:${input.designMode ?? 'cabin'}`;
}

function fingerprint(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

/** Tracks unacknowledged writes separately from the editable form. */
export class DesignDraftSaver {
  get status() {
    const dirty = [...this.entries.values()].filter((entry) =>
      this.dirty(entry),
    );
    return {
      dirty: dirty.length > 0,
      error: dirty.find((entry) => entry.error)?.error,
      saving: dirty.some((entry) => entry.pending),
      initialized: [...this.entries.values()].some(
        (entry) => entry.sequence > 0,
      ),
    };
  }
  private entries = new Map<string, Entry>();

  constructor(
    private send: Write,
    private changed: () => void,
    private writerId: string = crypto.randomUUID(),
  ) {}
  async flush() {
    await Promise.all(
      [...this.entries.values()]
        .filter((entry) => this.dirty(entry) && entry.payload)
        .map((entry) => (entry.payload ? this.save(entry.payload) : true)),
    );
  }
  flushForUnload(send: Write) {
    let bytes = 0;
    for (const entry of this.entries.values()) {
      if (!this.dirty(entry) || !entry.payload) continue;
      bytes +=
        new TextEncoder().encode(fingerprint(entry.payload)).length + 1024;
      // Browsers cap the aggregate keepalive request bodies at 64 KiB.
      if (bytes <= 60 * 1024) void this.write(entry, send);
    }
  }
  restore(
    scope: Omit<DesignDraftPayload, 'inputAssetIds' | 'parameterValues'>,
    remote: WorkflowWorkspaceDraft,
  ): WorkflowWorkspaceDraft {
    const key = designDraftKey(scope);
    const existing = this.entries.get(key);
    if (
      existing?.payload &&
      (this.dirty(existing) || (remote.revision ?? 0) < existing.revision)
    ) {
      return {
        ...remote,
        inputAssetIds: existing.payload.inputAssetIds,
        parameterValues: existing.payload.parameterValues,
        updatedAt: remote.updatedAt ?? 'pending',
      };
    }
    const payload = {
      ...scope,
      designMode: scope.designMode ?? 'cabin',
      inputAssetIds: remote.inputAssetIds,
      parameterValues: remote.parameterValues,
    };
    this.entries.set(key, {
      revision: remote.revision ?? 0,
      sequence: existing?.sequence ?? 0,
      acknowledged: fingerprint(payload),
    });
    return remote;
  }
  async save(payload: DesignDraftPayload, supersedePending = false) {
    const entry = this.stage(payload);
    if (!this.dirty(entry)) return true;
    if (entry.pending?.sequence === entry.sequence) {
      if (!supersedePending) return entry.pending.promise;
      entry.sequence++;
    }
    const pending = {
      sequence: entry.sequence,
      promise: this.write(entry, this.send),
    };
    entry.pending = pending;
    this.changed();
    try {
      return await pending.promise;
    } finally {
      if (entry.pending === pending) entry.pending = undefined;
      this.changed();
    }
  }
  stage(input: DesignDraftPayload) {
    const key = designDraftKey(input);
    const entry = this.entries.get(key) ?? { revision: 0, sequence: 0 };
    const payload = JSON.parse(
      JSON.stringify({ ...input, designMode: input.designMode ?? 'cabin' }),
    ) as DesignDraftPayload;
    if (fingerprint(payload) !== fingerprint(entry.payload)) {
      entry.payload = payload;
      entry.sequence++;
    }
    this.entries.set(key, entry);
    this.changed();
    return entry;
  }
  private dirty(entry: Entry) {
    return Boolean(
      entry.payload && fingerprint(entry.payload) !== entry.acknowledged,
    );
  }
  private async write(entry: Entry, send: Write) {
    if (!entry.payload || !this.dirty(entry)) return true;
    const sequence = entry.sequence;
    const payload = entry.payload;
    const serialized = fingerprint(payload);
    try {
      const result = await send({
        ...payload,
        writeToken: {
          writerId: this.writerId,
          sequence,
          baseRevision: entry.revision,
        },
      });
      if (
        result &&
        typeof result === 'object' &&
        'revision' in result &&
        typeof result.revision === 'number'
      )
        entry.revision = Math.max(entry.revision, result.revision);
      if (sequence === entry.sequence) {
        entry.acknowledged = serialized;
        entry.error = undefined;
      }
      return true;
    } catch (error) {
      if (sequence === entry.sequence && this.dirty(entry))
        entry.error =
          error instanceof Error ? error.message : '草稿保存失败，请重试';
      return false;
    } finally {
      this.changed();
    }
  }
}
