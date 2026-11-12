import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import { executeHostTool, installHostExecutor } from './host-execution.mjs'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-projection-real-'))
const root = path.join(tmp, 'project')
await fs.mkdir(path.join(root, '.git'), { recursive: true })
process.env.DSH_MEMORY_USER_DIR = path.join(tmp, 'user')
process.env.DSH_MEMORY_PROJECT_DIR = root
const plugin = await import('../lib/index.js')
const contexts = []
after(async () => { for (const ctx of contexts) await ctx.fiber.dispose(); await fs.rm(tmp, { recursive: true, force: true }) })
async function setup() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRegistry)
  await installHostExecutor(ctx)
  const owner = await ctx.plugin(plugin)
  const session = ctx.sessions.create(undefined, { meta: { cwd: root } })
  const call = (name, args) => executeHostTool(ctx, { name, arguments: args, callId: `test-${name}`, signal: new AbortController().signal })
  const save = await call('memory_save', { scope: 'project', title: 'Deep memory marker', content: 'Touch gated.', path: 'deep' })
  assert.equal(save.value.saved, true)
  const prompt = async s => JSON.stringify((await ctx.systemPrompt.assemble({ agent: { session: s }, signal: new AbortController().signal })).sections)
  return { ctx, owner, session, prompt }
}
const append = (session, name, args) => session.append('tool/call', { turn: 1, step: 1, callId: 'touch-call', name, arguments: typeof args === 'string' ? args : JSON.stringify(args) })
const key = 'dsh-memory:touched-dirs'

test('real Session JSON events activate touches, preserve isolation, replay, and owner disposal', async () => {
  const { ctx, owner, session, prompt } = await setup()
  assert.doesNotMatch(await prompt(session), /Deep memory marker/)
  const touch = append(session, 'read', { file_path: 'deep/file.ts' })
  assert.match(await prompt(session), /Deep memory marker/)
  const other = ctx.sessions.create(undefined, { meta: { cwd: root } })
  assert.doesNotMatch(await prompt(other), /Deep memory marker/)
  const checkpoint = ctx.sessionProjections.checkpoint(session)
  assert.equal(checkpoint[key].ver, 3)
  assert.deepEqual(checkpoint[key].val, ['deep/file.ts'])
  const resumed = ctx.sessions.create(undefined, { meta: { cwd: root }, seed: [{ ...touch, seq: 0 }] })
  assert.match(await prompt(resumed), /Deep memory marker/)
  await owner.dispose()
  // The registry retains released checkpoint cells, but registration ownership must end.
  const released = typeof ctx.sessionProjections.stateOf === 'function'
    ? ctx.sessionProjections.stateOf(session, key)
    : ctx.sessionProjections.snapshot(session).values[key]
  assert.equal(released, undefined)
  assert.doesNotMatch(await prompt(session), /Deep memory marker/)
})

test('real committed directory changes, not failed cd requests, control touch replay', async () => {
  const { ctx, session, prompt } = await setup()
  append(session, 'working_directory', { cd: 'deep' }) // request only, no successful commit
  append(session, 'grep', { path: 'other' })
  assert.doesNotMatch(await prompt(session), /Deep memory marker/)
  session.append('working-directory/change', { cwd: path.join(root, 'deep') })
  append(session, 'read', { file_path: 'file.ts' })
  session.append('working-directory/change', { cwd: root })
  assert.match(await prompt(session), /Deep memory marker/)
  const before = ctx.sessionProjections.checkpoint(session)[key].val
  append(session, 'read', '{malformed')
  append(session, 'read', 'null')
  append(session, 'read', '[]')
  assert.deepEqual(ctx.sessionProjections.checkpoint(session)[key].val, before)
})

test('real rejected registration degrades and never reads a conflicting owner', async () => {
  const { ctx, owner, session, prompt } = await setup()
  await owner.dispose()
  await ctx.sessionProjections.register({ key, stateVersion: 999, stateSchema: { parse: x => x }, schema: { parse: x => x }, init: () => ['deep/file.ts'], apply: s => s })
  await ctx.plugin(plugin)
  assert.doesNotMatch(await prompt(session), /Deep memory marker/)
})

// The source-host gate pins the unpublished rc.2 graph before enabling this API test.
if (process.env.DSH_MEMORY_SOURCE_HOST === '0.2.2-rc.2') test('rc2 actual batch append folds committed cwd before each touch and rejects invalid batch atomically', async () => {
  const { ctx, session, prompt } = await setup()
  const events = session.append([
    ['working-directory/change', { cwd: path.join(root, 'deep') }],
    ['tool/call', { turn: 1, step: 1, callId: 'batch-read', name: 'read', arguments: JSON.stringify({ file_path: 'inside.ts' }) }],
    ['working-directory/change', { cwd: root }],
    ['tool/call', { turn: 1, step: 1, callId: 'batch-read2', name: 'read', arguments: JSON.stringify({ file_path: 'outside.ts' }) }],
  ])
  assert.equal(events.length, 4)
  assert.match(await prompt(session), /Deep memory marker/)
  assert.deepEqual(ctx.sessionProjections.checkpoint(session)[key].val, [{ cd: path.join(root, 'deep') }, 'inside.ts', { cd: root }, 'outside.ts'])
  const other = ctx.sessions.create(undefined, { meta: { cwd: root } })
  assert.doesNotMatch(await prompt(other), /Deep memory marker/)
  const before = session.seq
  assert.throws(() => session.append([
    ['working-directory/change', { cwd: path.join(root, 'deep')}],
    ['tool/call', undefined],
  ]))
  assert.equal(session.seq, before)
  assert.deepEqual(ctx.sessionProjections.checkpoint(session)[key].val, [{ cd: path.join(root, 'deep') }, 'inside.ts', { cd: root }, 'outside.ts'])
})
