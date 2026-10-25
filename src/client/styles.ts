/** Local styles only: no host body, composer or generic theme mutations. */
export const memoryStyles = `
.dsh-memory { --dm-bg:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 96%,var(--dsw-alias-label-primary,#20242c) 4%); --dm-card:var(--dsw-alias-bg-layer-1,#fff); --dm-text:var(--dsw-alias-label-primary,#20242c); --dm-muted:var(--dsw-alias-label-secondary,#727987); --dm-border:var(--dsw-alias-border-l2,#e3e6ec); --dm-accent:var(--dsw-alias-state-business-primary,#5368d5); --dm-soft:color-mix(in srgb,var(--dm-accent) 9%,var(--dm-card)); --dm-danger:var(--dsw-alias-state-error-primary,#bd3d45); color:var(--dm-text); background:var(--dm-bg); font-family:inherit; font-size:13px; line-height:1.5; min-width:0; min-height:100%; padding:20px; box-sizing:border-box; container-type:inline-size; }
.dsh-memory-page { height:100%; min-height:0; overflow:auto; }
.dsh-memory *, .dsh-memory *::before, .dsh-memory *::after { box-sizing:border-box; }
.dsh-memory button,.dsh-memory input,.dsh-memory textarea,.dsh-memory select { font:inherit; color:inherit; }
.dsh-memory button { cursor:pointer; }
.dsh-memory button:disabled { cursor:not-allowed; opacity:.5; }
.dsh-memory button:focus-visible,.dsh-memory input:focus-visible,.dsh-memory textarea:focus-visible,.dsh-memory select:focus-visible,.dsh-memory [tabindex]:focus-visible { outline:2px solid var(--dm-accent); outline-offset:3px; }
.dsh-memory h1,.dsh-memory h2,.dsh-memory h3,.dsh-memory p { margin:0; }
.dsh-memory-header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; }
.dsh-memory-heading { font-size:20px; font-weight:650; letter-spacing:-.35px; }
.dsh-memory-subtitle { color:var(--dm-muted); font-size:12px; margin-top:4px!important; }
.dsh-memory-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.dsh-memory-button { border:1px solid var(--dm-border); background:var(--dm-card); border-radius:8px; padding:7px 12px; white-space:nowrap; min-height:34px; }
.dsh-memory-button:hover:not(:disabled) { background:var(--dm-soft); }
.dsh-memory-primary { color:var(--dsw-alias-label-primary-foreground,#fff)!important; background:var(--dsw-alias-button-primary-fill,#5368d5)!important; border-color:transparent; }
.dsh-memory-danger { color:var(--dm-danger)!important; }
.dsh-memory-overview { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:16px; }
.dsh-memory-stat { border:1px solid var(--dm-border); background:var(--dm-card); border-radius:12px; padding:14px 16px; display:flex; align-items:center; gap:13px; min-width:0; }
.dsh-memory-stat-icon { width:36px; height:36px; border-radius:10px; display:grid; place-items:center; color:var(--dm-accent); background:var(--dm-soft); font-size:18px; flex-shrink:0; }
.dsh-memory-stat-label { color:var(--dm-muted); font-size:12px; }
.dsh-memory-stat-value { font-size:25px; font-weight:650; letter-spacing:-.5px; line-height:1.2; margin-top:2px; }
.dsh-memory-workbench { display:grid; grid-template-columns:180px minmax(260px,.9fr) minmax(320px,1.25fr); gap:10px; align-items:stretch; min-height:560px; }
.dsh-memory-card { background:var(--dm-card); border:1px solid var(--dm-border); border-radius:12px; min-width:0; overflow:hidden; }
.dsh-memory-nav { padding:14px 10px; align-self:start; }
.dsh-memory-eyebrow { color:var(--dm-muted); font-size:11px; font-weight:600; letter-spacing:.06em; margin:0 8px 10px!important; }
.dsh-memory-nav-group { margin:20px 8px 8px!important; font-size:11px; color:var(--dm-muted); }
.dsh-memory-scope { width:100%; border:0; background:transparent; text-align:left; padding:10px; border-radius:8px; margin-bottom:3px; display:flex; align-items:flex-start; gap:8px; }
.dsh-memory-scope:hover { background:var(--dm-bg); }
.dsh-memory-scope[aria-current=true] { background:var(--dm-soft); color:var(--dm-accent); }
.dsh-memory-scope-main { flex:1; min-width:0; overflow-wrap:anywhere; }
.dsh-memory-scope-label { display:block; font-weight:550; }
.dsh-memory-scope-note { display:block; font-size:10px; color:var(--dm-muted); margin-top:2px; }
.dsh-memory-count { font-size:11px; font-variant-numeric:tabular-nums; background:var(--dm-bg); border-radius:5px; padding:0 5px; color:var(--dm-muted); }
.dsh-memory-list-header { padding:14px; border-bottom:1px solid var(--dm-border); }
.dsh-memory-list-title { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:12px; }
.dsh-memory-list-title h2 { font-size:14px; font-weight:600; }
.dsh-memory-muted { color:var(--dm-muted); font-size:12px; }
.dsh-memory-search { width:100%; padding:8px 10px; border:1px solid var(--dm-border); border-radius:8px; background:var(--dm-bg); }
.dsh-memory-search-hint { font-size:10px; color:var(--dm-muted); margin:5px 0 12px!important; }
.dsh-memory-filters { display:flex; flex-wrap:wrap; gap:5px; }
.dsh-memory-filter { border:1px solid transparent; background:var(--dm-bg); border-radius:6px; padding:4px 7px; font-size:11px!important; }
.dsh-memory-filter[aria-pressed=true] { color:var(--dm-accent); background:var(--dm-soft); border-color:color-mix(in srgb,var(--dm-accent) 24%,transparent); }
.dsh-memory-entries { margin:0; padding:6px; list-style:none; max-height:70vh; overflow:auto; }
.dsh-memory-entry { width:100%; display:block; border:1px solid transparent; background:transparent; text-align:left; padding:13px 11px; border-radius:8px; margin-bottom:3px; }
.dsh-memory-entry:hover { background:var(--dm-bg); }
.dsh-memory-entry[aria-current=true] { background:var(--dm-soft); border-color:color-mix(in srgb,var(--dm-accent) 24%,transparent); }
.dsh-memory-entry-title { font-size:13px; font-weight:600; overflow-wrap:anywhere; }
.dsh-memory-excerpt { font-size:12px; color:var(--dm-muted); margin-top:5px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }
.dsh-memory-entry-meta { display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin-top:9px; font-size:10px; color:var(--dm-muted); }
.dsh-memory-badge { display:inline-block; padding:1px 6px; border-radius:4px; background:var(--dm-bg); color:var(--dm-muted); font-size:10px; font-weight:500; }
.dsh-memory-reference { color:var(--dm-accent); background:var(--dm-soft); }
.dsh-memory-entry-path { display:block; margin-top:7px; font-size:10px; color:var(--dm-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dsh-memory-detail { display:flex; flex-direction:column; }
.dsh-memory-detail-head { padding:17px 18px; border-bottom:1px solid var(--dm-border); }
.dsh-memory-detail-topline { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.dsh-memory-detail-title { font-size:17px; font-weight:650; line-height:1.5; overflow-wrap:anywhere; margin-bottom:8px!important; }
.dsh-memory-detail-meta { display:flex; flex-wrap:wrap; gap:6px; color:var(--dm-muted); font-size:11px; overflow-wrap:anywhere; }
.dsh-memory-detail-actions { margin-top:14px; }
.dsh-memory-detail-body { padding:18px; min-width:0; overflow:auto; }
.dsh-memory-content { margin:0; font:inherit; line-height:1.8; white-space:pre-wrap; overflow-wrap:anywhere; tab-size:2; }
.dsh-memory-detail-path { color:var(--dm-muted); font:11px/1.5 ui-monospace,monospace; overflow-wrap:anywhere; margin:12px 0 0!important; }
.dsh-memory-empty { min-height:230px; padding:34px 22px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:10px; text-align:center; color:var(--dm-muted); }
.dsh-memory-empty-icon { font-size:30px; color:var(--dm-accent); opacity:.65; margin-bottom:4px; }
.dsh-memory-empty strong { color:var(--dm-text); font-weight:550; }
.dsh-memory-notice { padding:10px 12px; border:1px solid var(--dm-border); background:var(--dm-card); border-radius:8px; margin-bottom:12px; font-size:12px; overflow-wrap:anywhere; }
.dsh-memory-error { color:var(--dm-danger); border-color:color-mix(in srgb,var(--dm-danger) 35%,var(--dm-border)); }
.dsh-memory-warning { background:var(--dm-soft); }
.dsh-memory-capacity { border-top:1px solid var(--dm-border); margin-top:15px; padding:13px 8px 0; font-size:10px; color:var(--dm-muted); line-height:1.8; }
.dsh-memory-form { display:flex; flex-direction:column; gap:14px; }
.dsh-memory-field { display:flex; flex-direction:column; gap:5px; font-size:12px; font-weight:550; }
.dsh-memory-field-head { display:flex; justify-content:space-between; gap:8px; }
.dsh-memory-field small { color:var(--dm-muted); font-size:10px; font-weight:400; }
.dsh-memory-field input,.dsh-memory-field textarea,.dsh-memory-field select { background:var(--dm-card); border:1px solid var(--dm-border); border-radius:7px; padding:8px 9px; width:100%; font-weight:400; min-width:0; }
.dsh-memory-field textarea { min-height:230px; resize:vertical; line-height:1.7; }
.dsh-memory-fields-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.dsh-memory-back { display:none; }
.dsh-memory-footer-note { margin-top:12px!important; font-size:10px; color:var(--dm-muted); }
.dsh-memory-settings .dsh-memory-workbench { grid-template-columns:160px minmax(0,1fr); min-height:440px; }
.dsh-memory-settings .dsh-memory-detail { display:none; }
.dsh-memory-settings .dsh-memory-has-detail .dsh-memory-detail { display:flex; }
.dsh-memory-settings .dsh-memory-has-detail .dsh-memory-list { display:none; }
.dsh-memory-settings .dsh-memory-back { display:inline-block; }
@container (max-width:1000px) { .dsh-memory-workbench { grid-template-columns:160px minmax(0,1fr); } .dsh-memory-detail { display:none; } .dsh-memory-has-detail .dsh-memory-detail { display:flex; } .dsh-memory-has-detail .dsh-memory-list { display:none; } .dsh-memory-back { display:inline-block; } }
@container (max-width:580px) { .dsh-memory-header { align-items:flex-start; flex-direction:column; gap:10px; } .dsh-memory-overview { gap:6px; } .dsh-memory-stat { padding:12px 9px; gap:5px; } .dsh-memory-stat-icon { display:none; } .dsh-memory-stat-value { font-size:23px; } .dsh-memory-stat-label { font-size:10px; } .dsh-memory-workbench,.dsh-memory-settings .dsh-memory-workbench { display:flex; flex-direction:column; min-height:0; } .dsh-memory-nav { width:100%; padding:10px; } .dsh-memory-scope-list { display:flex; gap:4px; overflow:auto; } .dsh-memory-scope { width:auto; min-width:110px; max-width:190px; flex-shrink:0; margin:0; padding:8px; } .dsh-memory-eyebrow,.dsh-memory-nav-group { display:none; } .dsh-memory-capacity { padding:8px 0 0; margin-top:8px; } .dsh-memory-fields-row { grid-template-columns:1fr; } .dsh-memory-detail-head,.dsh-memory-detail-body { padding:14px; } .dsh-memory-entries { max-height:none; } }
@media (prefers-reduced-motion:no-preference) { .dsh-memory-button,.dsh-memory-entry,.dsh-memory-scope { transition:background 100ms ease; } }
`
