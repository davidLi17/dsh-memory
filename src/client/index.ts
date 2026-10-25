/** Settings always remains available; a capable host also offers a full page. */
import { createElement as h } from 'react'
import { MemoryPanel } from './MemoryPanel.js'

interface ClientSlotContext {
  slots: {
    inject(name: string, register: () => unknown): unknown
    register(options: Record<string, unknown>, render: (props: Record<string, unknown>) => unknown): unknown
  }
}

export const name = '@fooxe/dsh-memory'
export const inject = ['slots']

export function apply(ctx: ClientSlotContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'dsh-memory', order: 70,
    label: () => 'Memory', locale: 'dsh-memory',
  }, () => h(MemoryPanel, { mode: 'settings' })))

  // Optional slots are registered only after declaration by the host. Keep the
  // sidebar entry inside the main capability, so older hosts get no dead link.
  const optional = (register: () => unknown): unknown => {
    try { return register() } catch (error) { console.warn('[dsh-memory] Optional full-page entry unavailable; use Settings → Memory.', error); return undefined }
  }
  optional(() => ctx.slots.inject('main', () => optional(() => [
    ctx.slots.register({ name: 'main', key: 'dsh-memory', locale: 'dsh-memory' }, () => h(MemoryPanel, { mode: 'page' })),
    ctx.slots.inject('sidebar.panellist', () => optional(() => ctx.slots.register({
      name: 'sidebar.panellist', id: 'dsh-memory', order: 70,
      label: () => 'Memory', locale: 'dsh-memory',
    }, props => h('svg', { width: typeof props.size === 'number' ? props.size : 18, height: typeof props.size === 'number' ? props.size : 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
      h('path', { d: 'M5 4.5h11.5A2.5 2.5 0 0 1 19 7v13H7a3 3 0 0 1-3-3V6a1.5 1.5 0 0 1 1-1.5Z' }),
      h('path', { d: 'M4 17a3 3 0 0 1 3-3h12M8 8h7' }))))),
  ])))
}
