import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { hostDependencies } from './host-dependencies.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const versions = process.argv.slice(2)
if (!versions.length) versions.push('0.0.1-rc.1', '0.2.1-rc.5', '0.2.2-rc.1')
if (versions.some(v => !['0.0.1-rc.1', '0.2.1-rc.5', '0.2.2-rc.1'].includes(v))) throw new Error('Unknown compatibility host')
if (!process.env.npm_execpath) throw new Error('Run through npm run test:compat')
const outputs = join(root, '.cache', 'compatibility')
mkdirSync(outputs, { recursive: true })
const results = []
for (const version of versions) {
  // Outside the checkout: Node cannot borrow the current host from ancestor node_modules.
  const directory = mkdtempSync(join(tmpdir(), `dsh-memory-${version}-`))
  const log = join(outputs, `${version}.log`)
  writeFileSync(log, '')
  try {
    const roots = ['tools', 'session', 'system-prompt', 'session-projection']
    if (version === '0.2.2-rc.1') roots.push('tool-executor-native')
    const host = await hostDependencies(version, roots.map(n => `@deepseek-ai/dsh-${n}`))
    const devDependencies = { ...Object.fromEntries(Object.entries(pkg.devDependencies)
      .filter(([name]) => !name.startsWith('@deepseek-ai/dsh-'))
      .map(([name, range]) => [name, lock.packages[`node_modules/${name}`]?.version ?? range])), ...host }
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ ...pkg, private: true, devDependencies, peerDependencies: {}, peerDependenciesMeta: {} }, null, 2) + '\n')
    for (const file of ['src', 'lib', 'client', 'tests', 'skills', 'cordis.patch.yml', 'overlay', 'README.md', 'LICENSE', 'tsconfig.json', 'tsconfig.client.json', 'tsdown.config.ts']) cpSync(join(root, file), join(directory, file), { recursive: true })
    const run = args => {
      const result = spawnSync(process.execPath, args, { cwd: directory, env: process.env, encoding: 'utf8', timeout: 240000 })
      writeFileSync(log, readFileSync(log, 'utf8') + `\n$ node ${args.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
      if (result.error || result.status !== 0) throw new Error(result.error?.message ?? `Command failed: ${args.join(' ')}`)
    }
    run([process.env.npm_execpath, 'install', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'])
    for (const name of Object.keys(host)) if (JSON.parse(readFileSync(join(directory, 'node_modules', name, 'package.json'))).version !== version) throw new Error(`Mixed host version: ${name}`)
    run([process.env.npm_execpath, 'run', 'build'])
    run([process.env.npm_execpath, 'test'])
    results.push({ version, status: 'passed', hostPackages: Object.keys(host).length, directory, log })
    console.log(`${version}: passed (${Object.keys(host).length} pinned host packages)`)
  } catch (error) {
    results.push({ version, status: 'failed', error: String(error), directory, log })
    console.error(`${version}: ${error}; ${log}`)
  }
}
writeFileSync(join(outputs, 'results.json'), JSON.stringify(results, null, 2) + '\n')
if (results.some(r => r.status !== 'passed')) process.exitCode = 1
