import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-registration-'))
process.env.DSH_MEMORY_USER_DIR = path.join(tmp, 'user')
process.env.DSH_MEMORY_PROJECT_DIR = path.join(tmp, 'project')
const plugin = await import('../lib/index.js')
const key = 'dsh-memory:touched-dirs'
function fixture(projections) {
  const sections = [], tools = []
  return { sections, tools, ctx: {
    tools: { register: tool => tools.push(tool) },
    systemPrompt: { section: section => sections.push(section), getSectionOrder: () => 42 },
    inject() {}, get: name => name === 'sessionProjections' ? projections : undefined,
  } }
}
async function seed(f) {
  const save = f.tools.find(tool => tool.name === 'memory_save')
  await save.execute({ title: 'Touched deep area', content: 'Only this area.', path: 'deep' }, { signal: new AbortController().signal })
}
const prompt = f => f.sections[0].text({ agent: { session: { header: { cwd: process.env.DSH_MEMORY_PROJECT_DIR } } } })

test('awaits callable thenable readiness and reads only the retained handle', async () => {
  let resolve, called = 0, reads = 0
  const ready = new Promise(done => { resolve = done })
  const registration = Object.assign(() => { called++ }, { then: ready.then.bind(ready) })
  const f = fixture({ register: () => registration, stateOf: () => { throw new Error('deprecated registry read') } })
  const activation = plugin.apply(f.ctx)
  await new Promise(done => setImmediate(done))
  assert.equal(f.sections.length, 0)
  assert.equal(f.tools.length, 0)
  resolve({ stateOf: () => { reads++; return ['deep/file.ts'] } })
  await activation
  await seed(f)
  assert.match(prompt(f), /Touched deep area/)
  assert.equal(reads, 1)
  assert.equal(called, 0, 'the callable thenable must never be invoked as a disposer')
})

for (const [name, register] of [
  ['sync throw', () => { throw new Error('conflicting registration') }],
  ['native rejection', () => Promise.reject(new Error('conflicting registration'))],
  ['callable rejection', () => Object.assign(() => {}, { then: (_ok, fail) => Promise.reject(new Error('conflict')).then(_ok, fail) })],
]) test(`${name} degrades without consuming another owner's state`, async () => {
  let reads = 0
  const f = fixture({ register, stateOf: () => { reads++; return ['deep/file.ts'] } })
  await plugin.apply(f.ctx)
  await seed(f)
  assert.doesNotMatch(prompt(f), /Touched deep area/)
  assert.equal(f.tools.length, 5)
  assert.equal(reads, 0)
})

for (const method of ['stateOf', 'snapshot']) test(`old synchronous registration retains ${method} fallback`, async () => {
  const f = fixture({ register: () => () => {}, [method]: () => method === 'stateOf' ? ['deep/file.ts'] : { values: { [key]: ['deep/file.ts'] } } })
  await plugin.apply(f.ctx)
  await seed(f)
  assert.match(prompt(f), /Touched deep area/)
})

test('a failed handle read does not fall through to unrelated registry state', async () => {
  let fallback = 0
  const f = fixture({ register: async () => ({ stateOf() { throw new Error('read failed') } }), stateOf: () => { fallback++; return ['deep/file.ts'] } })
  await plugin.apply(f.ctx)
  await seed(f)
  assert.doesNotMatch(prompt(f), /Touched deep area/)
  assert.equal(fallback, 0)
})


test('a non-array handle state degrades without registry fallback', async () => {
  let fallback = 0
  const f = fixture({ register: async () => ({ stateOf: () => ({ invalid: true }) }), stateOf: () => { fallback++; return ['deep/file.ts'] } })
  await plugin.apply(f.ctx)
  await seed(f)
  assert.doesNotMatch(prompt(f), /Touched deep area/)
  assert.equal(fallback, 0)
})
