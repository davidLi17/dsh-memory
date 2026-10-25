import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactElement } from 'react'
import { memoryApi } from './api.js'
import { countKinds, dirtyDraft, draftOf, entriesOf, entryKey, filterEntries, normalizeId, scopeKey, scopesOf, validateDraft } from './model.js'
import type { EntryView, MemoryDetail, MemoryDraft, MemoryKind, PanelData, SaveTarget, ScopeView } from './model.js'
import { memoryStyles } from './styles.js'

const kindLabel = (kind?: MemoryKind): string => kind === 'reference' ? '历史资料' : '长期记忆'
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)
const cancelled = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError'
const button = (label: string, onClick: () => void, props: Record<string, unknown> = {}): ReactElement => h('button', { type: 'button', className: 'dsh-memory-button', onClick, ...props }, label)

type PanelMode = 'settings' | 'page'
interface DraftSnapshot {
  data: PanelData | null
  selected: EntryView | null
  detail: MemoryDetail | null
  draft: MemoryDraft
  original: MemoryDraft
  creating: boolean
  scope: string
  kind: MemoryKind | 'all'
  query: string
  pending?: Promise<void>
  error?: string
}
// Session-memory only, isolated by entry point. No file, localStorage or database
// writes; host SPA navigation may unmount either panel without beforeunload.
const suspendedDrafts = new Map<PanelMode, DraftSnapshot>()

export function MemoryPanel({ mode = 'settings' }: { mode?: PanelMode }): ReactElement {
  const [recovered] = useState(() => suspendedDrafts.get(mode))
  const [data, setData] = useState<PanelData | null>(recovered?.data ?? null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [scope, setScope] = useState(recovered?.scope ?? 'all')
  const [kind, setKind] = useState<MemoryKind | 'all'>(recovered?.kind ?? 'all')
  const [query, setQuery] = useState(recovered?.query ?? '')
  const [selected, setSelected] = useState<EntryView | null>(recovered?.selected ?? null)
  const [detail, setDetail] = useState<MemoryDetail | null>(recovered?.detail ?? null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [draft, setDraft] = useState<MemoryDraft | null>(recovered?.draft ?? null)
  const [original, setOriginal] = useState<MemoryDraft | null>(recovered?.original ?? null)
  const [editing, setEditing] = useState(recovered !== undefined)
  const [creating, setCreating] = useState(recovered?.creating ?? false)
  const [busy, setBusy] = useState(recovered?.pending !== undefined)
  const [formError, setFormError] = useState<string | null>(recovered?.error ?? null)
  const [notice, setNotice] = useState<string | null>(recovered === undefined ? null : '已恢复本页尚未提交的草稿。刷新浏览器后不会保留。')
  const listRequest = useRef<{ generation: number, controller?: AbortController }>({ generation: 0 })
  const readRequest = useRef<{ generation: number, controller?: AbortController }>({ generation: 0 })
  const alive = useRef(true)
  const busyRef = useRef(recovered?.pending !== undefined)
  const focusList = useRef(false)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)

  const loadList = useCallback(async (): Promise<PanelData | null> => {
    listRequest.current.controller?.abort()
    const controller = new AbortController()
    const generation = ++listRequest.current.generation
    listRequest.current.controller = controller
    setListLoading(true)
    setListError(null)
    try {
      const next = await memoryApi.list(controller.signal)
      if (!alive.current || generation !== listRequest.current.generation) return null
      setData(next)
      return next
    } catch (error) {
      if (alive.current && generation === listRequest.current.generation && !cancelled(error)) setListError(errorText(error))
      return null
    } finally {
      if (alive.current && generation === listRequest.current.generation) setListLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void loadList()
    return () => {
      alive.current = false
      ++listRequest.current.generation
      ++readRequest.current.generation
      listRequest.current.controller?.abort()
      readRequest.current.controller?.abort()
    }
  }, [loadList])

  const dirty = editing && draft !== null && original !== null && dirtyDraft(draft, original)
  useEffect(() => {
    if (busy) return
    if (dirty && draft !== null && original !== null) {
      suspendedDrafts.set(mode, { data, selected, detail, draft, original, creating, scope, kind, query, error: formError ?? undefined })
    } else suspendedDrafts.delete(mode)
  }, [mode, data, dirty, busy, selected, detail, draft, original, creating, scope, kind, query, formError])
  useEffect(() => {
    if (recovered?.pending === undefined) return
    void recovered.pending.then(() => {
      if (!alive.current) return
      busyRef.current = false
      setBusy(false)
      if (suspendedDrafts.get(mode) === recovered) setFormError(recovered.error ?? '上次保存未完成，草稿已保留。请核对后重试。')
      else { resetDetail(); setNotice('离开页面期间保存已完成，列表已刷新。'); void loadList() }
    })
  }, [mode, recovered, loadList])
  useEffect(() => {
    if (focusList.current && selected === null && !creating) {
      focusList.current = false
      searchInput.current?.focus()
    }
  }, [selected, creating])
  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])
  useEffect(() => {
    if (editing) titleInput.current?.focus()
    else if (selected !== null) detailHeading.current?.focus()
  }, [editing, selected?.key])

  const scopes = data === null ? [] : scopesOf(data)
  const entries = entriesOf(scopes)
  const counts = countKinds(entries)
  const scopedEntries = filterEntries(entries, scope, 'all', '')
  const categoryCounts = countKinds(scopedEntries)
  const visible = filterEntries(entries, scope, kind, query)
  const activeScope = scopes.find(item => item.key === scope)
  const targets = scopes.filter(item => item.available && !item.nested)
  const defaultTarget = activeScope !== undefined ? activeScope : targets.find(item => item.target.scope === 'user') ?? targets[0]
  const canCreate = defaultTarget !== undefined && defaultTarget.available && !defaultTarget.nested
  const hasDetail = selected !== null || creating

  function mayLeave(): boolean {
    if (busyRef.current) return false
    return !dirty || window.confirm('有尚未保存的修改。放弃草稿并继续？')
  }

  function resetDetail(): void {
    readRequest.current.controller?.abort()
    ++readRequest.current.generation
    setSelected(null)
    setDetail(null)
    setDetailLoading(false)
    setDetailError(null)
    setDraft(null)
    setOriginal(null)
    setEditing(false)
    setCreating(false)
    setFormError(null)
  }

  async function readEntry(entry: EntryView): Promise<void> {
    readRequest.current.controller?.abort()
    const generation = ++readRequest.current.generation
    setSelected(entry)
    setCreating(false)
    setEditing(false)
    setDraft(null)
    setOriginal(null)
    setDetail(null)
    setDetailError(null)
    setFormError(null)
    if (entry.readOnly || entry.id === undefined) { setDetailLoading(false); return }
    const controller = new AbortController()
    readRequest.current.controller = controller
    setDetailLoading(true)
    try {
      const next = await memoryApi.read(entry.target, entry.id, controller.signal)
      if (!alive.current || generation !== readRequest.current.generation) return
      setDetail(next)
    } catch (error) {
      if (alive.current && generation === readRequest.current.generation && !cancelled(error)) setDetailError(errorText(error))
    } finally {
      if (alive.current && generation === readRequest.current.generation) setDetailLoading(false)
    }
  }

  function chooseEntry(entry: EntryView): void {
    if (selected?.key === entry.key && !creating) return
    if (!mayLeave()) return
    setNotice(null)
    void readEntry(entry)
  }

  function chooseScope(next: string): void {
    if (next === scope || !mayLeave()) return
    resetDetail()
    setScope(next)
    setNotice(null)
  }

  function beginCreate(): void {
    if (!canCreate || !mayLeave()) return
    resetDetail()
    const empty: MemoryDraft = { title: '', content: '', tags: '', path: '', kind: kind === 'reference' ? 'reference' : 'memory', target: defaultTarget.target }
    setDraft(empty)
    setOriginal(empty)
    setCreating(true)
    setEditing(true)
    setNotice(null)
  }

  function beginEdit(): void {
    if (selected === null || detail === null || busyRef.current) return
    const next = draftOf(detail, selected.target)
    setDraft(next)
    setOriginal(next)
    setEditing(true)
    setFormError(null)
    setNotice(null)
  }

  function cancelEdit(): void {
    if (!mayLeave()) return
    if (creating) resetDetail()
    else { setEditing(false); setDraft(null); setOriginal(null); setFormError(null); detailHeading.current?.focus() }
  }

  function goBack(): void {
    if (!mayLeave()) return
    focusList.current = true
    resetDetail()
  }

  async function refresh(): Promise<void> {
    if (!mayLeave()) return
    const previous = selected
    resetDetail()
    const selectionGeneration = readRequest.current.generation
    setNotice(null)
    const next = await loadList()
    // A newer selection, scope switch or draft owns the detail pane now.
    if (next !== null && previous !== null && selectionGeneration === readRequest.current.generation) {
      const updated = entriesOf(scopesOf(next)).find(entry => entry.key === previous.key)
      if (updated !== undefined) await readEntry(updated)
      else setNotice('该条目已不在最新列表中，可能已被外部修改或删除。')
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (draft === null || busyRef.current) return
    const errors = validateDraft(draft)
    if (errors.length > 0) { setFormError(errors.join(' ')); return }
    const target = targets.find(item => scopeKey(item.target) === scopeKey(draft.target))
    if (target === undefined) { setFormError('请选择当前可写的用户或已登记项目范围。'); return }
    const savedDraft = draft
    const source = selected
    let finishPending: () => void = () => {}
    const pending = new Promise<void>(resolve => { finishPending = resolve })
    const savedSnapshot: DraftSnapshot = { data, selected, detail, draft, original: original!, creating, scope, kind, query, pending }
    suspendedDrafts.set(mode, savedSnapshot)
    busyRef.current = true
    setBusy(true)
    setFormError(null)
    // Older refresh/detail responses must never replace a successful mutation.
    listRequest.current.controller?.abort()
    ++listRequest.current.generation
    setListLoading(false)
    readRequest.current.controller?.abort()
    ++readRequest.current.generation
    try {
      const result = creating
        ? await memoryApi.save(savedDraft)
        : await memoryApi.update(source!.target, source!.id!, savedDraft)
      if (suspendedDrafts.get(mode) === savedSnapshot) suspendedDrafts.delete(mode)
      if (!alive.current) return
      setEditing(false)
      setCreating(false)
      setDraft(null)
      setOriginal(null)
      const id = typeof result.id === 'string' ? result.id : typeof result.updated === 'string' ? result.updated : source?.id
      const savedTarget: SaveTarget = savedDraft.target
      setScope(scopeKey(savedTarget))
      setKind('all')
      setQuery('')
      setNotice('已保存。内容以文件为准；其他窗口的修改不会自动合并。')
      const next = await loadList()
      if (!alive.current) return
      if (id !== undefined) {
        const found = next === null ? undefined : entriesOf(scopesOf(next)).find(entry => entry.key === entryKey(savedTarget, id))
        const fallback: EntryView = { key: entryKey(savedTarget, id), target: savedTarget, scopeLabel: target.label, readOnly: false, id: normalizeId(id), title: savedDraft.title, date: '', excerpt: '', path: savedDraft.path, tags: savedDraft.tags.split(',').map(tag => tag.trim()).filter(Boolean), kind: savedDraft.kind }
        await readEntry(found ?? fallback)
      } else resetDetail()
    } catch (error) {
      savedSnapshot.error = `保存失败：${errorText(error)}。草稿已保留，可修改后重试。`
      if (alive.current) setFormError(savedSnapshot.error)
    } finally {
      delete savedSnapshot.pending
      finishPending()
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  async function deleteEntry(): Promise<void> {
    if (selected === null || selected.readOnly || selected.id === undefined || busyRef.current) return
    if (!window.confirm(`永久删除「${detail?.title ?? selected.title}」？\n此操作没有撤销或自动恢复，文件和索引记录将被删除。`)) return
    const entry = selected
    busyRef.current = true
    setBusy(true)
    setFormError(null)
    try {
      await memoryApi.delete(entry.target, entry.id!)
      if (!alive.current) return
      resetDetail()
      setNotice('已删除。此操作无法撤销。')
      await loadList()
      searchInput.current?.focus()
    } catch (error) {
      if (alive.current) setFormError(`删除失败：${errorText(error)}`)
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  const title = creating ? '新增记录' : detail?.title ?? selected?.title ?? ''
  const limits = detail === null || selected === null ? [] : validateDraft(draftOf(detail, selected.target))
  const readOnly = selected?.readOnly === true
  const status = (text: string, isError = false): ReactElement => h('div', { className: `dsh-memory-notice${isError ? ' dsh-memory-error' : ''}`, role: isError ? 'alert' : 'status' }, text)

  return h('section', { className: `dsh-memory dsh-memory-${mode}`, 'aria-label': '记忆管理' },
    h('style', null, memoryStyles),
    h('header', { className: 'dsh-memory-header' },
      h('div', null, h('h1', { className: 'dsh-memory-heading' }, '记忆管理'), h('p', { className: 'dsh-memory-subtitle' }, '跨项目偏好、项目决定与历史资料，在一处清晰管理。')),
      h('div', { className: 'dsh-memory-actions' },
        button(listLoading ? '刷新中…' : '刷新', () => { void refresh() }, { disabled: busy || listLoading, 'aria-label': '刷新记忆列表' }),
        button('新增记录', beginCreate, { disabled: busy || !canCreate, className: 'dsh-memory-button dsh-memory-primary' }))),
    h('div', { className: 'dsh-memory-overview', 'aria-label': '全部范围总览' },
      h(Stat, { label: '长期记忆', value: data === null ? '—' : counts.memory }),
      h(Stat, { label: '历史资料', value: data === null ? '—' : counts.reference }),
      h(Stat, { label: '项目范围', value: data === null ? '—' : scopes.filter(item => item.target.scope === 'project').length })),
    notice !== null ? status(notice) : null,
    listError !== null ? h('div', { className: 'dsh-memory-notice dsh-memory-error', role: 'alert' },
      h('p', null, `无法加载最新列表：${listError}${data !== null ? '。下方保留上次成功加载的列表。' : '。请确认宿主已启用记忆服务。'}`),
      button('重试加载', () => { void loadList() }, { disabled: busy || listLoading })) : null,
    data === null ? h('div', { className: 'dsh-memory-card dsh-memory-empty', role: 'status' }, listLoading ? '正在加载记忆索引…' : '记忆服务暂不可用') :
      h('div', { className: `dsh-memory-workbench${hasDetail ? ' dsh-memory-has-detail' : ''}` },
        h('nav', { className: 'dsh-memory-card dsh-memory-nav', 'aria-label': '记忆范围' },
          h('p', { className: 'dsh-memory-eyebrow' }, '范围'),
          h('div', { className: 'dsh-memory-scope-list' },
            h(ScopeButton, { label: '全部范围', count: counts.all, active: scope === 'all', disabled: busy, onClick: () => chooseScope('all') }),
            scopes.filter(item => item.target.scope === 'user').map(item => h(ScopeButton, { key: item.key, label: item.label, note: item.available ? '跨项目偏好' : '暂不可用', count: entries.filter(entry => scopeKey(entry.target) === item.key).length, active: scope === item.key, disabled: busy, onClick: () => chooseScope(item.key) })),
            h('p', { className: 'dsh-memory-nav-group' }, '项目'),
            scopes.filter(item => item.target.scope === 'project').map(item => h(ScopeButton, { key: item.key, label: item.label, title: item.target.workspace, note: item.nested ? '嵌套范围 · 只读摘要' : item.serviceAnchor ? '服务启动目录' : undefined, count: entries.filter(entry => scopeKey(entry.target) === item.key).length, active: scope === item.key, disabled: busy, onClick: () => chooseScope(item.key) }))),
          activeScope?.stats !== undefined ? h('div', { className: 'dsh-memory-capacity' },
            h('strong', null, '此范围的索引与文件'),
            h('div', null, `索引行 ${activeScope.stats.entries} / ${activeScope.stats.maxEntries}`),
            h('div', null, `索引 ${(activeScope.stats.indexBytes / 1024).toFixed(1)} / ${(activeScope.stats.maxBytes / 1024).toFixed(0)} KB`),
            h('div', null, `文件 ${activeScope.stats.memoryFiles} / ${activeScope.stats.maxMemories}（含历史资料）`)) : null),
        h('section', { className: 'dsh-memory-card dsh-memory-list', 'aria-label': '记忆条目' },
          h('div', { className: 'dsh-memory-list-header' },
            h('div', { className: 'dsh-memory-list-title' }, h('h2', null, activeScope?.label ?? '全部记录'), h('span', { className: 'dsh-memory-muted' }, `${visible.length} 条`)),
            h('input', { ref: searchInput, className: 'dsh-memory-search', type: 'search', value: query, placeholder: '搜索标题、摘要、标签或路径', 'aria-label': '搜索记忆索引', onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value) }),
            h('p', { className: 'dsh-memory-search-hint' }, '仅搜索列表中的索引信息，不搜索完整正文'),
            h('div', { className: 'dsh-memory-filters', 'aria-label': '记忆用途' },
              (['all', 'memory', 'reference'] as const).map(value => h('button', { key: value, type: 'button', className: 'dsh-memory-filter', 'aria-pressed': kind === value, onClick: () => setKind(value) }, `${value === 'all' ? '全部' : kindLabel(value)} ${categoryCounts[value]}`)))),
          visible.length === 0 ? h('div', { className: 'dsh-memory-empty' },
            h('strong', null, activeScope?.available === false ? '此范围暂不可用' : scopedEntries.length === 0 ? '这里还没有记录' : '没有符合筛选的记录'),
            h('p', null, scopedEntries.length === 0 ? '新增一条偏好或决定，之后随时查阅。' : '试试其他关键词或切换用途筛选。')) :
            h('ul', { className: 'dsh-memory-entries' }, visible.map(entry => h('li', { key: entry.key },
              h('button', { type: 'button', className: 'dsh-memory-entry', 'aria-current': selected?.key === entry.key, disabled: busy, onClick: () => chooseEntry(entry) },
                h('div', { className: 'dsh-memory-entry-title' }, entry.title),
                h('div', { className: 'dsh-memory-excerpt' }, entry.excerpt || '暂无摘要'),
                h('div', { className: 'dsh-memory-entry-meta' }, h('span', { className: `dsh-memory-badge${entry.kind === 'reference' ? ' dsh-memory-reference' : ''}` }, kindLabel(entry.kind)),
                  entry.unindexed ? h('span', { className: 'dsh-memory-badge' }, '未索引') : null,
                  entry.readOnly ? h('span', { className: 'dsh-memory-badge' }, '只读') : null,
                  ...entry.tags.map((tag, index) => h('span', { key: `${tag}:${index}` }, `#${tag}`))),
                h('span', { className: 'dsh-memory-entry-path', title: [entry.scopeLabel, entry.path].filter(Boolean).join(' / ') }, [entry.scopeLabel, entry.path].filter(Boolean).join(' / '))))))),
        h('section', { className: 'dsh-memory-card dsh-memory-detail', 'aria-label': '记录详情', 'aria-busy': detailLoading || busy },
          !hasDetail ? h('div', { className: 'dsh-memory-empty' },  h('strong', null, '选择一条记录'), h('p', null, '按需读取完整正文，再编辑、移动或修改用途。'), h('p', { className: 'dsh-memory-muted' }, '历史资料不会进入常驻记忆索引。')) :
            h('div', null,
              h('div', { className: 'dsh-memory-detail-head' },
                h('div', { className: 'dsh-memory-detail-topline' }, button('返回列表', goBack, { className: 'dsh-memory-button dsh-memory-back', disabled: busy }), h('span', { className: 'dsh-memory-badge' }, editing ? creating ? '新记录' : '正在编辑' : kindLabel(detail?.kind ?? selected?.kind))),
                h('h2', { className: 'dsh-memory-detail-title', ref: detailHeading, tabIndex: -1 }, title),
                selected !== null ? h('div', { className: 'dsh-memory-detail-meta' }, h('span', null, selected.scopeLabel), selected.date ? h('span', null, `索引日期 ${selected.date}`) : null, selected.unindexed ? h('span', null, '未索引') : null) : null,
                !editing && selected !== null && !readOnly ? h('div', { className: 'dsh-memory-actions dsh-memory-detail-actions' }, button('编辑 / 移动', beginEdit, { disabled: busy || detail === null || limits.length > 0 }), button(busy ? '处理中…' : '删除', () => { void deleteEntry() }, { className: 'dsh-memory-button dsh-memory-danger', disabled: busy })) : null),
              h('div', { className: 'dsh-memory-detail-body' },
                formError !== null ? status(formError, true) : null,
                detailLoading ? h('p', { role: 'status', className: 'dsh-memory-muted' }, '正在读取完整正文…') : null,
                detailError !== null ? h('div', { role: 'alert' }, status(`无法读取正文：${detailError}`, true), button('重试读取', () => { if (selected !== null) void readEntry(selected) }, { disabled: busy })) : null,
                readOnly ? h('div', null, h('div', { className: 'dsh-memory-notice dsh-memory-warning' }, selected?.id === undefined || !/^[a-zA-Z0-9\u4e00-\u9fff_-]+$/.test(selected.id) ? '此索引行没有有效记录标识，只能查看摘要。请在原文件中核对。' : '此嵌套范围尚未登记为可操作项目。这里只显示索引摘要，不读取或修改原文件；可在 DSH 登记对应工作区后刷新。'), h('pre', { className: 'dsh-memory-content' }, selected?.excerpt), h('p', { className: 'dsh-memory-detail-path' }, selected?.target.workspace)) : null,
                !editing && detail !== null ? h('div', null,
                  limits.length > 0 ? h('div', { className: 'dsh-memory-notice dsh-memory-warning' }, `此文件超出页面编辑限制，完整原文仍保留。${limits.join(' ')} 请通过外部编辑器修改，页面不会截断内容。`) : null,
                  h('div', { className: 'dsh-memory-detail-meta' }, detail.tags.map((tag, index) => h('span', { key: `${tag}:${index}`, className: 'dsh-memory-badge' }, tag))),
                  h('p', { className: 'dsh-memory-detail-path' }, `${selected?.target.scope === 'user' ? '用户范围' : selected?.target.workspace ?? '项目范围'} · memories/${normalizeId(detail.id)}.md${detail.path ? ` · 路径标签：${detail.path}` : ''}`),
                  h('hr', { style: { border: 0, borderTop: '1px solid var(--dm-border)', margin: '16px 0' } }),
                  h('pre', { className: 'dsh-memory-content' }, detail.content)) : null,
                editing && draft !== null ? h(DraftForm, { draft, targets, busy, creating, titleRef: titleInput, onChange: setDraft, onSubmit: submit, onCancel: cancelEdit }) : null)))),
    h('p', { className: 'dsh-memory-footer-note' }, '本地文件 · 无数据迁移。总览按列表用途统计，不代表本会话注入量；服务启动目录不等同于当前会话工作区。'))
}

function Stat({ label, value }: { label: string, value: number | string }): ReactElement {
  return h('div', { className: 'dsh-memory-stat' }, h('div', null, h('p', { className: 'dsh-memory-stat-label' }, label), h('p', { className: 'dsh-memory-stat-value' }, value)))
}

function ScopeButton({ label, count, active, disabled, note, title, onClick }: { label: string, count: number, active: boolean, disabled: boolean, note?: string, title?: string, onClick: () => void }): ReactElement {
  return h('button', { type: 'button', className: 'dsh-memory-scope', 'aria-current': active, disabled, title, onClick }, h('span', { className: 'dsh-memory-scope-main' }, h('span', { className: 'dsh-memory-scope-label' }, label), note ? h('span', { className: 'dsh-memory-scope-note' }, note) : null), h('span', { className: 'dsh-memory-count' }, count))
}

function DraftForm({ draft, targets, busy, creating, titleRef, onChange, onSubmit, onCancel }: {
  draft: MemoryDraft, targets: ScopeView[], busy: boolean, creating: boolean,
  titleRef: React.RefObject<HTMLInputElement>, onChange: (draft: MemoryDraft) => void, onSubmit: (event: FormEvent) => void, onCancel: () => void,
}): ReactElement {
  const errors = validateDraft(draft)
  const update = (name: 'title' | 'content' | 'tags' | 'path') => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => onChange({ ...draft, [name]: event.target.value })
  return h('form', { className: 'dsh-memory-form', onSubmit },
    h('div', { className: 'dsh-memory-fields-row' },
      h('label', { className: 'dsh-memory-field' }, '所属范围', h('select', { value: scopeKey(draft.target), disabled: busy, onChange: (event: ChangeEvent<HTMLSelectElement>) => {
        const next = targets.find(item => item.key === event.target.value)
        if (next !== undefined) onChange({ ...draft, target: next.target, path: '' })
      } }, targets.map(item => h('option', { key: item.key, value: item.key }, item.target.scope === 'user' ? '用户 · 跨项目偏好' : `项目 · ${item.label}`)))),
      h('label', { className: 'dsh-memory-field' }, '用途', h('select', { value: draft.kind, disabled: busy, onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange({ ...draft, kind: event.target.value as MemoryKind }) }, h('option', { value: 'memory' }, '长期记忆'), h('option', { value: 'reference' }, '历史资料 · 按需检索')))),
    h('label', { className: 'dsh-memory-field' }, h('span', { className: 'dsh-memory-field-head' }, '标题', h('small', null, `${draft.title.trim().length} / 60`)), h('input', { ref: titleRef, value: draft.title, disabled: busy, required: true, onChange: update('title'), placeholder: '简短、可辨认的标题', 'aria-invalid': draft.title.trim().length > 60 })),
    h('label', { className: 'dsh-memory-field' }, h('span', { className: 'dsh-memory-field-head' }, '正文', h('small', null, `${draft.content.trim().length} / 20000`)), h('textarea', { value: draft.content, disabled: busy, required: true, onChange: update('content'), placeholder: '记录完整、独立可理解的内容…', 'aria-invalid': draft.content.trim().length > 20000 })),
    h('label', { className: 'dsh-memory-field' }, '标签', h('input', { value: draft.tags, disabled: busy, onChange: update('tags'), placeholder: '逗号分隔，最多 10 个' })),
    h('label', { className: 'dsh-memory-field' }, '路径标签', h('input', { value: draft.path, disabled: busy, onChange: update('path'), placeholder: '例如 frontend/src（可选）' }), h('small', null, '这是范围内的分类标签，不会改变记忆文件存放位置。切换范围时清空。')),
    h('p', { className: 'dsh-memory-muted' }, draft.kind === 'reference' ? '历史资料只按需检索，不进入常驻 MEMORY.md 索引。' : '长期记忆保留现有简短索引规则；不会把全文常驻注入。'),
    errors.length > 0 && (draft.title !== '' || draft.content !== '') ? h('div', { className: 'dsh-memory-notice dsh-memory-error', role: 'status' }, errors.join(' ')) : null,
    h('div', { className: 'dsh-memory-actions' }, h('button', { type: 'submit', className: 'dsh-memory-button dsh-memory-primary', disabled: busy || errors.length > 0 }, busy ? '正在保存…' : creating ? '保存记录' : '保存修改'), button('取消', onCancel, { disabled: busy })),
    h('p', { className: 'dsh-memory-muted' }, '保存会沿用现有文件与备份规则，不提供跨窗口冲突合并。'))
}
