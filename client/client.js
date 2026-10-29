window.__ModuleLoader__.load({
	id: "@fooxe/dsh-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/model.ts
		/** Match the existing HTTP id contract, including index rows ending in .md. */
		function normalizeId(id) {
			return id.replace(/\.md$/, "");
		}
		function scopeKey(target) {
			return JSON.stringify([target.scope, target.scope === "project" ? target.workspace ?? "" : ""]);
		}
		function entryKey(target, id) {
			return JSON.stringify([
				target.scope,
				target.scope === "project" ? target.workspace ?? "" : "",
				normalizeId(id)
			]);
		}
		function scopesOf(data) {
			const user = data.scopes.user;
			const target = { scope: "user" };
			return [{
				key: scopeKey(target),
				label: "用户记忆",
				target,
				available: user?.available === true,
				nested: false,
				serviceAnchor: false,
				stats: user?.stats,
				entries: user?.entries ?? []
			}, ...(data.scopes.projects ?? []).map((ws) => {
				const target = {
					scope: "project",
					workspace: ws.root
				};
				return {
					key: scopeKey(target),
					label: ws.name || ws.root,
					target,
					available: true,
					nested: ws.nested === true,
					serviceAnchor: ws.serviceAnchor,
					stats: ws.stats,
					entries: ws.entries
				};
			})];
		}
		function entriesOf(scopes) {
			const seen = /* @__PURE__ */ new Set();
			return scopes.flatMap((scope) => scope.entries.flatMap((entry, index) => {
				const id = entry.id === void 0 ? void 0 : normalizeId(entry.id);
				const key = id === void 0 ? JSON.stringify([
					scope.key,
					"index-row",
					index
				]) : entryKey(scope.target, id);
				if (seen.has(key)) return [];
				seen.add(key);
				return [{
					...entry,
					id,
					key,
					target: scope.target,
					scopeLabel: scope.label,
					readOnly: !scope.available || scope.nested || id === void 0 || !/^[a-zA-Z0-9\u4e00-\u9fff_-]+$/.test(id)
				}];
			}));
		}
		function filterEntries(entries, scope, kind, query) {
			const q = query.trim().toLocaleLowerCase();
			return entries.filter((entry) => {
				if (scope !== "all" && scopeKey(entry.target) !== scope) return false;
				if (kind !== "all" && (entry.kind ?? (entry.id === void 0 ? void 0 : "memory")) !== kind) return false;
				return q === "" || [
					entry.title,
					entry.excerpt,
					entry.path,
					...entry.tags
				].some((value) => value.toLocaleLowerCase().includes(q));
			});
		}
		function countKinds(entries) {
			return {
				all: entries.length,
				memory: entries.filter((entry) => entry.kind === "memory" || entry.kind === void 0 && entry.id !== void 0).length,
				reference: entries.filter((entry) => entry.kind === "reference").length
			};
		}
		function draftOf(detail, target) {
			return {
				title: detail.title,
				content: detail.content,
				kind: detail.kind,
				tags: detail.tags.join(", "),
				path: detail.path,
				target: { ...target }
			};
		}
		function validateDraft(draft) {
			const errors = [];
			const title = draft.title.trim();
			const content = draft.content.trim();
			if (title === "") errors.push("请填写标题。");
			if (title.length > 60) errors.push("标题超过 60 个字符；原文已保留，请缩短标题或在外部编辑。");
			if (content === "") errors.push("请填写正文。");
			if (content.length > 2e4) errors.push("正文超过 20000 个字符；原文已保留，请在外部编辑或明确缩短后保存。");
			if (draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean).length > 10) errors.push("标签最多 10 个，请减少标签后保存。");
			if (draft.target.scope === "project" && !draft.target.workspace) errors.push("请选择已登记的目标项目。");
			return errors;
		}
		/** Exact comparison protects unfinished typing, including whitespace edits. */
		function dirtyDraft(draft, original) {
			return draft.title !== original.title || draft.content !== original.content || draft.kind !== original.kind || draft.tags !== original.tags || draft.path !== original.path || scopeKey(draft.target) !== scopeKey(original.target);
		}
		//#endregion
		//#region src/client/api.ts
		const PREFIX = "/dsh-memory/api/v1";
		async function request(endpoint, body, signal) {
			const response = await fetch(`${PREFIX}/${endpoint}`, {
				method: body === void 0 ? "GET" : "POST",
				credentials: "same-origin",
				headers: body === void 0 ? void 0 : { "content-type": "application/json" },
				body: body === void 0 ? void 0 : JSON.stringify(body),
				signal
			});
			let result;
			try {
				result = await response.json();
			} catch (error) {
				if (signal?.aborted || error instanceof Error && error.name === "AbortError") throw error;
				throw new Error(`服务未返回有效 JSON（HTTP ${response.status}）。请检查 Memory 服务并重试。`);
			}
			const envelope = result;
			if (!response.ok || envelope === null || typeof envelope !== "object" || endpoint !== "list" && envelope.ok !== true) {
				const message = typeof envelope?.error === "string" ? envelope.error : `请求失败（HTTP ${response.status}）`;
				throw new Error(message);
			}
			if (endpoint === "list") {
				const scopes = envelope.scopes;
				if (scopes === null || typeof scopes !== "object" || Array.isArray(scopes) || scopes.projects !== void 0 && !Array.isArray(scopes.projects)) throw new Error("Memory 列表格式无效，请刷新重试。");
			}
			if (endpoint === "read") {
				const detail = envelope;
				if (typeof detail.id !== "string" || typeof detail.title !== "string" || typeof detail.content !== "string" || typeof detail.path !== "string" || !Array.isArray(detail.tags) || !detail.tags.every((tag) => typeof tag === "string") || detail.kind !== "memory" && detail.kind !== "reference") throw new Error("Memory 正文格式无效；未进入编辑，请重试。");
			}
			return result;
		}
		function identity(target, id) {
			return {
				scope: target.scope,
				...target.scope === "project" ? { workspace: target.workspace } : {},
				id: normalizeId(id)
			};
		}
		function fields(draft) {
			const errors = validateDraft(draft);
			if (errors.length > 0) throw new Error(errors.join("\n"));
			return {
				title: draft.title,
				content: draft.content,
				kind: draft.kind,
				tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
				path: draft.path.trim()
			};
		}
		const memoryApi = {
			list(signal) {
				return request("list", void 0, signal);
			},
			read(target, id, signal) {
				return request("read", identity(target, id), signal);
			},
			async save(draft, signal) {
				return request("save", {
					...fields(draft),
					scope: draft.target.scope,
					...draft.target.scope === "project" ? { workspace: draft.target.workspace } : {}
				}, signal);
			},
			async update(target, id, draft, signal) {
				return request("update", {
					...identity(target, id),
					...fields(draft),
					targetScope: draft.target.scope,
					...draft.target.scope === "project" ? { targetWorkspace: draft.target.workspace } : {}
				}, signal);
			},
			delete(target, id, signal) {
				return request("delete", identity(target, id), signal);
			}
		};
		//#endregion
		//#region src/client/Overview.ts
		function percent(value, total) {
			return total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
		}
		const number = (n) => n.toLocaleString();
		const percentText = (n, total) => `${percent(n, total).toFixed(1)}%`;
		function LineIcon({ type }) {
			return (0, react.createElement)("svg", {
				width: 22,
				height: 22,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.6,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true
			}, (0, react.createElement)("path", { d: {
				folder: "M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3Z",
				user: "M16 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
				file: "M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h6",
				book: "M4 4h16v17l-8-4-8 4Z"
			}[type] }));
		}
		/** Binary area subdivision: unlike equal-sized cards, every nonzero tile has exact count-proportional area. */
		function scopeTiles(items) {
			const positive = items.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
			function split(rows, x, y, width, height) {
				if (rows.length === 0) return [];
				if (rows.length === 1) return [{
					key: rows[0].key,
					x,
					y,
					width,
					height
				}];
				const total = rows.reduce((sum, row) => sum + row.count, 0);
				let cut = 1, sum = rows[0].count;
				while (cut < rows.length - 1 && Math.abs(sum + rows[cut].count - total / 2) < Math.abs(sum - total / 2)) sum += rows[cut++].count;
				const ratio = sum / total;
				return width >= height ? [...split(rows.slice(0, cut), x, y, width * ratio, height), ...split(rows.slice(cut), x + width * ratio, y, width * (1 - ratio), height)] : [...split(rows.slice(0, cut), x, y, width, height * ratio), ...split(rows.slice(cut), x, y + height * ratio, width, height * (1 - ratio))];
			}
			return split(positive, 0, 0, 100, 100);
		}
		function Overview({ scopes, entries, disabled, chart, setChart, filter, setFilter, onOpen, onCreate }) {
			const counts = countKinds(entries);
			const unknown = counts.all - counts.memory - counts.reference;
			const rows = scopes.map((scope) => ({
				...scope,
				rows: entries.filter((entry) => scopeKey(entry.target) === scope.key)
			}));
			const sorted = [...rows].sort((a, b) => b.rows.length - a.rows.length);
			const max = Math.max(0, ...sorted.map((item) => item.rows.length));
			const tiles = scopeTiles(sorted.map((item) => ({
				key: item.key,
				count: item.rows.length
			})));
			const m = percent(counts.memory, counts.all), r = percent(counts.reference, counts.all);
			const open = (key, kind = "all") => onOpen(key, kind);
			return (0, react.createElement)("div", { className: "dm-dashboard" }, (0, react.createElement)("div", { className: "dm-charts" }, (0, react.createElement)("section", {
				className: "dsh-memory-card dm-chart",
				"aria-label": "范围分布"
			}, (0, react.createElement)("div", { className: "dm-section-head" }, (0, react.createElement)("h2", null, "范围分布"), (0, react.createElement)("div", {
				className: "dm-segment",
				"aria-label": "分布显示方式"
			}, ...["bar", "map"].map((value) => (0, react.createElement)("button", {
				type: "button",
				key: value,
				"aria-pressed": chart === value,
				onClick: () => setChart(value)
			}, value === "bar" ? "条形图" : "色块图")))), chart === "bar" ? (0, react.createElement)("div", { className: "dm-bars" }, sorted.map((item) => (0, react.createElement)("button", {
				type: "button",
				key: item.key,
				className: "dm-bar-row",
				disabled,
				title: `${item.label} · ${item.target.workspace ?? "跨项目偏好"}`,
				onClick: () => open(item.key),
				"aria-label": `${item.label}，${item.rows.length} 条，查看记录`
			}, (0, react.createElement)("span", { className: "dm-bar-label" }, item.label), (0, react.createElement)("span", {
				className: "dm-bar-track",
				"aria-hidden": true
			}, (0, react.createElement)("span", {
				className: item.target.scope === "user" ? "dm-bar-fill dm-user-fill" : "dm-bar-fill",
				style: { width: `${percent(item.rows.length, max)}%` }
			})), (0, react.createElement)("span", { className: "dm-tabular" }, number(item.rows.length))))) : (0, react.createElement)("div", null, counts.all === 0 ? (0, react.createElement)("p", { className: "dm-map-empty" }, "暂无记录，保存后即可查看分布") : (0, react.createElement)("div", {
				className: "dm-map",
				"aria-label": "色块面积表示记录数量"
			}, tiles.map((tile, i) => {
				const item = rows.find((row) => row.key === tile.key);
				return (0, react.createElement)("button", {
					key: tile.key,
					type: "button",
					className: `dm-map-tile dm-map-color-${i % 4}`,
					disabled,
					onClick: () => open(item.key),
					style: {
						left: `${tile.x}%`,
						top: `${tile.y}%`,
						width: `${tile.width}%`,
						height: `${tile.height}%`
					},
					title: `${item.label} · ${item.rows.length} 条`,
					"aria-label": `${item.label}，${item.rows.length} 条，查看记录`
				}, (0, react.createElement)("strong", null, item.label), (0, react.createElement)("span", null, `${item.rows.length} 条`));
			})), (0, react.createElement)("p", { className: "dsh-memory-muted dm-map-note" }, "色块面积表示记录数量；空范围列在下方卡片中。"))), (0, react.createElement)("section", {
				className: "dsh-memory-card dm-chart",
				"aria-label": "用途占比"
			}, (0, react.createElement)("div", { className: "dm-section-head" }, (0, react.createElement)("h2", null, "用途占比")), (0, react.createElement)("div", { className: "dm-type-chart" }, (0, react.createElement)("div", {
				className: "dm-donut",
				role: "img",
				"aria-label": `全部 ${counts.all} 条，长期记忆 ${counts.memory} 条，历史资料 ${counts.reference} 条${unknown ? `，未分类 ${unknown} 条` : ""}`,
				style: { background: counts.all ? `conic-gradient(var(--dm-memory) 0% ${m}%,var(--dm-reference) ${m}% ${m + r}%,var(--dm-track) ${m + r}% 100%)` : "var(--dm-track)" }
			}, (0, react.createElement)("div", null, (0, react.createElement)("strong", null, number(counts.all)), (0, react.createElement)("span", null, "全部记录"))), (0, react.createElement)("div", { className: "dm-legend" }, ["memory", "reference"].map((kind) => (0, react.createElement)("button", {
				type: "button",
				key: kind,
				disabled,
				onClick: () => open("all", kind)
			}, (0, react.createElement)("i", {
				className: `dm-dot dm-${kind}`,
				"aria-hidden": true
			}), (0, react.createElement)("span", null, kind === "memory" ? "长期记忆" : "历史资料"), (0, react.createElement)("strong", null, number(counts[kind])), (0, react.createElement)("span", null, percentText(counts[kind], counts.all)))), unknown > 0 ? (0, react.createElement)("span", { className: "dsh-memory-muted" }, `未分类 ${unknown} 条`) : null)))), (0, react.createElement)("section", {
				className: "dm-spaces",
				"aria-label": "记忆空间"
			}, (0, react.createElement)("div", { className: "dm-section-head dm-space-head" }, (0, react.createElement)("h2", null, "记忆空间"), (0, react.createElement)("div", {
				className: "dm-segment",
				"aria-label": "空间范围"
			}, ...[
				"all",
				"user",
				"project"
			].map((value) => (0, react.createElement)("button", {
				key: value,
				type: "button",
				"aria-pressed": filter === value,
				onClick: () => setFilter(value)
			}, value === "all" ? "全部范围" : value === "user" ? "用户记忆" : "项目记忆"))), (0, react.createElement)("button", {
				type: "button",
				className: "dm-text-button",
				disabled,
				onClick: () => open("all")
			}, "查看全部记录 →")), (0, react.createElement)("div", { className: "dm-space-grid" }, rows.filter((item) => filter === "all" || item.target.scope === filter).map((item) => {
				const c = countKinds(item.rows), stats = item.stats;
				const capacity = stats === void 0 ? null : percent(stats.indexBytes, stats.maxBytes);
				return (0, react.createElement)("article", {
					key: item.key,
					className: "dsh-memory-card dm-space-card"
				}, (0, react.createElement)("button", {
					type: "button",
					className: "dm-space-title",
					disabled,
					onClick: () => open(item.key),
					title: item.target.workspace ?? "跨项目偏好"
				}, (0, react.createElement)(LineIcon, { type: item.target.scope === "user" ? "user" : "folder" }), (0, react.createElement)("h3", null, item.label), (0, react.createElement)("strong", { className: "dm-tabular" }, `${c.all} 条`)), !item.available || item.nested ? (0, react.createElement)("p", { className: "dm-scope-status" }, !item.available ? "暂不可用" : "嵌套范围 · 只读摘要") : null, (0, react.createElement)("div", {
					className: "dm-composition",
					"aria-hidden": true
				}, (0, react.createElement)("span", {
					className: "dm-memory",
					style: { width: `${percent(c.memory, c.all)}%` }
				}), (0, react.createElement)("span", {
					className: "dm-reference",
					style: { width: `${percent(c.reference, c.all)}%` }
				})), (0, react.createElement)("div", { className: "dm-kind-counts" }, (0, react.createElement)("span", null, (0, react.createElement)("i", {
					className: "dm-dot dm-memory",
					"aria-hidden": true
				}), `长期记忆 ${c.memory}`), (0, react.createElement)("span", null, (0, react.createElement)("i", {
					className: "dm-dot dm-reference",
					"aria-hidden": true
				}), `历史资料 ${c.reference}`), c.all > c.memory + c.reference ? (0, react.createElement)("span", null, `未分类 ${c.all - c.memory - c.reference}`) : null), (0, react.createElement)("div", { className: "dm-previews" }, c.all === 0 ? (0, react.createElement)("div", { className: "dm-card-empty" }, (0, react.createElement)(LineIcon, { type: "file" }), (0, react.createElement)("span", null, item.available ? "暂无记忆" : "此范围暂不可用"), item.available && !item.nested ? (0, react.createElement)("button", {
					type: "button",
					className: "dm-text-button",
					disabled,
					onClick: () => onCreate(item.key)
				}, "新增第一条记录") : null) : item.rows.slice(0, 2).map((entry) => (0, react.createElement)("div", {
					className: "dm-preview",
					key: entry.key,
					title: entry.excerpt || entry.title
				}, (0, react.createElement)(LineIcon, { type: "file" }), (0, react.createElement)("span", { className: "dm-preview-copy" }, (0, react.createElement)("span", { className: "dm-preview-title" }, entry.title), entry.excerpt ? (0, react.createElement)("small", { className: "dm-preview-excerpt" }, entry.excerpt) : null), entry.tags[0] ? (0, react.createElement)("span", { className: "dm-preview-tag" }, entry.tags[0]) : null))), (0, react.createElement)("div", { className: "dm-card-footer" }, (0, react.createElement)("div", {
					className: "dm-capacity",
					title: stats ? `索引行 ${stats.entries} / ${stats.maxEntries}；文件 ${stats.memoryFiles} / ${stats.maxMemories}（含历史资料）` : void 0
				}, (0, react.createElement)("span", null, stats ? `索引 ${(stats.indexBytes / 1024).toFixed(1)} / ${(stats.maxBytes / 1024).toFixed(0)} KB` : "容量暂不可用"), capacity === null ? null : (0, react.createElement)("div", {
					className: `dm-capacity-track${capacity >= 90 ? " dm-capacity-warning" : ""}`,
					role: "progressbar",
					"aria-label": `${item.label}索引容量`,
					"aria-valuenow": stats.indexBytes,
					"aria-valuemin": 0,
					"aria-valuemax": Math.max(stats.maxBytes, stats.indexBytes),
					"aria-valuetext": `${stats.indexBytes} / ${stats.maxBytes} 字节`
				}, (0, react.createElement)("span", { style: { width: `${capacity}%` } }))), (0, react.createElement)("button", {
					type: "button",
					className: "dm-text-button",
					disabled,
					onClick: () => open(item.key)
				}, "查看记录 →")));
			}))));
		}
		//#endregion
		//#region src/client/styles.ts
		/** Local styles only: no host body, composer or generic theme mutations. */
		const memoryStyles = `
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

/* Global dashboard: use the host's theme and keep all body reads in the detail view. */
.dsh-memory { --dm-memory:#0d9fa6; --dm-reference:#8b65d8; --dm-project:#438ee8; --dm-track:color-mix(in srgb,var(--dm-muted) 12%,var(--dm-card)); }
.dm-overview-four { grid-template-columns:repeat(4,minmax(0,1fr)); }
.dsh-memory-workbench { grid-template-columns:180px minmax(0,1fr); }
.dsh-memory-workbench.dsh-memory-has-detail { grid-template-columns:180px minmax(260px,.9fr) minmax(320px,1.25fr); }
.dsh-memory-settings .dsh-memory-workbench.dsh-memory-has-detail { grid-template-columns:160px minmax(0,1fr); }
.dsh-memory-back { display:inline-block; }
.dm-page-nav { display:flex; gap:6px; margin:0 0 14px; }
.dm-page-nav [aria-current=page] { background:var(--dm-soft); color:var(--dm-accent); border-color:transparent; }
.dm-global-search { display:flex; gap:6px; }
.dm-global-search input { width:clamp(180px,23vw,360px); min-width:0; border:1px solid var(--dm-border); border-radius:8px; background:var(--dm-card); padding:8px 10px; }
.dm-charts { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr); gap:14px; margin-bottom:20px; }
.dm-chart { padding:18px; }
.dm-section-head { display:flex; align-items:center; gap:14px; justify-content:space-between; margin-bottom:16px; }
.dm-section-head h2 { margin:0; font-size:16px; font-weight:650; }
.dm-segment { display:flex; flex-wrap:wrap; gap:4px; }
.dm-segment button { background:transparent; border:1px solid var(--dm-border); border-radius:7px; padding:5px 10px; color:var(--dm-muted); white-space:nowrap; }
.dm-segment button[aria-pressed=true] { background:var(--dm-soft); color:var(--dm-accent); border-color:color-mix(in srgb,var(--dm-accent) 30%,var(--dm-border)); }
.dm-bars { max-height:250px; overflow:auto; padding-right:4px; }
.dm-bar-row { width:100%; display:grid; grid-template-columns:minmax(90px,145px) minmax(0,1fr) 40px; align-items:center; gap:12px; border:0; background:transparent; padding:7px 0; text-align:left; }
.dm-bar-row:hover { color:var(--dm-accent); }
.dm-bar-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dm-bar-track { display:block; height:14px; background:var(--dm-track); border-radius:4px; overflow:hidden; }
.dm-bar-fill { display:block; height:100%; background:var(--dm-project); border-radius:4px; }
.dm-user-fill { background:var(--dm-memory); }
.dm-tabular { font-variant-numeric:tabular-nums; }
.dm-map { height:230px; position:relative; border-radius:8px; overflow:hidden; background:var(--dm-track); }
.dm-map-tile { position:absolute; border:2px solid var(--dm-card); padding:8px; display:flex; flex-direction:column; justify-content:center; gap:4px; overflow:hidden; text-align:left; color:var(--dm-text); }
.dm-map-tile strong,.dm-map-tile span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dm-map-color-0 { background:color-mix(in srgb,var(--dm-memory) 25%,var(--dm-card)); }
.dm-map-color-1 { background:color-mix(in srgb,var(--dm-project) 25%,var(--dm-card)); }
.dm-map-color-2 { background:color-mix(in srgb,var(--dm-reference) 25%,var(--dm-card)); }
.dm-map-color-3 { background:color-mix(in srgb,var(--dm-accent) 25%,var(--dm-card)); }
.dm-map-tile:hover { filter:brightness(.96); }
.dm-map-empty { min-height:190px; display:grid; place-content:center; color:var(--dm-muted); }
.dm-map-note { margin:8px 0 0!important; font-size:11px; }
.dm-type-chart { min-height:210px; display:flex; align-items:center; justify-content:center; gap:24px; flex-wrap:wrap; }
.dm-donut { width:160px; height:160px; border-radius:50%; display:grid; place-items:center; flex-shrink:0; }
.dm-donut>div { width:112px; height:112px; border-radius:50%; background:var(--dm-card); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
.dm-donut strong { font-size:29px; font-variant-numeric:tabular-nums; }
.dm-donut span { font-size:12px; color:var(--dm-muted); }
.dm-legend { display:flex; flex-direction:column; gap:15px; }
.dm-legend button { display:flex; gap:10px; align-items:center; border:0; padding:3px; background:transparent; }
.dm-legend button:hover { color:var(--dm-accent); }
.dm-legend button>span:last-child { color:var(--dm-muted); font-variant-numeric:tabular-nums; min-width:42px; }
.dm-dot { display:inline-block; width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.dm-memory { background:var(--dm-memory); }
.dm-reference { background:var(--dm-reference); }
.dm-space-head { justify-content:flex-start; flex-wrap:wrap; }
.dm-space-head>.dm-text-button { margin-left:auto; }
.dm-space-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.dm-space-card { padding:16px; display:flex; flex-direction:column; transition:border-color .15s,box-shadow .15s; }
.dm-space-card:hover { border-color:color-mix(in srgb,var(--dm-accent) 35%,var(--dm-border)); box-shadow:0 3px 12px color-mix(in srgb,var(--dm-text) 5%,transparent); }
.dm-space-title { display:flex; align-items:center; gap:10px; padding:0; border:0; background:none; text-align:left; width:100%; margin-bottom:12px; }
.dm-space-title svg { color:var(--dm-accent); flex-shrink:0; }
.dm-space-title h3 { flex:1; min-width:0; font-size:14px; font-weight:650; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dm-space-title>strong { font-size:12px; white-space:nowrap; }
.dm-scope-status { margin:-4px 0 8px!important; color:var(--dm-muted); font-size:11px; }
.dm-composition { height:6px; border-radius:4px; overflow:hidden; display:flex; background:var(--dm-track); }
.dm-composition span { height:100%; }
.dm-kind-counts { display:flex; flex-wrap:wrap; gap:12px; margin:8px 0 12px; font-size:11px; color:var(--dm-muted); }
.dm-kind-counts>span { display:flex; align-items:center; gap:5px; }
.dm-previews { min-height:65px; margin-bottom:12px; flex:1; }
.dm-preview { display:flex; align-items:center; gap:7px; min-width:0; padding:4px 0; }
.dm-preview svg { width:14px; height:14px; flex-shrink:0; color:var(--dm-muted); }
.dm-preview-copy { flex:1; min-width:0; }
.dm-preview-excerpt { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dm-muted); font-size:10px; }
.dm-preview-title { display:block; min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
.dm-preview-tag { max-width:28%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:1px 5px; font-size:10px; border-radius:4px; color:var(--dm-accent); background:var(--dm-soft); }
.dm-card-empty { display:flex; flex-wrap:wrap; min-height:65px; align-items:center; justify-content:center; gap:8px; color:var(--dm-muted); background:var(--dm-bg); border-radius:6px; }
.dm-card-footer { display:flex; align-items:flex-end; gap:12px; }
.dm-capacity { flex:1; min-width:0; font-size:10px; color:var(--dm-muted); }
.dm-capacity-track { height:5px; background:var(--dm-track); border-radius:5px; overflow:hidden; margin-top:5px; }
.dm-capacity-track>span { display:block; height:100%; background:var(--dm-memory); }
.dm-capacity-warning>span { background:var(--dm-danger); }
.dm-text-button { border:0; padding:0; color:var(--dm-accent); background:transparent; white-space:nowrap; font-size:12px; }
.dsh-memory button:focus-visible,.dsh-memory input:focus-visible { outline:2px solid var(--dm-accent); outline-offset:3px; }
@container (max-width:1100px) { .dm-space-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .dm-type-chart { gap:16px; } .dm-donut { width:132px; height:132px; } .dm-donut>div { width:92px; height:92px; } }
@container (max-width:1000px) { .dsh-memory-workbench.dsh-memory-has-detail { grid-template-columns:160px minmax(0,1fr); } .dm-global-search input { width:180px; } }
@container (max-width:800px) { .dm-charts { grid-template-columns:1fr; } .dm-overview-four { grid-template-columns:repeat(2,minmax(0,1fr)); } .dm-type-chart { min-height:150px; } .dsh-memory-header { flex-wrap:wrap; } .dm-global-search { flex:1; } .dm-global-search input { flex:1; width:100%; } }
@container (max-width:580px) { .dm-space-grid { grid-template-columns:1fr; } .dm-chart { padding:14px; } .dm-section-head { flex-wrap:wrap; gap:10px; } .dm-bar-row { grid-template-columns:100px minmax(0,1fr) 30px; gap:8px; } .dsh-memory-header>.dsh-memory-actions { width:100%; flex-wrap:wrap; } .dm-global-search { flex-basis:100%; } }
`;
		//#endregion
		//#region src/client/MemoryPanel.ts
		const kindLabel = (kind) => kind === "reference" ? "历史资料" : "长期记忆";
		const errorText = (error) => error instanceof Error ? error.message : String(error);
		const cancelled = (error) => error instanceof Error && error.name === "AbortError";
		const button = (label, onClick, props = {}) => (0, react.createElement)("button", {
			type: "button",
			className: "dsh-memory-button",
			onClick,
			...props
		}, label);
		const suspendedDrafts = /* @__PURE__ */ new Map();
		function MemoryPanel({ mode = "settings" }) {
			const [recovered] = (0, react.useState)(() => suspendedDrafts.get(mode));
			const [data, setData] = (0, react.useState)(recovered?.data ?? null);
			const [listLoading, setListLoading] = (0, react.useState)(true);
			const [listError, setListError] = (0, react.useState)(null);
			const [view, setView] = (0, react.useState)(recovered !== void 0 || mode === "settings" ? "records" : "overview");
			const [chart, setChart] = (0, react.useState)("bar");
			const [spaceFilter, setSpaceFilter] = (0, react.useState)("all");
			const [overviewQuery, setOverviewQuery] = (0, react.useState)("");
			const [scope, setScope] = (0, react.useState)(recovered?.scope ?? "all");
			const [kind, setKind] = (0, react.useState)(recovered?.kind ?? "all");
			const [query, setQuery] = (0, react.useState)(recovered?.query ?? "");
			const [selected, setSelected] = (0, react.useState)(recovered?.selected ?? null);
			const [detail, setDetail] = (0, react.useState)(recovered?.detail ?? null);
			const [detailLoading, setDetailLoading] = (0, react.useState)(false);
			const [detailError, setDetailError] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)(recovered?.draft ?? null);
			const [original, setOriginal] = (0, react.useState)(recovered?.original ?? null);
			const [editing, setEditing] = (0, react.useState)(recovered !== void 0);
			const [creating, setCreating] = (0, react.useState)(recovered?.creating ?? false);
			const [busy, setBusy] = (0, react.useState)(recovered?.pending !== void 0);
			const [formError, setFormError] = (0, react.useState)(recovered?.error ?? null);
			const [notice, setNotice] = (0, react.useState)(recovered === void 0 ? null : "已恢复本页尚未提交的草稿。刷新浏览器后不会保留。");
			const listRequest = (0, react.useRef)({ generation: 0 });
			const readRequest = (0, react.useRef)({ generation: 0 });
			const alive = (0, react.useRef)(true);
			const busyRef = (0, react.useRef)(recovered?.pending !== void 0);
			const focusList = (0, react.useRef)(false);
			const detailHeading = (0, react.useRef)(null);
			const searchInput = (0, react.useRef)(null);
			const titleInput = (0, react.useRef)(null);
			const loadList = (0, react.useCallback)(async () => {
				listRequest.current.controller?.abort();
				const controller = new AbortController();
				const generation = ++listRequest.current.generation;
				listRequest.current.controller = controller;
				setListLoading(true);
				setListError(null);
				try {
					const next = await memoryApi.list(controller.signal);
					if (!alive.current || generation !== listRequest.current.generation) return null;
					setData(next);
					return next;
				} catch (error) {
					if (alive.current && generation === listRequest.current.generation && !cancelled(error)) setListError(errorText(error));
					return null;
				} finally {
					if (alive.current && generation === listRequest.current.generation) setListLoading(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				alive.current = true;
				loadList();
				return () => {
					alive.current = false;
					++listRequest.current.generation;
					++readRequest.current.generation;
					listRequest.current.controller?.abort();
					readRequest.current.controller?.abort();
				};
			}, [loadList]);
			const dirty = editing && draft !== null && original !== null && dirtyDraft(draft, original);
			(0, react.useEffect)(() => {
				if (busy) return;
				if (dirty && draft !== null && original !== null) suspendedDrafts.set(mode, {
					data,
					selected,
					detail,
					draft,
					original,
					creating,
					scope,
					kind,
					query,
					error: formError ?? void 0
				});
				else suspendedDrafts.delete(mode);
			}, [
				mode,
				data,
				dirty,
				busy,
				selected,
				detail,
				draft,
				original,
				creating,
				scope,
				kind,
				query,
				formError
			]);
			(0, react.useEffect)(() => {
				if (recovered?.pending === void 0) return;
				recovered.pending.then(() => {
					if (!alive.current) return;
					busyRef.current = false;
					setBusy(false);
					if (suspendedDrafts.get(mode) === recovered) setFormError(recovered.error ?? "上次保存未完成，草稿已保留。请核对后重试。");
					else {
						resetDetail();
						setNotice("离开页面期间保存已完成，列表已刷新。");
						loadList();
					}
				});
			}, [
				mode,
				recovered,
				loadList
			]);
			(0, react.useEffect)(() => {
				if (focusList.current && selected === null && !creating) {
					focusList.current = false;
					searchInput.current?.focus();
				}
			}, [selected, creating]);
			(0, react.useEffect)(() => {
				if (!dirty && !busy) return;
				const warn = (event) => {
					event.preventDefault();
					event.returnValue = "";
				};
				window.addEventListener("beforeunload", warn);
				return () => window.removeEventListener("beforeunload", warn);
			}, [dirty, busy]);
			(0, react.useEffect)(() => {
				if (editing) titleInput.current?.focus();
				else if (selected !== null) detailHeading.current?.focus();
			}, [editing, selected?.key]);
			const scopes = data === null ? [] : scopesOf(data);
			const entries = entriesOf(scopes);
			const counts = countKinds(entries);
			const scopedEntries = filterEntries(entries, scope, "all", "");
			const categoryCounts = countKinds(scopedEntries);
			const visible = filterEntries(entries, scope, kind, query);
			const activeScope = scopes.find((item) => item.key === scope);
			const targets = scopes.filter((item) => item.available && !item.nested);
			const defaultTarget = activeScope !== void 0 ? activeScope : targets.find((item) => item.target.scope === "user") ?? targets[0];
			const canCreate = defaultTarget !== void 0 && defaultTarget.available && !defaultTarget.nested;
			const hasDetail = selected !== null || creating;
			function mayLeave() {
				if (busyRef.current) return false;
				return !dirty || window.confirm("有尚未保存的修改。放弃草稿并继续？");
			}
			function resetDetail() {
				readRequest.current.controller?.abort();
				++readRequest.current.generation;
				setSelected(null);
				setDetail(null);
				setDetailLoading(false);
				setDetailError(null);
				setDraft(null);
				setOriginal(null);
				setEditing(false);
				setCreating(false);
				setFormError(null);
			}
			async function readEntry(entry) {
				readRequest.current.controller?.abort();
				const generation = ++readRequest.current.generation;
				setSelected(entry);
				setCreating(false);
				setEditing(false);
				setDraft(null);
				setOriginal(null);
				setDetail(null);
				setDetailError(null);
				setFormError(null);
				if (entry.readOnly || entry.id === void 0) {
					setDetailLoading(false);
					return;
				}
				const controller = new AbortController();
				readRequest.current.controller = controller;
				setDetailLoading(true);
				try {
					const next = await memoryApi.read(entry.target, entry.id, controller.signal);
					if (!alive.current || generation !== readRequest.current.generation) return;
					setDetail(next);
				} catch (error) {
					if (alive.current && generation === readRequest.current.generation && !cancelled(error)) setDetailError(errorText(error));
				} finally {
					if (alive.current && generation === readRequest.current.generation) setDetailLoading(false);
				}
			}
			function chooseEntry(entry) {
				if (selected?.key === entry.key && !creating) return;
				if (!mayLeave()) return;
				setNotice(null);
				readEntry(entry);
			}
			function openRecords(next, purpose = "all", search = "") {
				if (!mayLeave()) return;
				resetDetail();
				setScope(next);
				setKind(purpose);
				setQuery(search);
				setView("records");
				setNotice(null);
			}
			function returnOverview() {
				if (!mayLeave()) return;
				resetDetail();
				setView("overview");
			}
			function chooseScope(next) {
				if (next === scope || !mayLeave()) return;
				resetDetail();
				setScope(next);
				setNotice(null);
			}
			function beginCreate(target = defaultTarget) {
				if (target === void 0 || !target.available || target.nested || !mayLeave()) return;
				setView("records");
				setScope(target.key);
				resetDetail();
				const empty = {
					title: "",
					content: "",
					tags: "",
					path: "",
					kind: kind === "reference" ? "reference" : "memory",
					target: target.target
				};
				setDraft(empty);
				setOriginal(empty);
				setCreating(true);
				setEditing(true);
				setNotice(null);
			}
			function beginEdit() {
				if (selected === null || detail === null || busyRef.current) return;
				const next = draftOf(detail, selected.target);
				setDraft(next);
				setOriginal(next);
				setEditing(true);
				setFormError(null);
				setNotice(null);
			}
			function cancelEdit() {
				if (!mayLeave()) return;
				if (creating) resetDetail();
				else {
					setEditing(false);
					setDraft(null);
					setOriginal(null);
					setFormError(null);
					detailHeading.current?.focus();
				}
			}
			function goBack() {
				if (!mayLeave()) return;
				focusList.current = true;
				resetDetail();
			}
			async function refresh() {
				if (!mayLeave()) return;
				const previous = selected;
				resetDetail();
				const selectionGeneration = readRequest.current.generation;
				setNotice(null);
				const next = await loadList();
				if (next !== null && previous !== null && selectionGeneration === readRequest.current.generation) {
					const updated = entriesOf(scopesOf(next)).find((entry) => entry.key === previous.key);
					if (updated !== void 0) await readEntry(updated);
					else setNotice("该条目已不在最新列表中，可能已被外部修改或删除。");
				}
			}
			async function submit(event) {
				event.preventDefault();
				if (draft === null || busyRef.current) return;
				const errors = validateDraft(draft);
				if (errors.length > 0) {
					setFormError(errors.join(" "));
					return;
				}
				const target = targets.find((item) => scopeKey(item.target) === scopeKey(draft.target));
				if (target === void 0) {
					setFormError("请选择当前可写的用户或已登记项目范围。");
					return;
				}
				const savedDraft = draft;
				const source = selected;
				let finishPending = () => {};
				const pending = new Promise((resolve) => {
					finishPending = resolve;
				});
				const savedSnapshot = {
					data,
					selected,
					detail,
					draft,
					original,
					creating,
					scope,
					kind,
					query,
					pending
				};
				suspendedDrafts.set(mode, savedSnapshot);
				busyRef.current = true;
				setBusy(true);
				setFormError(null);
				listRequest.current.controller?.abort();
				++listRequest.current.generation;
				setListLoading(false);
				readRequest.current.controller?.abort();
				++readRequest.current.generation;
				try {
					const result = creating ? await memoryApi.save(savedDraft) : await memoryApi.update(source.target, source.id, savedDraft);
					if (suspendedDrafts.get(mode) === savedSnapshot) suspendedDrafts.delete(mode);
					if (!alive.current) return;
					setEditing(false);
					setCreating(false);
					setDraft(null);
					setOriginal(null);
					const id = typeof result.id === "string" ? result.id : typeof result.updated === "string" ? result.updated : source?.id;
					const savedTarget = savedDraft.target;
					setScope(scopeKey(savedTarget));
					setKind("all");
					setQuery("");
					setNotice("已保存。内容以文件为准；其他窗口的修改不会自动合并。");
					const next = await loadList();
					if (!alive.current) return;
					if (id !== void 0) {
						const found = next === null ? void 0 : entriesOf(scopesOf(next)).find((entry) => entry.key === entryKey(savedTarget, id));
						const fallback = {
							key: entryKey(savedTarget, id),
							target: savedTarget,
							scopeLabel: target.label,
							readOnly: false,
							id: normalizeId(id),
							title: savedDraft.title,
							date: "",
							excerpt: "",
							path: savedDraft.path,
							tags: savedDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
							kind: savedDraft.kind
						};
						await readEntry(found ?? fallback);
					} else resetDetail();
				} catch (error) {
					savedSnapshot.error = `保存失败：${errorText(error)}。草稿已保留，可修改后重试。`;
					if (alive.current) setFormError(savedSnapshot.error);
				} finally {
					delete savedSnapshot.pending;
					finishPending();
					busyRef.current = false;
					if (alive.current) setBusy(false);
				}
			}
			async function deleteEntry() {
				if (selected === null || selected.readOnly || selected.id === void 0 || busyRef.current) return;
				if (!window.confirm(`永久删除「${detail?.title ?? selected.title}」？\n此操作没有撤销或自动恢复，文件和索引记录将被删除。`)) return;
				const entry = selected;
				busyRef.current = true;
				setBusy(true);
				setFormError(null);
				try {
					await memoryApi.delete(entry.target, entry.id);
					if (!alive.current) return;
					resetDetail();
					setNotice("已删除。此操作无法撤销。");
					await loadList();
					searchInput.current?.focus();
				} catch (error) {
					if (alive.current) setFormError(`删除失败：${errorText(error)}`);
				} finally {
					busyRef.current = false;
					if (alive.current) setBusy(false);
				}
			}
			const title = creating ? "新增记录" : detail?.title ?? selected?.title ?? "";
			const limits = detail === null || selected === null ? [] : validateDraft(draftOf(detail, selected.target));
			const readOnly = selected?.readOnly === true;
			const status = (text, isError = false) => (0, react.createElement)("div", {
				className: `dsh-memory-notice${isError ? " dsh-memory-error" : ""}`,
				role: isError ? "alert" : "status"
			}, text);
			return (0, react.createElement)("section", {
				className: `dsh-memory dsh-memory-${mode}`,
				"aria-label": "记忆管理"
			}, (0, react.createElement)("style", null, memoryStyles), (0, react.createElement)("header", { className: "dsh-memory-header" }, (0, react.createElement)("div", null, (0, react.createElement)("h1", { className: "dsh-memory-heading" }, mode === "page" && view === "overview" ? "记忆总览" : "记忆管理"), (0, react.createElement)("p", { className: "dsh-memory-subtitle" }, "跨项目偏好、项目决定与历史资料，在一处清晰管理。")), (0, react.createElement)("div", { className: "dsh-memory-actions" }, mode === "page" && view === "overview" ? (0, react.createElement)("form", {
				className: "dm-global-search",
				onSubmit: (event) => {
					event.preventDefault();
					openRecords("all", "all", overviewQuery);
				}
			}, (0, react.createElement)("input", {
				type: "search",
				value: overviewQuery,
				onChange: (event) => setOverviewQuery(event.target.value),
				placeholder: "搜索标题、摘要、标签或路径",
				"aria-label": "搜索全部记忆索引"
			}), (0, react.createElement)("button", {
				type: "submit",
				className: "dsh-memory-button",
				disabled: busy
			}, "搜索")) : null, button(listLoading ? "刷新中…" : "刷新", () => {
				refresh();
			}, {
				disabled: busy || listLoading,
				"aria-label": "刷新记忆列表"
			}), button("新增记录", () => beginCreate(), {
				disabled: busy || !canCreate,
				className: "dsh-memory-button dsh-memory-primary"
			}))), (0, react.createElement)("div", {
				className: `dsh-memory-overview${mode === "page" ? " dm-overview-four" : ""}`,
				"aria-label": "全部范围总览"
			}, mode === "page" ? (0, react.createElement)(Stat, {
				label: "全部记录",
				value: data === null ? "—" : counts.all,
				icon: "file"
			}) : null, (0, react.createElement)(Stat, {
				label: "长期记忆",
				value: data === null ? "—" : counts.memory,
				icon: "book"
			}), (0, react.createElement)(Stat, {
				label: "历史资料",
				value: data === null ? "—" : counts.reference,
				icon: "file"
			}), (0, react.createElement)(Stat, {
				label: "项目范围",
				value: data === null ? "—" : scopes.filter((item) => item.target.scope === "project").length,
				icon: "folder",
				note: data === null ? void 0 : `其中 ${scopes.filter((item) => item.target.scope === "project" && entries.filter((entry) => scopeKey(entry.target) === item.key).length === 0).length} 个为空`
			})), mode === "page" ? (0, react.createElement)("nav", {
				className: "dm-page-nav",
				"aria-label": "记忆页面视图"
			}, button("全局总览", returnOverview, {
				disabled: busy,
				"aria-current": view === "overview" ? "page" : void 0
			}), button("记录列表", () => {
				if (mayLeave()) {
					resetDetail();
					setView("records");
				}
			}, {
				disabled: busy,
				"aria-current": view === "records" ? "page" : void 0
			})) : null, notice !== null ? status(notice) : null, listError !== null ? (0, react.createElement)("div", {
				className: "dsh-memory-notice dsh-memory-error",
				role: "alert"
			}, (0, react.createElement)("p", null, `无法加载最新列表：${listError}${data !== null ? "。下方保留上次成功加载的列表。" : "。请确认宿主已启用记忆服务。"}`), button("重试加载", () => {
				loadList();
			}, { disabled: busy || listLoading })) : null, data === null ? (0, react.createElement)("div", {
				className: "dsh-memory-card dsh-memory-empty",
				role: "status"
			}, listLoading ? "正在加载记忆索引…" : "记忆服务暂不可用") : mode === "page" && view === "overview" ? (0, react.createElement)(Overview, {
				scopes,
				entries,
				disabled: busy,
				chart,
				setChart,
				filter: spaceFilter,
				setFilter: setSpaceFilter,
				onOpen: openRecords,
				onCreate: (key) => beginCreate(scopes.find((item) => item.key === key))
			}) : (0, react.createElement)("div", { className: `dsh-memory-workbench${hasDetail ? " dsh-memory-has-detail" : ""}` }, (0, react.createElement)("nav", {
				className: "dsh-memory-card dsh-memory-nav",
				"aria-label": "记忆范围"
			}, (0, react.createElement)("p", { className: "dsh-memory-eyebrow" }, "范围"), (0, react.createElement)("div", { className: "dsh-memory-scope-list" }, (0, react.createElement)(ScopeButton, {
				label: "全部范围",
				count: counts.all,
				active: scope === "all",
				disabled: busy,
				onClick: () => chooseScope("all")
			}), scopes.filter((item) => item.target.scope === "user").map((item) => (0, react.createElement)(ScopeButton, {
				key: item.key,
				label: item.label,
				note: item.available ? "跨项目偏好" : "暂不可用",
				count: entries.filter((entry) => scopeKey(entry.target) === item.key).length,
				active: scope === item.key,
				disabled: busy,
				onClick: () => chooseScope(item.key)
			})), (0, react.createElement)("p", { className: "dsh-memory-nav-group" }, "项目"), scopes.filter((item) => item.target.scope === "project").map((item) => (0, react.createElement)(ScopeButton, {
				key: item.key,
				label: item.label,
				title: item.target.workspace,
				note: item.nested ? "嵌套范围 · 只读摘要" : item.serviceAnchor ? "服务启动目录" : void 0,
				count: entries.filter((entry) => scopeKey(entry.target) === item.key).length,
				active: scope === item.key,
				disabled: busy,
				onClick: () => chooseScope(item.key)
			}))), activeScope?.stats !== void 0 ? (0, react.createElement)("div", { className: "dsh-memory-capacity" }, (0, react.createElement)("strong", null, "此范围的索引与文件"), (0, react.createElement)("div", null, `索引行 ${activeScope.stats.entries} / ${activeScope.stats.maxEntries}`), (0, react.createElement)("div", null, `索引 ${(activeScope.stats.indexBytes / 1024).toFixed(1)} / ${(activeScope.stats.maxBytes / 1024).toFixed(0)} KB`), (0, react.createElement)("div", null, `文件 ${activeScope.stats.memoryFiles} / ${activeScope.stats.maxMemories}（含历史资料）`)) : null), (0, react.createElement)("section", {
				className: "dsh-memory-card dsh-memory-list",
				"aria-label": "记忆条目"
			}, (0, react.createElement)("div", { className: "dsh-memory-list-header" }, (0, react.createElement)("div", { className: "dsh-memory-list-title" }, (0, react.createElement)("h2", null, activeScope?.label ?? "全部记录"), (0, react.createElement)("span", { className: "dsh-memory-muted" }, `${visible.length} 条`)), (0, react.createElement)("input", {
				ref: searchInput,
				className: "dsh-memory-search",
				type: "search",
				value: query,
				placeholder: "搜索标题、摘要、标签或路径",
				"aria-label": "搜索记忆索引",
				onChange: (event) => setQuery(event.target.value)
			}), (0, react.createElement)("p", { className: "dsh-memory-search-hint" }, "仅搜索列表中的索引信息，不搜索完整正文"), (0, react.createElement)("div", {
				className: "dsh-memory-filters",
				"aria-label": "记忆用途"
			}, [
				"all",
				"memory",
				"reference"
			].map((value) => (0, react.createElement)("button", {
				key: value,
				type: "button",
				className: "dsh-memory-filter",
				"aria-pressed": kind === value,
				onClick: () => setKind(value)
			}, `${value === "all" ? "全部" : kindLabel(value)} ${categoryCounts[value]}`)))), visible.length === 0 ? (0, react.createElement)("div", { className: "dsh-memory-empty" }, (0, react.createElement)("strong", null, activeScope?.available === false ? "此范围暂不可用" : scopedEntries.length === 0 ? "这里还没有记录" : "没有符合筛选的记录"), (0, react.createElement)("p", null, scopedEntries.length === 0 ? "新增一条偏好或决定，之后随时查阅。" : "试试其他关键词或切换用途筛选。")) : (0, react.createElement)("ul", { className: "dsh-memory-entries" }, visible.map((entry) => (0, react.createElement)("li", { key: entry.key }, (0, react.createElement)("button", {
				type: "button",
				className: "dsh-memory-entry",
				"aria-current": selected?.key === entry.key,
				disabled: busy,
				onClick: () => chooseEntry(entry)
			}, (0, react.createElement)("div", { className: "dsh-memory-entry-title" }, entry.title), (0, react.createElement)("div", { className: "dsh-memory-excerpt" }, entry.excerpt || "暂无摘要"), (0, react.createElement)("div", { className: "dsh-memory-entry-meta" }, (0, react.createElement)("span", { className: `dsh-memory-badge${entry.kind === "reference" ? " dsh-memory-reference" : ""}` }, kindLabel(entry.kind)), entry.unindexed ? (0, react.createElement)("span", { className: "dsh-memory-badge" }, "未索引") : null, entry.readOnly ? (0, react.createElement)("span", { className: "dsh-memory-badge" }, "只读") : null, ...entry.tags.map((tag, index) => (0, react.createElement)("span", { key: `${tag}:${index}` }, `#${tag}`))), (0, react.createElement)("span", {
				className: "dsh-memory-entry-path",
				title: [entry.scopeLabel, entry.path].filter(Boolean).join(" / ")
			}, [entry.scopeLabel, entry.path].filter(Boolean).join(" / "))))))), hasDetail ? (0, react.createElement)("section", {
				className: "dsh-memory-card dsh-memory-detail",
				"aria-label": "记录详情",
				"aria-busy": detailLoading || busy
			}, !hasDetail ? (0, react.createElement)("div", { className: "dsh-memory-empty" }, (0, react.createElement)("strong", null, "选择一条记录"), (0, react.createElement)("p", null, "按需读取完整正文，再编辑、移动或修改用途。"), (0, react.createElement)("p", { className: "dsh-memory-muted" }, "历史资料不会进入常驻记忆索引。")) : (0, react.createElement)("div", null, (0, react.createElement)("div", { className: "dsh-memory-detail-head" }, (0, react.createElement)("div", { className: "dsh-memory-detail-topline" }, button("返回列表", goBack, {
				className: "dsh-memory-button dsh-memory-back",
				disabled: busy
			}), (0, react.createElement)("span", { className: "dsh-memory-badge" }, editing ? creating ? "新记录" : "正在编辑" : kindLabel(detail?.kind ?? selected?.kind))), (0, react.createElement)("h2", {
				className: "dsh-memory-detail-title",
				ref: detailHeading,
				tabIndex: -1
			}, title), selected !== null ? (0, react.createElement)("div", { className: "dsh-memory-detail-meta" }, (0, react.createElement)("span", null, selected.scopeLabel), selected.date ? (0, react.createElement)("span", null, `索引日期 ${selected.date}`) : null, selected.unindexed ? (0, react.createElement)("span", null, "未索引") : null) : null, !editing && selected !== null && !readOnly ? (0, react.createElement)("div", { className: "dsh-memory-actions dsh-memory-detail-actions" }, button("编辑 / 移动", beginEdit, { disabled: busy || detail === null || limits.length > 0 }), button(busy ? "处理中…" : "删除", () => {
				deleteEntry();
			}, {
				className: "dsh-memory-button dsh-memory-danger",
				disabled: busy
			})) : null), (0, react.createElement)("div", { className: "dsh-memory-detail-body" }, formError !== null ? status(formError, true) : null, detailLoading ? (0, react.createElement)("p", {
				role: "status",
				className: "dsh-memory-muted"
			}, "正在读取完整正文…") : null, detailError !== null ? (0, react.createElement)("div", { role: "alert" }, status(`无法读取正文：${detailError}`, true), button("重试读取", () => {
				if (selected !== null) readEntry(selected);
			}, { disabled: busy })) : null, readOnly ? (0, react.createElement)("div", null, (0, react.createElement)("div", { className: "dsh-memory-notice dsh-memory-warning" }, selected?.id === void 0 || !/^[a-zA-Z0-9\u4e00-\u9fff_-]+$/.test(selected.id) ? "此索引行没有有效记录标识，只能查看摘要。请在原文件中核对。" : "此嵌套范围尚未登记为可操作项目。这里只显示索引摘要，不读取或修改原文件；可在 DSH 登记对应工作区后刷新。"), (0, react.createElement)("pre", { className: "dsh-memory-content" }, selected?.excerpt), (0, react.createElement)("p", { className: "dsh-memory-detail-path" }, selected?.target.workspace)) : null, !editing && detail !== null ? (0, react.createElement)("div", null, limits.length > 0 ? (0, react.createElement)("div", { className: "dsh-memory-notice dsh-memory-warning" }, `此文件超出页面编辑限制，完整原文仍保留。${limits.join(" ")} 请通过外部编辑器修改，页面不会截断内容。`) : null, (0, react.createElement)("div", { className: "dsh-memory-detail-meta" }, detail.tags.map((tag, index) => (0, react.createElement)("span", {
				key: `${tag}:${index}`,
				className: "dsh-memory-badge"
			}, tag))), (0, react.createElement)("p", { className: "dsh-memory-detail-path" }, `${selected?.target.scope === "user" ? "用户范围" : selected?.target.workspace ?? "项目范围"} · memories/${normalizeId(detail.id)}.md${detail.path ? ` · 路径标签：${detail.path}` : ""}`), (0, react.createElement)("hr", { style: {
				border: 0,
				borderTop: "1px solid var(--dm-border)",
				margin: "16px 0"
			} }), (0, react.createElement)("pre", { className: "dsh-memory-content" }, detail.content)) : null, editing && draft !== null ? (0, react.createElement)(DraftForm, {
				draft,
				targets,
				busy,
				creating,
				titleRef: titleInput,
				onChange: setDraft,
				onSubmit: submit,
				onCancel: cancelEdit
			}) : null))) : null), (0, react.createElement)("p", { className: "dsh-memory-footer-note" }, "本地文件 · 无数据迁移。总览按列表用途统计，不代表本会话注入量；服务启动目录不等同于当前会话工作区。"));
		}
		function Stat({ label, value, icon, note }) {
			return (0, react.createElement)("div", { className: "dsh-memory-stat" }, icon ? (0, react.createElement)("span", { className: "dsh-memory-stat-icon" }, (0, react.createElement)(LineIcon, { type: icon })) : null, (0, react.createElement)("div", null, (0, react.createElement)("p", { className: "dsh-memory-stat-label" }, label), (0, react.createElement)("p", { className: "dsh-memory-stat-value" }, value), note ? (0, react.createElement)("small", { className: "dsh-memory-muted" }, note) : null));
		}
		function ScopeButton({ label, count, active, disabled, note, title, onClick }) {
			return (0, react.createElement)("button", {
				type: "button",
				className: "dsh-memory-scope",
				"aria-current": active,
				disabled,
				title,
				onClick
			}, (0, react.createElement)("span", { className: "dsh-memory-scope-main" }, (0, react.createElement)("span", { className: "dsh-memory-scope-label" }, label), note ? (0, react.createElement)("span", { className: "dsh-memory-scope-note" }, note) : null), (0, react.createElement)("span", { className: "dsh-memory-count" }, count));
		}
		function DraftForm({ draft, targets, busy, creating, titleRef, onChange, onSubmit, onCancel }) {
			const errors = validateDraft(draft);
			const update = (name) => (event) => onChange({
				...draft,
				[name]: event.target.value
			});
			return (0, react.createElement)("form", {
				className: "dsh-memory-form",
				onSubmit
			}, (0, react.createElement)("div", { className: "dsh-memory-fields-row" }, (0, react.createElement)("label", { className: "dsh-memory-field" }, "所属范围", (0, react.createElement)("select", {
				value: scopeKey(draft.target),
				disabled: busy,
				onChange: (event) => {
					const next = targets.find((item) => item.key === event.target.value);
					if (next !== void 0) onChange({
						...draft,
						target: next.target,
						path: ""
					});
				}
			}, targets.map((item) => (0, react.createElement)("option", {
				key: item.key,
				value: item.key
			}, item.target.scope === "user" ? "用户 · 跨项目偏好" : `项目 · ${item.label}`)))), (0, react.createElement)("label", { className: "dsh-memory-field" }, "用途", (0, react.createElement)("select", {
				value: draft.kind,
				disabled: busy,
				onChange: (event) => onChange({
					...draft,
					kind: event.target.value
				})
			}, (0, react.createElement)("option", { value: "memory" }, "长期记忆"), (0, react.createElement)("option", { value: "reference" }, "历史资料 · 按需检索")))), (0, react.createElement)("label", { className: "dsh-memory-field" }, (0, react.createElement)("span", { className: "dsh-memory-field-head" }, "标题", (0, react.createElement)("small", null, `${draft.title.trim().length} / 60`)), (0, react.createElement)("input", {
				ref: titleRef,
				value: draft.title,
				disabled: busy,
				required: true,
				onChange: update("title"),
				placeholder: "简短、可辨认的标题",
				"aria-invalid": draft.title.trim().length > 60
			})), (0, react.createElement)("label", { className: "dsh-memory-field" }, (0, react.createElement)("span", { className: "dsh-memory-field-head" }, "正文", (0, react.createElement)("small", null, `${draft.content.trim().length} / 20000`)), (0, react.createElement)("textarea", {
				value: draft.content,
				disabled: busy,
				required: true,
				onChange: update("content"),
				placeholder: "记录完整、独立可理解的内容…",
				"aria-invalid": draft.content.trim().length > 2e4
			})), (0, react.createElement)("label", { className: "dsh-memory-field" }, "标签", (0, react.createElement)("input", {
				value: draft.tags,
				disabled: busy,
				onChange: update("tags"),
				placeholder: "逗号分隔，最多 10 个"
			})), (0, react.createElement)("label", { className: "dsh-memory-field" }, "路径标签", (0, react.createElement)("input", {
				value: draft.path,
				disabled: busy,
				onChange: update("path"),
				placeholder: "例如 frontend/src（可选）"
			}), (0, react.createElement)("small", null, "这是范围内的分类标签，不会改变记忆文件存放位置。切换范围时清空。")), (0, react.createElement)("p", { className: "dsh-memory-muted" }, draft.kind === "reference" ? "历史资料只按需检索，不进入常驻 MEMORY.md 索引。" : "长期记忆保留现有简短索引规则；不会把全文常驻注入。"), errors.length > 0 && (draft.title !== "" || draft.content !== "") ? (0, react.createElement)("div", {
				className: "dsh-memory-notice dsh-memory-error",
				role: "status"
			}, errors.join(" ")) : null, (0, react.createElement)("div", { className: "dsh-memory-actions" }, (0, react.createElement)("button", {
				type: "submit",
				className: "dsh-memory-button dsh-memory-primary",
				disabled: busy || errors.length > 0
			}, busy ? "正在保存…" : creating ? "保存记录" : "保存修改"), button("取消", onCancel, { disabled: busy })), (0, react.createElement)("p", { className: "dsh-memory-muted" }, "保存会沿用现有文件与备份规则，不提供跨窗口冲突合并。"));
		}
		//#endregion
		//#region src/client/index.ts
		/** Settings always remains available; a capable host also offers a full page. */
		const name = "@fooxe/dsh-memory";
		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-memory",
				order: 70,
				label: () => "Memory",
				locale: "dsh-memory"
			}, () => (0, react.createElement)(MemoryPanel, { mode: "settings" })));
			const optional = (register) => {
				try {
					return register();
				} catch (error) {
					console.warn("[dsh-memory] Optional full-page entry unavailable; use Settings → Memory.", error);
					return;
				}
			};
			optional(() => ctx.slots.inject("main", () => optional(() => [ctx.slots.register({
				name: "main",
				key: "dsh-memory",
				locale: "dsh-memory"
			}, () => (0, react.createElement)(MemoryPanel, { mode: "page" })), ctx.slots.inject("sidebar.panellist", () => optional(() => ctx.slots.register({
				name: "sidebar.panellist",
				id: "dsh-memory",
				order: 70,
				label: () => "Memory",
				locale: "dsh-memory"
			}, (props) => (0, react.createElement)("svg", {
				width: typeof props.size === "number" ? props.size : 18,
				height: typeof props.size === "number" ? props.size : 18,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.6,
				"aria-hidden": true
			}, (0, react.createElement)("path", { d: "M5 4.5h11.5A2.5 2.5 0 0 1 19 7v13H7a3 3 0 0 1-3-3V6a1.5 1.5 0 0 1 1-1.5Z" }), (0, react.createElement)("path", { d: "M4 17a3 3 0 0 1 3-3h12M8 8h7" })))))])));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
