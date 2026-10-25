import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const modelSource = stripTypeScriptTypes(await readFile(new URL('../src/client/model.ts', import.meta.url), 'utf8'))
const modelUrl = `data:text/javascript;base64,${Buffer.from(modelSource).toString('base64')}`
const model = await import(modelUrl)
const apiSource = stripTypeScriptTypes(await readFile(new URL('../src/client/api.ts', import.meta.url), 'utf8')).replace("'./model.js'", JSON.stringify(modelUrl))
const { memoryApi } = await import(`data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`)

const stats = { entries: 3, maxEntries: 200, indexBytes: 100, maxBytes: 10000, memoryFiles: 99, maxMemories: 500 }
const entry = (id, kind = 'memory', title = 'Title') => ({ id, kind, title, date: '2026-10-25', path: 'src/ui', tags: ['React'], excerpt: 'Summary only' })
const user = { scope: 'user' }
const project = { scope: 'project', workspace: '/project' }
const detail = { ok: true, id: 'same', title: 'Full file title', content: 'Full file body\n', path: 'folder', tags: ['one', 'two'], kind: 'reference' }
const draft = () => model.draftOf(detail, user)

test('client identities include scope/workspace and normalize only the supported .md suffix', () => {
  assert.equal(model.normalizeId('same.md'), 'same')
  assert.equal(model.normalizeId('same.MD'), 'same.MD')
  assert.equal(model.entryKey(user, 'same.md'), model.entryKey(user, 'same'))
  assert.notEqual(model.entryKey(user, 'same'), model.entryKey(project, 'same'))
  assert.notEqual(model.entryKey(project, 'same'), model.entryKey({ scope: 'project', workspace: '/another' }, 'same'))
  assert.notEqual(model.entryKey({ scope: 'project', workspace: '/a:b' }, 'c'), model.entryKey({ scope: 'project', workspace: '/a' }, 'b:c'))
})

test('scopes retain anchor/nested semantics; read-only rows never acquire invented file identities', () => {
  const scopes = model.scopesOf({ scopes: { user: { available: true, entries: [entry('same.md'), entry('same')] }, projects: [
    { root: '/project', name: 'My project', serviceAnchor: true, stats, entries: [entry('same', 'reference')] },
    { root: '/project/nested', name: 'nested', nested: true, serviceAnchor: false, stats, entries: [entry('same'), { title: 'Bad row', date: '', path: '', tags: [], excerpt: '' }] },
  ] } })
  const entries = model.entriesOf(scopes)
  assert.equal(entries.length, 4, 'same file suffix aliases deduplicate only within one scope')
  assert.equal(scopes[1].label, 'My project')
  assert.equal(scopes[1].serviceAnchor, true)
  assert.equal(scopes[2].nested, true)
  assert.equal(entries[0].readOnly, false)
  assert.equal(entries[2].readOnly, true)
  assert.equal(entries[3].id, undefined)
  assert.equal(entries[3].readOnly, true)
  assert.equal(new Set(entries.map(row => row.key)).size, entries.length)
  assert.equal(model.scopesOf({ scopes: {} })[0].available, false)
})

test('kind counts come from entry purposes, never index lines or memoryFiles', () => {
  const rows = [entry('memory'), entry('reference', 'reference'), { ...entry('legacy'), kind: undefined }, { title: 'Bad index row' }]
  assert.deepEqual(model.countKinds(rows), { all: 4, memory: 2, reference: 1 })
  const scopes = model.scopesOf({ scopes: { user: { available: true, stats, entries: rows } } })
  assert.deepEqual(model.countKinds(scopes[0].entries), { all: 4, memory: 2, reference: 1 })
})

test('scope, kind, and index-only search filters remain independent', () => {
  const entries = model.entriesOf(model.scopesOf({ scopes: { user: { available: true, entries: [entry('one'), entry('two', 'reference')] }, projects: [{ root: '/project', name: 'Project', serviceAnchor: false, stats, entries: [entry('three', 'memory', 'Other')] }] } }))
  assert.equal(model.filterEntries(entries, 'all', 'reference', 'react').length, 1)
  assert.equal(model.filterEntries(entries, model.scopeKey(project), 'all', 'summary').length, 1)
  assert.equal(model.filterEntries(entries, model.scopeKey(user), 'memory', ' SRC/UI ').length, 1)
  assert.equal(model.filterEntries(entries, 'all', 'all', 'missing body').length, 0)
  assert.deepEqual(model.countKinds(model.filterEntries(entries, model.scopeKey(user), 'all', '')), { all: 2, memory: 1, reference: 1 })
})

test('drafts retain authoritative full detail and use exact dirty detection', () => {
  const original = draft()
  assert.equal(original.content, detail.content)
  assert.equal(original.title, detail.title)
  assert.equal(original.tags, 'one, two')
  assert.equal(original.kind, 'reference')
  assert.equal(model.dirtyDraft(original, draft()), false)
  for (const change of [{ content: `${detail.content} ` }, { title: 'Changed' }, { tags: 'two, one' }, { path: '' }, { kind: 'memory' }, { target: project }]) {
    assert.equal(model.dirtyDraft({ ...original, ...change }, original), true)
  }
})

test('validation protects the complete original text instead of truncating at server caps', () => {
  const boundary = { ...draft(), title: 'a'.repeat(60), content: 'b'.repeat(20_000) }
  assert.deepEqual(model.validateDraft(boundary), [])
  const long = { ...boundary, title: 'a'.repeat(61), content: 'b'.repeat(20_001) }
  assert.equal(model.validateDraft(long).length, 2)
  assert.equal(long.title.length, 61)
  assert.equal(long.content.length, 20_001)
  assert.equal(model.validateDraft({ ...boundary, title: '😀'.repeat(31) }).length, 1, 'match UTF-16 server cap')
  assert.deepEqual(model.validateDraft({ ...boundary, title: ` ${boundary.title} `, content: ` ${boundary.content} ` }), [])
  assert.equal(model.validateDraft({ ...draft(), title: ' ', content: '\n' }).length, 2)
  assert.equal(model.validateDraft({ ...draft(), tags: Array(11).fill('tag').join(',') }).length, 1)
  assert.equal(model.validateDraft({ ...draft(), target: { scope: 'project' } }).length, 1)
})

test('API keeps GET list separate, normalizes identity, and sends original/target scopes on updates', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    return new Response(JSON.stringify(url.endsWith('/list') ? { scopes: {} } : url.endsWith('/read') ? detail : { ok: true, id: 'same', updated: 'same', scope: 'project' }), { status: 200 })
  })
  const controller = new AbortController()
  await memoryApi.list(controller.signal)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[0].options.credentials, 'same-origin')
  assert.equal(requests[0].options.signal, controller.signal)
  await memoryApi.read(project, 'same.md', controller.signal)
  assert.deepEqual(JSON.parse(requests[1].options.body), { ...project, id: 'same' })
  await memoryApi.save(draft())
  const created = JSON.parse(requests[2].options.body)
  assert.equal(created.content, detail.content)
  assert.equal(created.scope, 'user')
  assert.equal('workspace' in created, false)
  const updated = await memoryApi.update(user, 'same.md', { ...draft(), target: project, path: '' })
  assert.equal(updated.updated, 'same')
  assert.deepEqual(JSON.parse(requests[3].options.body), { scope: 'user', id: 'same', title: detail.title, content: detail.content, kind: 'reference', tags: ['one', 'two'], path: '', targetScope: 'project', targetWorkspace: '/project' })
  await memoryApi.delete(project, 'same.md')
  assert.equal(requests[4].url, '/dsh-memory/api/v1/delete')
  assert.equal(requests[4].options.method, 'POST')
})

test('API refuses oversized drafts before issuing a write and preserves draft bytes', async t => {
  let called = false
  t.mock.method(globalThis, 'fetch', async () => { called = true; throw new Error('Unexpected request') })
  const original = { ...draft(), content: 'x'.repeat(20_001) }
  await assert.rejects(memoryApi.save(original), /20000/)
  await assert.rejects(memoryApi.update(user, 'same', original), /20000/)
  assert.equal(called, false)
  assert.equal(original.content.length, 20_001)
})

test('API surfaces server/protocol errors and does not turn aborts into success', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ok: false, error: 'unknown workspace' }), { status: 400 }))
  await assert.rejects(memoryApi.read(project, 'same'), /unknown workspace/)
  globalThis.fetch = async () => new Response('Not JSON', { status: 502 })
  await assert.rejects(memoryApi.list(), /HTTP 502/)
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 200 })
  await assert.rejects(memoryApi.delete(user, 'same'), /HTTP 200/)
  await assert.rejects(memoryApi.list(), /列表格式无效/)
  globalThis.fetch = async () => new Response(JSON.stringify({ scopes: null }), { status: 200 })
  await assert.rejects(memoryApi.list(), /列表格式无效/)
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, id: 'same' }), { status: 200 })
  await assert.rejects(memoryApi.read(user, 'same'), /正文格式无效/)
  globalThis.fetch = async () => { throw new DOMException('Aborted', 'AbortError') }
  await assert.rejects(memoryApi.read(user, 'same'), { name: 'AbortError' })
})
