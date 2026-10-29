import { createElement as h } from 'react'
import type { ReactElement } from 'react'
import { countKinds, scopeKey } from './model.js'
import type { EntryView, MemoryKind, ScopeView } from './model.js'

export function percent(value: number, total: number): number { return total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0 }
const number = (n: number): string => n.toLocaleString()
const percentText = (n: number, total: number): string => `${percent(n, total).toFixed(1)}%`
export function LineIcon({ type }: { type: 'folder' | 'user' | 'file' | 'book' }): ReactElement {
  const paths = { folder: 'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3Z', user: 'M16 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3', file: 'M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h6', book: 'M4 4h16v17l-8-4-8 4Z' }
  return h('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[type] }))
}

interface Tile { key: string, x: number, y: number, width: number, height: number }
/** Binary area subdivision: unlike equal-sized cards, every nonzero tile has exact count-proportional area. */
export function scopeTiles(items: Array<{ key: string, count: number }>): Tile[] {
  const positive = items.filter(item => item.count > 0).sort((a, b) => b.count - a.count)
  function split(rows: typeof positive, x: number, y: number, width: number, height: number): Tile[] {
    if (rows.length === 0) return []
    if (rows.length === 1) return [{ key: rows[0]!.key, x, y, width, height }]
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    let cut = 1, sum = rows[0]!.count
    while (cut < rows.length - 1 && Math.abs(sum + rows[cut]!.count - total / 2) < Math.abs(sum - total / 2)) sum += rows[cut++]!.count
    const ratio = sum / total
    return width >= height
      ? [...split(rows.slice(0, cut), x, y, width * ratio, height), ...split(rows.slice(cut), x + width * ratio, y, width * (1 - ratio), height)]
      : [...split(rows.slice(0, cut), x, y, width, height * ratio), ...split(rows.slice(cut), x, y + height * ratio, width, height * (1 - ratio))]
  }
  return split(positive, 0, 0, 100, 100)
}

export function Overview({ scopes, entries, disabled, chart, setChart, filter, setFilter, onOpen, onCreate }: { scopes: ScopeView[], entries: EntryView[], disabled: boolean, chart: 'bar' | 'map', setChart: (value: 'bar' | 'map') => void, filter: 'all' | 'user' | 'project', setFilter: (value: 'all' | 'user' | 'project') => void, onOpen: (key: string, kind?: MemoryKind | 'all') => void, onCreate: (key: string) => void }): ReactElement {
  const counts = countKinds(entries)
  const unknown = counts.all - counts.memory - counts.reference
  const rows = scopes.map(scope => ({ ...scope, rows: entries.filter(entry => scopeKey(entry.target) === scope.key) }))
  const sorted = [...rows].sort((a, b) => b.rows.length - a.rows.length)
  const max = Math.max(0, ...sorted.map(item => item.rows.length))
  const tiles = scopeTiles(sorted.map(item => ({ key: item.key, count: item.rows.length })))
  const m = percent(counts.memory, counts.all), r = percent(counts.reference, counts.all)
  const open = (key: string, kind: MemoryKind | 'all' = 'all'): void => onOpen(key, kind)
  return h('div', { className: 'dm-dashboard' },
    h('div', { className: 'dm-charts' },
      h('section', { className: 'dsh-memory-card dm-chart', 'aria-label': '范围分布' },
        h('div', { className: 'dm-section-head' }, h('h2', null, '范围分布'), h('div', { className: 'dm-segment', 'aria-label': '分布显示方式' }, ...(['bar', 'map'] as const).map(value => h('button', { type: 'button', key: value, 'aria-pressed': chart === value, onClick: () => setChart(value) }, value === 'bar' ? '条形图' : '色块图')))),
        chart === 'bar' ? h('div', { className: 'dm-bars' }, sorted.map(item => h('button', { type: 'button', key: item.key, className: 'dm-bar-row', disabled, title: `${item.label} · ${item.target.workspace ?? '跨项目偏好'}`, onClick: () => open(item.key), 'aria-label': `${item.label}，${item.rows.length} 条，查看记录` }, h('span', { className: 'dm-bar-label' }, item.label), h('span', { className: 'dm-bar-track', 'aria-hidden': true }, h('span', { className: item.target.scope === 'user' ? 'dm-bar-fill dm-user-fill' : 'dm-bar-fill', style: { width: `${percent(item.rows.length, max)}%` } })), h('span', { className: 'dm-tabular' }, number(item.rows.length))))) :
          h('div', null, counts.all === 0 ? h('p', { className: 'dm-map-empty' }, '暂无记录，保存后即可查看分布') : h('div', { className: 'dm-map', 'aria-label': '色块面积表示记录数量' }, tiles.map((tile, i) => { const item = rows.find(row => row.key === tile.key)!; return h('button', { key: tile.key, type: 'button', className: `dm-map-tile dm-map-color-${i % 4}`, disabled, onClick: () => open(item.key), style: { left: `${tile.x}%`, top: `${tile.y}%`, width: `${tile.width}%`, height: `${tile.height}%` }, title: `${item.label} · ${item.rows.length} 条`, 'aria-label': `${item.label}，${item.rows.length} 条，查看记录` }, h('strong', null, item.label), h('span', null, `${item.rows.length} 条`)) })), h('p', { className: 'dsh-memory-muted dm-map-note' }, '色块面积表示记录数量；空范围列在下方卡片中。'))),
      h('section', { className: 'dsh-memory-card dm-chart', 'aria-label': '用途占比' }, h('div', { className: 'dm-section-head' }, h('h2', null, '用途占比')),
        h('div', { className: 'dm-type-chart' }, h('div', { className: 'dm-donut', role: 'img', 'aria-label': `全部 ${counts.all} 条，长期记忆 ${counts.memory} 条，历史资料 ${counts.reference} 条${unknown ? `，未分类 ${unknown} 条` : ''}`, style: { background: counts.all ? `conic-gradient(var(--dm-memory) 0% ${m}%,var(--dm-reference) ${m}% ${m + r}%,var(--dm-track) ${m + r}% 100%)` : 'var(--dm-track)' } }, h('div', null, h('strong', null, number(counts.all)), h('span', null, '全部记录'))),
          h('div', { className: 'dm-legend' }, (['memory', 'reference'] as const).map(kind => h('button', { type: 'button', key: kind, disabled, onClick: () => open('all', kind) }, h('i', { className: `dm-dot dm-${kind}`, 'aria-hidden': true }), h('span', null, kind === 'memory' ? '长期记忆' : '历史资料'), h('strong', null, number(counts[kind])), h('span', null, percentText(counts[kind], counts.all)))), unknown > 0 ? h('span', { className: 'dsh-memory-muted' }, `未分类 ${unknown} 条`) : null)))),
    h('section', { className: 'dm-spaces', 'aria-label': '记忆空间' }, h('div', { className: 'dm-section-head dm-space-head' }, h('h2', null, '记忆空间'), h('div', { className: 'dm-segment', 'aria-label': '空间范围' }, ...(['all', 'user', 'project'] as const).map(value => h('button', { key: value, type: 'button', 'aria-pressed': filter === value, onClick: () => setFilter(value) }, value === 'all' ? '全部范围' : value === 'user' ? '用户记忆' : '项目记忆'))), h('button', { type: 'button', className: 'dm-text-button', disabled, onClick: () => open('all') }, '查看全部记录 →')),
      h('div', { className: 'dm-space-grid' }, rows.filter(item => filter === 'all' || item.target.scope === filter).map(item => {
        const c = countKinds(item.rows), stats = item.stats
        const capacity = stats === undefined ? null : percent(stats.indexBytes, stats.maxBytes)
        return h('article', { key: item.key, className: 'dsh-memory-card dm-space-card' },
          h('button', { type: 'button', className: 'dm-space-title', disabled, onClick: () => open(item.key), title: item.target.workspace ?? '跨项目偏好' }, h(LineIcon, { type: item.target.scope === 'user' ? 'user' : 'folder' }), h('h3', null, item.label), h('strong', { className: 'dm-tabular' }, `${c.all} 条`)),
          !item.available || item.nested ? h('p', { className: 'dm-scope-status' }, !item.available ? '暂不可用' : '嵌套范围 · 只读摘要') : null,
          h('div', { className: 'dm-composition', 'aria-hidden': true }, h('span', { className: 'dm-memory', style: { width: `${percent(c.memory, c.all)}%` } }), h('span', { className: 'dm-reference', style: { width: `${percent(c.reference, c.all)}%` } })),
          h('div', { className: 'dm-kind-counts' }, h('span', null, h('i', { className: 'dm-dot dm-memory', 'aria-hidden': true }), `长期记忆 ${c.memory}`), h('span', null, h('i', { className: 'dm-dot dm-reference', 'aria-hidden': true }), `历史资料 ${c.reference}`), c.all > c.memory + c.reference ? h('span', null, `未分类 ${c.all - c.memory - c.reference}`) : null),
          h('div', { className: 'dm-previews' }, c.all === 0 ? h('div', { className: 'dm-card-empty' }, h(LineIcon, { type: 'file' }), h('span', null, item.available ? '暂无记忆' : '此范围暂不可用'), item.available && !item.nested ? h('button', { type: 'button', className: 'dm-text-button', disabled, onClick: () => onCreate(item.key) }, '新增第一条记录') : null) : item.rows.slice(0, 2).map(entry => h('div', { className: 'dm-preview', key: entry.key, title: entry.excerpt || entry.title }, h(LineIcon, { type: 'file' }), h('span', { className: 'dm-preview-copy' }, h('span', { className: 'dm-preview-title' }, entry.title), entry.excerpt ? h('small', { className: 'dm-preview-excerpt' }, entry.excerpt) : null), entry.tags[0] ? h('span', { className: 'dm-preview-tag' }, entry.tags[0]) : null))),
          h('div', { className: 'dm-card-footer' }, h('div', { className: 'dm-capacity', title: stats ? `索引行 ${stats.entries} / ${stats.maxEntries}；文件 ${stats.memoryFiles} / ${stats.maxMemories}（含历史资料）` : undefined }, h('span', null, stats ? `索引 ${(stats.indexBytes / 1024).toFixed(1)} / ${(stats.maxBytes / 1024).toFixed(0)} KB` : '容量暂不可用'), capacity === null ? null : h('div', { className: `dm-capacity-track${capacity >= 90 ? ' dm-capacity-warning' : ''}`, role: 'progressbar', 'aria-label': `${item.label}索引容量`, 'aria-valuenow': stats!.indexBytes, 'aria-valuemin': 0, 'aria-valuemax': Math.max(stats!.maxBytes, stats!.indexBytes), 'aria-valuetext': `${stats!.indexBytes} / ${stats!.maxBytes} 字节` }, h('span', { style: { width: `${capacity}%` } }))), h('button', { type: 'button', className: 'dm-text-button', disabled, onClick: () => open(item.key) }, '查看记录 →')))
      }))))
}
