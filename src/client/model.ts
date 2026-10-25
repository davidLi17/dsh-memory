/** Client-only snapshots and pure view-model helpers. No memory files are rewritten here. */
export type MemoryKind = 'memory' | 'reference'

export interface SaveTarget { scope: 'user' | 'project', workspace?: string }
export interface PanelEntry {
  id?: string
  kind?: MemoryKind
  title: string
  date: string
  path: string
  tags: string[]
  excerpt: string
  unindexed?: boolean
}
export interface ScopeStats {
  entries: number
  maxEntries: number
  indexBytes: number
  maxBytes: number
  memoryFiles: number
  maxMemories: number
}
export interface ScopeInfo { available: boolean, stats?: ScopeStats, entries?: PanelEntry[] }
export interface WorkspaceInfo {
  root: string
  name: string
  serviceAnchor: boolean
  nested?: boolean
  stats: ScopeStats
  entries: PanelEntry[]
}
export interface PanelData { scopes: { user?: ScopeInfo, projects?: WorkspaceInfo[] } }
export interface MemoryDetail {
  ok: true
  id: string
  kind: MemoryKind
  title: string
  content: string
  path: string
  tags: string[]
}
export interface MemoryDraft {
  title: string
  content: string
  kind: MemoryKind
  tags: string
  path: string
  target: SaveTarget
}
export interface ScopeView {
  key: string
  label: string
  target: SaveTarget
  available: boolean
  nested: boolean
  serviceAnchor: boolean
  stats?: ScopeStats
  entries: PanelEntry[]
}
export interface EntryView extends PanelEntry {
  key: string
  target: SaveTarget
  scopeLabel: string
  readOnly: boolean
}

/** Match the existing HTTP id contract, including index rows ending in .md. */
export function normalizeId(id: string): string { return id.replace(/\.md$/, '') }

export function scopeKey(target: SaveTarget): string {
  return JSON.stringify([target.scope, target.scope === 'project' ? target.workspace ?? '' : ''])
}

export function entryKey(target: SaveTarget, id: string): string {
  return JSON.stringify([target.scope, target.scope === 'project' ? target.workspace ?? '' : '', normalizeId(id)])
}

export function scopesOf(data: PanelData): ScopeView[] {
  const user = data.scopes.user
  const target: SaveTarget = { scope: 'user' }
  return [{
    key: scopeKey(target), label: '用户记忆', target,
    available: user?.available === true, nested: false, serviceAnchor: false,
    stats: user?.stats, entries: user?.entries ?? [],
  }, ...(data.scopes.projects ?? []).map(ws => {
    const target: SaveTarget = { scope: 'project', workspace: ws.root }
    return {
      key: scopeKey(target), label: ws.name || ws.root, target,
      available: true, nested: ws.nested === true, serviceAnchor: ws.serviceAnchor,
      stats: ws.stats, entries: ws.entries,
    }
  })]
}

export function entriesOf(scopes: ScopeView[]): EntryView[] {
  const seen = new Set<string>()
  return scopes.flatMap(scope => scope.entries.flatMap((entry, index) => {
    // An unparseable index row has no file identity. Keep it visible, but never
    // invent an id from its title or allow a read/write against it.
    const id = entry.id === undefined ? undefined : normalizeId(entry.id)
    const key = id === undefined
      ? JSON.stringify([scope.key, 'index-row', index])
      : entryKey(scope.target, id)
    if (seen.has(key)) return []
    seen.add(key)
    return [{
      ...entry, id, key, target: scope.target, scopeLabel: scope.label,
      readOnly: !scope.available || scope.nested || id === undefined || !/^[a-zA-Z0-9\u4e00-\u9fff_-]+$/.test(id),
    }]
  }))
}

export function filterEntries(entries: EntryView[], scope: string, kind: MemoryKind | 'all', query: string): EntryView[] {
  const q = query.trim().toLocaleLowerCase()
  return entries.filter(entry => {
    if (scope !== 'all' && scopeKey(entry.target) !== scope) return false
    if (kind !== 'all' && (entry.kind ?? (entry.id === undefined ? undefined : 'memory')) !== kind) return false
    // Only search the current list snapshot; never fetch all bodies to search.
    return q === '' || [entry.title, entry.excerpt, entry.path, ...entry.tags]
      .some(value => value.toLocaleLowerCase().includes(q))
  })
}

export function countKinds(entries: PanelEntry[]): { all: number, memory: number, reference: number } {
  return {
    all: entries.length,
    // Legacy file entries without kind are memory. Malformed index rows without
    // an id/kind are not evidence of a memory file, and count only under "all".
    memory: entries.filter(entry => entry.kind === 'memory' || (entry.kind === undefined && entry.id !== undefined)).length,
    reference: entries.filter(entry => entry.kind === 'reference').length,
  }
}

export function draftOf(detail: MemoryDetail, target: SaveTarget): MemoryDraft {
  return {
    title: detail.title, content: detail.content, kind: detail.kind,
    tags: detail.tags.join(', '), path: detail.path, target: { ...target },
  }
}

export function validateDraft(draft: MemoryDraft): string[] {
  const errors: string[] = []
  const title = draft.title.trim()
  const content = draft.content.trim()
  if (title === '') errors.push('请填写标题。')
  if (title.length > 60) errors.push('标题超过 60 个字符；原文已保留，请缩短标题或在外部编辑。')
  if (content === '') errors.push('请填写正文。')
  if (content.length > 20_000) errors.push('正文超过 20000 个字符；原文已保留，请在外部编辑或明确缩短后保存。')
  if (draft.tags.split(',').map(tag => tag.trim()).filter(Boolean).length > 10) errors.push('标签最多 10 个，请减少标签后保存。')
  if (draft.target.scope === 'project' && !draft.target.workspace) errors.push('请选择已登记的目标项目。')
  return errors
}

/** Exact comparison protects unfinished typing, including whitespace edits. */
export function dirtyDraft(draft: MemoryDraft, original: MemoryDraft): boolean {
  return draft.title !== original.title || draft.content !== original.content
    || draft.kind !== original.kind || draft.tags !== original.tags || draft.path !== original.path
    || scopeKey(draft.target) !== scopeKey(original.target)
}
