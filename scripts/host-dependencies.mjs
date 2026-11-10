// Resolve one published host line without accidentally auto-installing newer peers.
export async function hostDependencies(version, roots) {
  const dependencies = {}
  let pending = roots
  while (pending.length) {
    const names = [...new Set(pending)].filter(name => !(name in dependencies))
    pending = []
    await Promise.all(names.map(async name => {
      const response = await fetch(`https://registry.npmjs.org/${name}/${version}`, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error(`${name}@${version}: HTTP ${response.status}`)
      const manifest = await response.json()
      dependencies[name] = version
      for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
        // The original published host names this unpublished, type-only peer.
        // Match the repository's existing --legacy-peer-deps development setup.
        if (version === '0.0.1-rc.1' && dependency === '@deepseek-ai/dsh-type-meta') continue
        if (dependency.startsWith('@deepseek-ai/dsh-') && !manifest.peerDependenciesMeta?.[dependency]?.optional) pending.push(dependency)
      }
    }))
  }
  return dependencies
}
