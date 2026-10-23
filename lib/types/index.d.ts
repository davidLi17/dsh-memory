/**
 * Claude Code-style persistent memory for DeepSeek Harness.
 *
 * Registers four model-facing tools — memory_save, memory_search,
 * memory_read, memory_list — backed by plain files: one markdown file per
 * memory plus a MEMORY.md index, following the memory architecture Claude
 * Code popularized:
 *
 *   1. MEMORY.md acts as a compact, always-readable index.
 *   2. The index is guarded (200 lines / 25 KB) so memory can never silently
 *      eat the context window; oldest entries fall off the index first.
 *   3. Tool descriptions carry proactive-save guidance, so the model saves
 *      important facts (user preferences, project decisions, key numbers)
 *      without being asked — the behavioral half of "auto memory".
 *   3b. Since v0.2.0 the plugin also injects the memory index into the host
 *      system prompt (ctx.systemPrompt), so every session starts with its
 *      memories already loaded — the Claude Code "wake up with memory"
 *      behavior, not a hope-that-the-model-asks behavior.
 *   4. Storage is pure files: no external server, no embedding provider,
 *      nothing to provision. Search is case-insensitive substring matching,
 *      which is deterministic and dependency-free by design.
 *
 * Storage layout (v3.0 hierarchical; user dir configurable via
 * DSH_MEMORY_USER_DIR, default $DSH_HOME/memory or ~/.dsh/memory;
 * project dir auto-detected at <git-root>/.dsh/memory):
 *
 *   ~/.dsh/memory/MEMORY.md                user index, newest first
 *   ~/.dsh/memory/memories/<date>-<slug>.md one file per user memory
 *   <git-root>/.dsh/memory/MEMORY.md        project index (git-shared)
 *   <git-root>/.dsh/memory/memories/*.md    one file per project memory
 *
 * @module dsh-memory
 */
import type { Context } from '@deepseek-ai/cordis';
/** Plugin name registered with the Loader. */
export declare const name = "dsh-memory";
/** Host services this plugin consumes. Cordis enforces inject: accessing
 * ctx.systemPrompt without declaring it throws "cannot get property without
 * inject" and the whole plugin fails to activate (found via real DSH host
 * debugging; official tool-fs declares ['tools', 'fs', 'systemPrompt']). */
export declare const inject: string[];
export interface ProjectResolution {
    dir?: string;
    source: 'env' | 'walk' | 'cwd' | 'none';
}
export declare function resolveProjectScope(startDir?: string, opts?: {
    homeDir?: string;
}): ProjectResolution;
export declare function apply(ctx: Context): Promise<void>;
