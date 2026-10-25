import { normalizeId, validateDraft } from './model.js'
import type { MemoryDetail, MemoryDraft, MemoryKind, PanelData, SaveTarget } from './model.js'

const PREFIX = '/dsh-memory/api/v1'

/** The server has no revision/ETag contract; these results do not imply locking. */
export interface MutationResult {
  ok: true
  id?: string
  updated?: boolean | string
  deleted?: string
  scope?: 'user' | 'project'
  kind?: MemoryKind
  notice?: string
  backup_file?: string
}

async function request<T>(endpoint: string, body: unknown | undefined, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${PREFIX}/${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  let result: unknown
  try { result = await response.json() } catch (error) {
    // Preserve cancellation, so an intentionally abandoned request is not shown
    // as a service failure by the panel.
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    throw new Error(`服务未返回有效 JSON（HTTP ${response.status}）。请检查 Memory 服务并重试。`)
  }
  const envelope = result as { ok?: boolean, error?: unknown } | null
  if (!response.ok || envelope === null || typeof envelope !== 'object' || (endpoint !== 'list' && envelope.ok !== true)) {
    const message = typeof envelope?.error === 'string' ? envelope.error : `请求失败（HTTP ${response.status}）`
    throw new Error(message)
  }
  if (endpoint === 'list') {
    const scopes = (envelope as Partial<PanelData>).scopes
    if (scopes === null || typeof scopes !== 'object' || Array.isArray(scopes)
      || (scopes.projects !== undefined && !Array.isArray(scopes.projects))) {
      throw new Error('Memory 列表格式无效，请刷新重试。')
    }
  }
  if (endpoint === 'read') {
    const detail = envelope as Partial<MemoryDetail>
    if (typeof detail.id !== 'string' || typeof detail.title !== 'string'
      || typeof detail.content !== 'string' || typeof detail.path !== 'string'
      || !Array.isArray(detail.tags) || !detail.tags.every(tag => typeof tag === 'string')
      || (detail.kind !== 'memory' && detail.kind !== 'reference')) {
      // Do not let an incomplete response become an editable empty draft.
      throw new Error('Memory 正文格式无效；未进入编辑，请重试。')
    }
  }
  return result as T
}

function identity(target: SaveTarget, id: string): SaveTarget & { id: string } {
  return { scope: target.scope, ...(target.scope === 'project' ? { workspace: target.workspace } : {}), id: normalizeId(id) }
}

function fields(draft: MemoryDraft): { title: string, content: string, kind: MemoryKind, tags: string[], path: string } {
  const errors = validateDraft(draft)
  if (errors.length > 0) throw new Error(errors.join('\n'))
  return {
    // Validation never slices input. Keep the actual text for the existing
    // server normalization rather than silently altering a hand-written file.
    title: draft.title, content: draft.content, kind: draft.kind,
    tags: draft.tags.split(',').map(tag => tag.trim()).filter(Boolean), path: draft.path.trim(),
  }
}

export const memoryApi = {
  list(signal?: AbortSignal): Promise<PanelData> { return request('list', undefined, signal) },
  read(target: SaveTarget, id: string, signal?: AbortSignal): Promise<MemoryDetail> {
    return request('read', identity(target, id), signal)
  },
  async save(draft: MemoryDraft, signal?: AbortSignal): Promise<MutationResult> {
    return request('save', { ...fields(draft), scope: draft.target.scope, ...(draft.target.scope === 'project' ? { workspace: draft.target.workspace } : {}) }, signal)
  },
  async update(target: SaveTarget, id: string, draft: MemoryDraft, signal?: AbortSignal): Promise<MutationResult> {
    return request('update', {
      ...identity(target, id), ...fields(draft), targetScope: draft.target.scope,
      ...(draft.target.scope === 'project' ? { targetWorkspace: draft.target.workspace } : {}),
    }, signal)
  },
  delete(target: SaveTarget, id: string, signal?: AbortSignal): Promise<MutationResult> {
    return request('delete', identity(target, id), signal)
  },
}
