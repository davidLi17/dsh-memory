import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (!process.env.npm_execpath) throw new Error('Run through npm run test:package')
const directory = mkdtempSync(join(tmpdir(), 'dsh-memory-package-'))
const run = (args, cwd = directory) => {
  const result = spawnSync(process.execPath, args, { cwd, env: process.env, encoding: 'utf8', timeout: 240000 })
  if (result.error || result.status !== 0) throw new Error(`${result.error ?? 'Command failed'}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
  return result.stdout
}
const [packed] = JSON.parse(run([process.env.npm_execpath, 'pack', '--json', '--ignore-scripts', '--pack-destination', directory], root))
const required = ['lib/index.js', 'lib/types/index.d.ts', 'client/client.js', 'cordis.patch.yml', 'skills/memory-organize/SKILL.md']
for (const file of required) assert.ok(packed.files.some(entry => entry.path === file), `Missing packed ${file}`)
const dependencies = Object.fromEntries(Object.entries(pkg.devDependencies).filter(([name]) => name.startsWith('@deepseek-ai/')))
writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'dsh-memory-package-smoke', private: true, type: 'module', dependencies }, null, 2))
console.log(run([process.env.npm_execpath, 'install', '--legacy-peer-deps', '--ignore-scripts', '--no-fund', '--no-audit', join(directory, packed.filename)]))
for (const file of required) assert.deepEqual(readFileSync(join(directory, 'node_modules', pkg.name, file)), readFileSync(join(root, file)), `Installed ${file} differs from the reviewed artifact`)
mkdirSync(join(directory, 'tests'))
cpSync(join(root, 'tests/host-execution.mjs'), join(directory, 'tests/host-execution.mjs'))
writeFileSync(join(directory, 'tests/projection.real.mjs'), readFileSync(join(root, 'tests/projection.real.mjs'), 'utf8').replace("import('../lib/index.js')", `import('${pkg.name}')`))
console.log(run(['--test', 'tests/projection.real.mjs']))
console.log(`Packed installation passed: ${pkg.name}@${pkg.version}; ${packed.integrity}; ${directory}`)
