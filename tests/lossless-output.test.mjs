// Exercise the real DSH output boundary, not JSON.stringify (which hides undefined).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import { snapshotJsonValue } from '@deepseek-ai/dsh-session'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-lossless-'))
const previousCwd = process.cwd()
const project = path.join(tmp, 'project')
await fs.mkdir(path.join(project, '.git'), { recursive: true })
process.chdir(project)
process.env.DSH_MEMORY_USER_DIR = path.join(tmp, 'user')
delete process.env.DSH_MEMORY_PROJECT_DIR
const plugin = await import('../lib/index.js')
const ctx = new Context()
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolRegistry)
await ctx.plugin(plugin)
let call = 0
const run = (name, args) => ctx.tools.execute({ name, arguments: args, callId: `lossless-${++call}`, signal: new AbortController().signal })
const valueOf = result => {
  assert.notEqual(result.isError, true, JSON.stringify(result))
  assert.notEqual(snapshotJsonValue(result.value), undefined, 'canonical output must be lossless JSON')
  assert.deepEqual(JSON.parse(JSON.stringify(result.value)), result.value)
  return result.value
}
after(async () => {
  process.chdir(previousCwd)
  await fs.rm(tmp, { recursive: true, force: true })
})

for (const scope of ['user', 'project']) {
  for (const kind of ['memory', 'reference']) {
    valueOf(await run('memory_save', { scope, kind, title: `${scope} ${kind} bi-cli-id`, content: 'BI CLI content-only match.' }))
  }
}

for (const scope of ['user', 'project', 'mixed']) {
  for (const [query, branch] of [['bi-cli-id', 'id'], ['BI CLI', 'content']]) {
    test(`memory_search ${scope} ${branch} hits cross the real DSH lossless output boundary`, async () => {
      const args = { query, limit: 20, ...(scope === 'mixed' ? {} : { scope }) }
      const value = valueOf(await run('memory_search', args))
      assert.equal(value.total, scope === 'mixed' ? 4 : 2)
      assert.deepEqual([...new Set(value.matches.map(hit => hit.kind))].sort(), ['memory', 'reference'])
      for (const hit of value.matches) {
        assert.equal(Object.hasOwn(hit, 'workspace'), hit.scope === 'project')
        if (hit.scope === 'project') assert.equal(hit.workspace, project)
        if (branch === 'id') assert.equal(hit.excerpt, '(id match)')
        else assert.match(hit.excerpt, /BI CLI/)
      }
    })
  }
}

test('reported limit=3 query and related tools return canonical JSON', async () => {
  const result = valueOf(await run('memory_search', { query: 'BI CLI', limit: 3 }))
  assert.equal(result.total, 3)
  assert.deepEqual([...new Set(result.matches.map(hit => hit.scope))].sort(), ['project', 'user'])
  for (const hit of result.matches) valueOf(await run('memory_read', { id: hit.id }))
  valueOf(await run('memory_list', {}))
  assert.equal(valueOf(await run('memory_search', { query: 'no-such-needle' })).total, 0)
  assert.equal(valueOf(await run('memory_search', { query: ' ' })).code, 'invalid_input')
})
