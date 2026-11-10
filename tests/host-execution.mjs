// Use the actual published executor for hosts that split it from the registry.
export async function installHostExecutor(ctx) {
  if (typeof ctx.tools.setExecutor !== 'function') return
  const executor = await import('@deepseek-ai/dsh-tool-executor-native')
  await ctx.plugin(executor)
}

export async function executeHostTool(ctx, input) {
  if (typeof ctx.tools.setExecutor !== 'function') return ctx.tools.execute(input)
  const batch = await ctx.tools.execute({
    calls: [{ type: 'tool-call', id: input.callId, name: input.name, arguments: JSON.stringify(input.arguments) }],
    signal: input.signal,
    ...(input.agent === undefined ? {} : { agent: input.agent }),
  })
  if (batch.results.length !== 1 || batch.results[0].callId !== input.callId) throw new Error('Host batch lost the requested call')
  return batch.results[0].result
}

// JSON validation moved out of dsh-session in newer hosts.
const session = await import('@deepseek-ai/dsh-session')
export const snapshotJsonValue = session.snapshotJsonValue ?? (await import('@deepseek-ai/dsh-util-values')).snapshotJsonValue
