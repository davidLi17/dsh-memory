import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const bundle = await readFile(new URL('../client/client.js', import.meta.url), 'utf8')
const stats = { entries: 2, maxEntries: 200, indexBytes: 100, maxBytes: 25000, memoryFiles: 2, maxMemories: 500 }
const row = id => ({ id: `${id}.md`, title: `Record ${id}`, excerpt: `Summary ${id}`, path: '', tags: [], date: '2026-10-25', kind: 'memory' })
const list = { scopes: { user: { available: true, stats, entries: [row('A'), row('B')] }, projects: [] } }
const detail = id => ({ ok: true, id, title: `Record ${id}`, content: `Body ${id}`, kind: 'memory', path: '', tags: [] })
const response = value => new Response(JSON.stringify(value), { status: 200 })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const content = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(content).join('') : node?.children ? content(node.children) : node?.props?.children ? content(node.props.children) : ''

async function harness() {
  const requests = []
  let confirmResult = true
  let handler = async (url, options) => response(url.endsWith('/list') ? list : detail(JSON.parse(options.body).id))
  let plugin
  const window = { __ModuleLoader__: { load({ factory }) { plugin = factory(name => { assert.equal(name, 'react'); return React }) } }, confirm: () => confirmResult, addEventListener() {}, removeEventListener() {} }
  vm.runInNewContext(bundle, { window, console, AbortController, fetch: (url, options) => { requests.push({ url, options }); return handler(url, options) } })
  const registrations = []
  plugin.apply({ slots: { inject(_name, cb) { return cb() }, register(options, render) { registrations.push({ options, render }); return () => {} } } })
  let renderer
  const render = async (mode = 'main') => { await act(async () => { renderer = TestRenderer.create(registrations.find(item => item.options.name === mode).render({})) }) }
  await render()
  return {
    registrations, requests, render,
    set handler(value) { handler = value },
    set confirm(value) { confirmResult = value },
    get root() { return renderer.root },
    get text() { return content(renderer.toJSON()) },
    button(label) { return renderer.root.findAllByType('button').find(node => content(node.props.children) === label) },
    async click(label) { const button = this.button(label); assert.ok(button, `missing button ${label}`); await act(async () => { button.props.onClick() }) },
    async select(id) { const button = renderer.root.findAllByType('button').find(node => node.props.className === 'dsh-memory-entry' && content(node.props.children).includes(`Record ${id}`)); assert.ok(button); await act(async () => { button.props.onClick() }) },
    async editTitle(value) { const input = renderer.root.findAllByType('input').find(node => node.props.placeholder === '简短、可辨认的标题'); assert.ok(input); await act(async () => { input.props.onChange({ target: { value } }) }) },
    async editContent(value) { await act(async () => { renderer.root.findByType('textarea').props.onChange({ target: { value } }) }) },
    async submit() { await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }) }) },
    async unmount() { await act(async () => { renderer.unmount() }) },
  }
}

test('client mounts full page and settings through optional slots without eager body reads', async () => {
  const app = await harness()
  assert.deepEqual(app.registrations.map(item => item.options.name), ['settings.section', 'main', 'sidebar.panellist'])
  assert.equal(app.requests.length, 1)
  assert.ok(app.requests[0].url.endsWith('/list'))
  assert.equal(app.registrations[1].options.key, app.registrations[2].options.id)
  await app.unmount()
})

test('slow refresh cannot override a newer new-record draft or selection', async () => {
  const app = await harness()
  await app.select('A')
  const pending = deferred()
  app.handler = async (url, options) => url.endsWith('/list') ? pending.promise : response(detail(JSON.parse(options.body).id))
  await app.click('刷新')
  await app.click('新增记录')
  await app.editTitle('Do not lose this draft')
  await app.editContent('Unsaved body')
  await act(async () => { pending.resolve(response(list)) })
  assert.equal(app.root.findByType('textarea').props.value, 'Unsaved body')
  assert.ok(app.text.includes('新记录'))
  assert.equal(app.requests.filter(request => request.url.endsWith('/read')).length, 1, 'refresh never re-reads old A over a new draft')
  await app.unmount()
})

test('late read response cannot overwrite a newer selected record even if transport ignores abort', async () => {
  const app = await harness()
  const a = deferred()
  app.handler = async (url, options) => JSON.parse(options.body).id === 'A' ? a.promise : response(detail('B'))
  await app.select('A')
  await app.select('B')
  await act(async () => { a.resolve(response(detail('A'))) })
  assert.ok(app.text.includes('Body B'))
  assert.ok(!app.text.includes('Body A'))
  assert.equal(app.requests.find(request => request.url.endsWith('/read')).options.signal.aborted, true)
  await app.unmount()
})

test('failed save preserves draft and releases loading after cancelling an older list request', async () => {
  const app = await harness()
  await app.select('A')
  const pending = deferred()
  app.handler = async (url, options) => url.endsWith('/list') ? pending.promise : response(detail(JSON.parse(options.body).id))
  await app.click('刷新')
  await app.click('新增记录')
  await app.editTitle('New draft')
  await app.editContent('Keep full draft on error')
  app.handler = async () => new Response(JSON.stringify({ ok: false, error: 'write rejected' }), { status: 400 })
  await app.submit()
  assert.equal(app.root.findByType('textarea').props.value, 'Keep full draft on error')
  assert.ok(app.text.includes('保存失败'))
  assert.equal(app.button('刷新').props.disabled, false)
  await act(async () => { pending.resolve(response(list)) })
  assert.equal(app.root.findByType('textarea').props.value, 'Keep full draft on error')
  await app.unmount()
})

test('dirty navigation cancellation and remount preserve the same entry draft; explicit cancel clears it', async () => {
  const app = await harness()
  await app.select('A')
  await app.click('编辑 / 移动')
  await app.editContent('Draft A, not B')
  app.confirm = false
  await app.select('B')
  assert.equal(app.root.findByType('textarea').props.value, 'Draft A, not B')
  await app.unmount()
  await app.render()
  assert.equal(app.root.findByType('textarea').props.value, 'Draft A, not B')
  assert.ok(app.text.includes('Record A'))
  assert.ok(app.text.includes('已恢复本页'))
  app.confirm = true
  await app.click('取消')
  await app.unmount()
  await app.render()
  assert.equal(app.root.findAllByType('textarea').length, 0)
  await app.unmount()
})

test('pending save survives SPA unmount without allowing a duplicate; success clears cached draft', async () => {
  const app = await harness()
  await app.click('新增记录')
  await app.editTitle('Pending')
  await app.editContent('Body pending')
  const pending = deferred()
  app.handler = async url => url.endsWith('/save') ? pending.promise : response(list)
  let submission
  await act(async () => { submission = app.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
  await app.unmount()
  await app.render()
  assert.equal(app.button('正在保存…').props.disabled, true)
  await act(async () => { pending.resolve(response({ ok: true, id: 'new', scope: 'user' })); await submission })
  assert.equal(app.root.findAllByType('textarea').length, 0)
  assert.equal(app.requests.filter(request => request.url.endsWith('/save')).length, 1)
  assert.ok(app.text.includes('保存已完成'))
  await app.unmount()
})

test('nested entries show read-only summaries; oversized files are fully visible and cannot enter edit', async () => {
  const app = await harness()
  const nested = { root: '/project/nested', name: 'Nested', nested: true, serviceAnchor: false, stats, entries: [row('N')] }
  app.handler = async url => response(url.endsWith('/list') ? { scopes: { ...list.scopes, projects: [nested] } } : { ...detail('A'), content: 'x'.repeat(20001) })
  await app.click('刷新')
  await app.select('N')
  assert.equal(app.requests.filter(request => request.url.endsWith('/read')).length, 0)
  assert.ok(app.text.includes('只显示索引摘要'))
  await app.select('A')
  assert.ok(app.text.includes('x'.repeat(20001)))
  assert.equal(app.button('编辑 / 移动').props.disabled, true)
  await app.unmount()
})

test('a save that fails while unmounted restores the full draft and permits retry', async () => {
  const app = await harness()
  await app.click('新增记录')
  await app.editTitle('Pending failure')
  await app.editContent('Preserve across failed request and navigation')
  const pending = deferred()
  app.handler = async url => url.endsWith('/save') ? pending.promise : response(list)
  let submission
  await act(async () => { submission = app.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
  await app.unmount()
  await app.render()
  await act(async () => { pending.resolve(new Response(JSON.stringify({ ok: false, error: 'disk full' }), { status: 500 })); await submission })
  assert.equal(app.root.findByType('textarea').props.value, 'Preserve across failed request and navigation')
  assert.ok(app.text.includes('disk full'))
  assert.equal(app.button('保存记录').props.disabled, false)
  await app.unmount()
})

test('settings and full-page draft caches never mix even when file ids match', async () => {
  const app = await harness()
  await app.select('A')
  await app.click('编辑 / 移动')
  await app.editContent('Page A draft')
  await app.unmount()
  await app.render('settings.section')
  assert.equal(app.root.findAllByType('textarea').length, 0)
  await app.select('B')
  await app.click('编辑 / 移动')
  await app.editContent('Settings B draft')
  await app.unmount()
  await app.render('main')
  assert.equal(app.root.findByType('textarea').props.value, 'Page A draft')
  await app.unmount()
  await app.render('settings.section')
  assert.equal(app.root.findByType('textarea').props.value, 'Settings B draft')
  await app.unmount()
})

test('successful create refreshes the list and reads only the returned record identity', async () => {
  const app = await harness()
  await app.click('新增记录')
  await app.editTitle('Created record')
  await app.editContent('Saved content')
  let saved = false
  app.handler = async (url, options) => {
    if (url.endsWith('/save')) { saved = true; return response({ ok: true, id: 'Created', scope: 'user' }) }
    if (url.endsWith('/list')) return response({ scopes: { user: { available: true, stats, entries: [...list.scopes.user.entries, row('Created')] } } })
    assert.equal(JSON.parse(options.body).id, 'Created')
    return response({ ...detail('Created'), content: 'Saved content' })
  }
  await app.submit()
  assert.equal(saved, true)
  assert.equal(app.root.findAllByType('textarea').length, 0)
  assert.ok(app.text.includes('Saved content'))
  assert.equal(app.requests.filter(request => request.url.endsWith('/read')).length, 1)
  await app.unmount()
})

test('delete cancellation makes no request, and valid ids remain deletable when their body format is invalid', async () => {
  const app = await harness()
  app.handler = async url => url.endsWith('/read') ? new Response(JSON.stringify({ ok: false, error: 'unrecognized memory file format' }), { status: 422 }) : response({ ok: true })
  await app.select('A')
  assert.equal(app.button('编辑 / 移动').props.disabled, true)
  assert.equal(app.button('删除').props.disabled, false)
  app.confirm = false
  await app.click('删除')
  assert.equal(app.requests.filter(request => request.url.endsWith('/delete')).length, 0)
  app.confirm = true
  app.handler = async url => response(url.endsWith('/list') ? { scopes: { user: { available: true, stats, entries: [row('B')] } } } : { ok: true, deleted: 'A' })
  await app.click('删除')
  assert.equal(app.requests.filter(request => request.url.endsWith('/delete')).length, 1)
  assert.ok(app.text.includes('此操作无法撤销'))
  assert.ok(!app.text.includes('Record A'))
  await app.unmount()
})
