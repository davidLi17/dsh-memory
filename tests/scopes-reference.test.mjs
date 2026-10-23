import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-purpose-'))
const anchor = path.join(tmp, 'anchor'), project = path.join(tmp, 'project')
for (const dir of [anchor, project]) await fs.mkdir(path.join(dir, '.git'), { recursive: true })
process.chdir(anchor)
process.env.DSH_MEMORY_USER_DIR = path.join(tmp, 'user')
const tools = [], sections = [], routes = []
const plugin = await import('../lib/index.js')
await plugin.apply({ tools: { register: t => tools.push(t) }, systemPrompt: { section: s => sections.push(s), getSectionOrder: () => 1 },
  get: name => name === 'workspaceRegistry' ? { list: async () => [{ path: anchor }, { path: project }] } : undefined,
  inject: (_, cb) => cb({ webServer: { register: r => routes.push(r) } }),
})
const exec = cwd => ({ signal: new AbortController().signal, agent: { session: { header: { cwd } } } })
const run = (name, args, cwd = project) => tools.find(t => t.name === name).execute(args, exec(cwd))
const prompt = cwd => sections[0].text({ agent: exec(cwd).agent })
async function post(route, body) {
  let status, data
  await routes.find(r => r.path.endsWith('/' + route)).handler({ async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }, { writeHead: s => { status = s }, end: s => { data = JSON.parse(s) } })
  return { status, data }
}

test('references remain searchable/readable/listed without entering prompt; omitted kind preserves purpose', async () => {
  const ref = await run('memory_save', { scope: 'project', kind: 'reference', title: 'Historical restore', content: 'Old restoration steps and session abc.' })
  assert.equal(ref.kind, 'reference')
  assert.ok(!prompt(project).includes('Historical restore'))
  const search = await run('memory_search', { query: 'restoration', kind: 'reference' })
  assert.equal(search.matches[0].kind, 'reference')
  assert.equal((await run('memory_read', { id: ref.id })).kind, 'reference')
  assert.ok((await run('memory_list', {})).project.references.some(r => r.id === ref.id))
  assert.equal((await run('memory_search', { query: 'restoration', kind: 'memory' })).total, 0)
  assert.equal((await run('memory_save', { scope: 'project', title: 'Historical restore', content: 'Revised old restoration instructions.' })).kind, 'reference')
  assert.ok(!prompt(project).includes('Historical restore'))
  const edited = await post('update', { scope: 'project', workspace: project, id: ref.id, content: 'Edited reference remains reference.' })
  assert.equal(edited.data.kind, 'reference')
  assert.ok(!prompt(project).includes('Historical restore'))
})

test('known session cannot search/read/list/inject host anchor project; guarded session cannot save into anchor', async () => {
  const a = await run('memory_save', { scope: 'project', title: 'Anchor private decision', content: 'Anchor-only instruction.' }, anchor)
  assert.equal((await run('memory_search', { query: 'Anchor-only' })).total, 0)
  assert.equal((await run('memory_read', { id: a.id })).code, 'memory_not_found')
  assert.ok(!(await run('memory_list', {})).project.entries.some(e => e.includes('Anchor private')))
  assert.ok(!prompt(project).includes('Anchor private'))
  assert.ok(!prompt(os.homedir()).includes('Anchor private'))
  assert.equal((await run('memory_save', { scope: 'project', title: 'No project', content: 'Must not go global.' }, os.homedir())).code, 'no_project_scope')
  assert.equal((await run('memory_search', { query: 'Anchor-only' }, os.homedir())).total, 0)
})

test('user memories stay cross-project, old files without kind stay memory', async () => {
  const saved = await run('memory_save', { scope: 'user', title: 'Explain clearly', content: 'Use concrete examples.' })
  await fs.writeFile(saved.file, (await fs.readFile(saved.file, 'utf8')).replace('kind: memory\n', ''))
  assert.equal((await run('memory_read', { id: saved.id })).kind, 'memory')
  assert.ok(prompt(anchor).includes('Explain clearly'))
  assert.ok(prompt(project).includes('Explain clearly'))
})

test('panel moves user decision to known project and can demote/promote reference', async () => {
  const saved = await run('memory_save', { scope: 'user', title: 'Team BI CLI', content: 'Use BI-CLI in this project.' })
  const moved = await post('update', { scope: 'user', id: saved.id, targetScope: 'project', targetWorkspace: project, kind: 'reference' })
  assert.equal(moved.status, 200)
  await assert.rejects(fs.access(saved.file))
  const file = path.join(project, '.dsh/memory/memories', saved.id + '.md')
  assert.match(await fs.readFile(file, 'utf8'), /scope: project\nkind: reference/)
  assert.ok(!prompt(anchor).includes('Team BI CLI'))
  assert.ok(!prompt(project).includes('Team BI CLI'))
  assert.equal((await post('read', { scope: 'project', workspace: project, id: saved.id })).data.kind, 'reference')
  const promoted = await post('update', { scope: 'project', workspace: project, id: saved.id, kind: 'memory' })
  assert.equal(promoted.status, 200)
  assert.ok(prompt(project).includes('Team BI CLI'))
  assert.ok(!prompt(anchor).includes('Team BI CLI'))
})

test('move rejects duplicate title and unknown project without changing source', async () => {
  const source = await run('memory_save', { scope: 'user', title: 'Duplicate topic', content: 'User version.' })
  const dest = await run('memory_save', { scope: 'project', title: 'Duplicate topic', content: 'Project version.' })
  assert.equal((await post('update', { scope: 'user', id: source.id, targetScope: 'project', targetWorkspace: project })).status, 409)
  assert.match(await fs.readFile(source.file, 'utf8'), /User version/)
  assert.match(await fs.readFile(dest.file, 'utf8'), /Project version/)
  assert.equal((await post('update', { scope: 'user', id: source.id, targetScope: 'project', targetWorkspace: '/unregistered' })).status, 400)
  await fs.access(source.file)
})

test('model update can consolidate and reclassify with original backups outside retrieval', async () => {
  const source = await run('memory_save', { scope: 'user', title: 'Old project setup', content: 'A historical-only detail for project restoration.' })
  const original = await fs.readFile(source.file, 'utf8')
  const result = await run('memory_update', { id: source.id, scope: 'user', targetScope: 'project', kind: 'reference' })
  assert.equal(result.ok, true)
  assert.equal(await fs.readFile(result.backup_file, 'utf8'), original)
  assert.match(result.backup_file, /backups/)
  assert.equal((await run('memory_search', { scope: 'user', query: 'historical-only' })).total, 0)
  const updated = await run('memory_update', { id: source.id, scope: 'project', content: 'Short source reference, original remains backed up.' })
  assert.equal(updated.kind, 'reference')
  assert.match(await fs.readFile(updated.backup_file, 'utf8'), /historical-only/)
  assert.equal((await run('memory_search', { query: 'historical-only' })).total, 0)
  assert.ok(!prompt(project).includes('Old project setup'))
})

test('model update cannot reach anchor from a different session or move to a missing project', async () => {
  const source = await run('memory_save', { scope: 'project', title: 'Anchor update locked', content: 'Only anchor may update this.' }, anchor)
  assert.equal((await run('memory_update', { id: source.id, scope: 'project', kind: 'reference' })).ok, false)
  assert.match(await fs.readFile(source.file, 'utf8'), /kind: memory/)
  const user = await run('memory_save', { scope: 'user', title: 'Wait for workspace', content: 'Unresolved project decision.' })
  assert.equal((await run('memory_update', { id: user.id, scope: 'user', targetScope: 'project' }, os.homedir())).ok, false)
  await fs.access(user.file)
})

test('same-title save keeps original backup before replacement', async () => {
  const saved = await run('memory_save', { scope: 'user', title: 'Backup on save', content: 'Original preferences.' })
  const original = await fs.readFile(saved.file, 'utf8')
  await run('memory_save', { scope: 'user', title: 'Backup on save', content: 'Updated preferences.' })
  const dir = path.join(tmp, 'user/backups', saved.id)
  const files = await fs.readdir(dir)
  assert.equal(files.length, 1)
  assert.equal(await fs.readFile(path.join(dir, files[0]), 'utf8'), original)
  assert.equal((await run('memory_search', { query: 'Original preferences' })).total, 0)
})

test('moving a tagged project entry clears old project path unless explicitly provided', async () => {
  const source = await run('memory_save', { scope: 'project', path: 'obsolete-area', title: 'Tagged source', content: 'Keep ownership correct.' }, anchor)
  const result = await post('update', { scope: 'project', workspace: anchor, id: source.id, targetScope: 'project', targetWorkspace: project })
  assert.equal(result.status, 200)
  assert.match((await run('memory_read', { id: source.id })).content, /\npath: \n/)
  assert.ok(prompt(project).includes('Tagged source'))
})

test('existing 500-file cap archives original before pruning including references', async () => {
  const ws = path.join(tmp, 'full-project')
  const dir = path.join(ws, '.dsh/memory/memories')
  await fs.mkdir(path.join(ws, '.git'), { recursive: true })
  await fs.mkdir(dir, { recursive: true })
  const original = '---\nscope: project\nkind: reference\n---\n\n# Old evidence\n\nOriginal historical evidence.\n'
  await Promise.all(Array.from({ length: 500 }, (_, i) => fs.writeFile(path.join(dir, `20000101-000000-old-${String(i).padStart(3,'0')}.md`), original)))
  const saved = await run('memory_save', { scope: 'project', title: 'New decision', content: 'Current conclusion.' }, ws)
  assert.equal(saved.prunedMemories, 1)
  const backupDir = path.join(ws, '.dsh/memory/backups/20000101-000000-old-000')
  const [backup] = await fs.readdir(backupDir)
  assert.equal(await fs.readFile(path.join(backupDir, backup), 'utf8'), original)
})
