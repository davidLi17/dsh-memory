// Validate an already-built official rc.2 checkout without modifying that checkout.
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const host = resolve(process.argv[2] ?? '')
const sha = 'ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c'
if (!process.argv[2] || !process.env.npm_execpath) throw new Error('Use npm run test:source-host -- /path/to/built/official/host')
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: host, encoding: 'utf8' })
assert.equal(git.status, 0, 'Host must be a Git checkout')
assert.equal(git.stdout.trim(), sha, 'Unexpected official host revision')
const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: host, encoding: 'utf8' })
assert.equal(dirty.status, 0)
assert.equal(dirty.stdout.trim(), '', 'Tracked host source must be unchanged')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const directory = mkdtempSync(join(tmpdir(), 'dsh-memory-source-rc2-'))
const env = { ...process.env, DSH_MEMORY_SOURCE_HOST: '0.2.2-rc.2', PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` }
const logdir = join(root, '.cache', 'source-host')
mkdirSync(logdir, { recursive: true })
const log = join(logdir, '0.2.2-rc.2.log')
writeFileSync(log, `Official source host ${sha}; Node ${process.version}; ${directory}\n`)
writeFileSync(join(logdir, 'results.json'), JSON.stringify({ source: sha, status: 'running', directory, log }) + '\n')
function run(args, cwd = directory) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 240000 })
  writeFileSync(log, readFileSync(log, 'utf8') + `\n$ node ${args.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
  if (result.error || result.status !== 0) throw new Error(`Source-host command failed: ${args.join(' ')}; ${result.error ?? result.status}; ${log}`)
  return result.stdout
}
function link(target, path) {
  if (!existsSync(path)) symlinkSync(realpathSync(target), path, process.platform === 'win32' ? 'junction' : 'dir')
}
function attachGraph(destination) {
  const modules = join(destination, 'node_modules')
  const scoped = join(modules, '@deepseek-ai')
  mkdirSync(scoped, { recursive: true })
  for (const entry of readdirSync(join(root, 'node_modules'))) {
    if (entry !== '@deepseek-ai' && entry !== '.package-lock.json') link(join(root, 'node_modules', entry), join(modules, entry))
  }
  // Link actual workspace packages, never the development checkout's rc.1 peers.
  for (const group of readdirSync(join(host, 'packages'), { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    for (const entry of readdirSync(join(host, 'packages', group.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const base = join(host, 'packages', group.name, entry.name)
      if (!existsSync(join(base, 'package.json'))) continue
      const manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'))
      if (manifest.name?.startsWith('@deepseek-ai/')) link(base, join(scoped, manifest.name.split('/')[1]))
    }
  }
  link(join(host, 'packages/core/session/node_modules/@deepseek-ai/cordis'), join(scoped, 'cordis'))
  for (const name of ['dsh-session', 'dsh-tools', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tool-executor-native']) {
    const base = join(scoped, name)
    const manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'))
    assert.equal(manifest.version, '0.2.2-rc.2', `Mixed host: ${name}`)
    assert.ok(existsSync(join(base, manifest.main)), `Build the official host first: ${name}`)
  }
}
for (const entry of ['src', 'lib', 'client', 'tests', 'skills', 'overlay', 'cordis.patch.yml', 'README.md', 'LICENSE', 'tsconfig.json', 'tsconfig.client.json', 'tsdown.config.ts', 'package.json']) cpSync(join(root, entry), join(directory, entry), { recursive: true })
attachGraph(directory)
run([process.env.npm_execpath, 'run', 'build'])
run([process.env.npm_execpath, 'test'])
const [pack] = JSON.parse(run([process.env.npm_execpath, 'pack', '--ignore-scripts', '--json']))
const installed = mkdtempSync(join(tmpdir(), 'dsh-memory-source-installed-'))
writeFileSync(join(installed, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
run([process.env.npm_execpath, 'install', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', join(directory, pack.filename)], installed)
attachGraph(installed)
for (const file of ['lib/index.js', 'lib/types/index.d.ts', 'client/client.js', 'cordis.patch.yml', 'skills/memory-organize/SKILL.md']) assert.deepEqual(readFileSync(join(installed, 'node_modules', pkg.name, file)), readFileSync(join(directory, file)), `Packed file mismatch: ${file}`)
mkdirSync(join(installed, 'tests'))
cpSync(join(root, 'tests/host-execution.mjs'), join(installed, 'tests/host-execution.mjs'))
writeFileSync(join(installed, 'tests/projection.real.mjs'), readFileSync(join(root, 'tests/projection.real.mjs'), 'utf8').replace("import('../lib/index.js')", `import('${pkg.name}')`))
run(['--test', 'tests/projection.real.mjs'], installed)
writeFileSync(join(logdir, 'results.json'), JSON.stringify({ source: sha, version: '0.2.2-rc.2', node: process.version, status: 'passed', directory, installed, integrity: pack.integrity, log }, null, 2) + '\n')
console.log(`Official source-built rc.2 passed: full regression + packed installation; ${log}`)
