window.__ModuleLoader__.load({
	id: "dsh-thinking-language",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region dsh-thinking-language/platform.js
		/**
		 * Platform-module resolution.
		 *
		 * A client bundle's `require` walks a fixed table (platform seed words,
		 * already-materialized modules, registered package factories) and THROWS
		 * on anything else, so a specifier that a different harness generation
		 * does not seed takes the whole bundle — and with it the settings row —
		 * down at materialization. Every optional platform module is therefore
		 * resolved through {@link optionalRequire}, which reports absence instead
		 * of throwing, and React itself is left to the platform's own element
		 * factory (see `element` below) rather than required here.
		 */
		/**
		 * Require one of several candidate specifiers, newest first.
		 * @param specifiers - candidate module specifiers.
		 * @returns the first module that resolves, or undefined.
		 */
		function optionalRequire(...specifiers) {
			for (const specifier of specifiers) {
				try {
					const resolved = require(specifier);
					if (resolved !== undefined && resolved !== null) return resolved;
				} catch {}
			}
			return undefined;
		}
		/**
		 * The platform's UI primitives module. Absence is fatal for the row (it
		 * owns the dropdown), but absence is REPORTED rather than thrown so the
		 * plugin can still register its dictionaries and skip the row quietly.
		 */
		const primitives = optionalRequire("@deepseek-ai/dsh-client-ui-primitives");
		//#endregion
		//#region dsh-thinking-language/element.js
		/**
		 * Element construction.
		 *
		 * A JSX-compiled bundle requires `react/jsx-runtime`; this one uses
		 * `React.createElement` when the platform exposes React and falls back to
		 * a plain element description otherwise. That keeps the bundle loadable on
		 * a harness whose React is not a require-able seed word (the row is a
		 * single menu anyway, and the slot renderer accepts whatever React it
		 * already has), and it removes the `react` peer requirement entirely.
		 */
		const platformReact = optionalRequire("react");
		/** Build one element, preferring the platform React and never throwing. */
		function element(type, props, ...children) {
			if (platformReact !== undefined && typeof platformReact.createElement === "function") return platformReact.createElement(type, props, ...children);
			return { type, props: { ...(props ?? {}), children: children.length > 1 ? children : children[0] } };
		}
		/**
		 * The hooks the row uses. A React-less platform cannot render the row at
		 * all (the slot renderer owns React), so these are inert stand-ins that
		 * keep module evaluation and the harmless paths working instead of
		 * throwing a TypeError on a missing platform module.
		 */
		const react = {
			useState: platformReact !== undefined && typeof platformReact.useState === "function" ? platformReact.useState : (initial) => [initial, () => {}]
		};
		//#endregion
		//#region dsh-thinking-language/row.css.mjs
		// Setting-Cell row (figma 501:30011), same layout as the built-in
		// Language/Permission rows: text column on the left, selector pill on the
		// right, single-line flex row instead of a stacked block.
		const css = ".dshtl_row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}.dshtl_rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}.dshtl_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.dshtl_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}.dshtl_selector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.dshtl_selector:hover{background:var(--dsw-alias-interactive-bg-hover)}.dshtl_chevron{flex:none}";
		const tagId = "dsh-thinking-language/row.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-thinking-language";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region dsh-thinking-language/languages.js
		/**
		 * The browser copy of the language catalog.
		 *
		 * The authoritative copy lives in the host half (`lib/languages.js`) and
		 * reaches this bundle through the registered settings schema, which carries
		 * every enum value plus its endonym label (see `buildSettingsSchema` in
		 * `lib/index.js`). `readCatalog` derives the picker from that schema.
		 * This table is only the last-resort fallback for a harness whose settings
		 * transport `describe()` is missing, still loading, or shaped
		 * differently; `smoke-test.mjs` fails when the fallback and the host
		 * catalog drift apart.
		 */
		const FALLBACK_LANGUAGES = [
			{ id: "auto" },
			{ id: "zh-CN", label: "简体中文" },
			{ id: "zh-TW", label: "繁體中文" },
			{ id: "en", label: "English" },
			{ id: "ru", label: "Русский" },
			{ id: "fr", label: "Français" },
			{ id: "de", label: "Deutsch" },
			{ id: "es", label: "Español" },
			{ id: "ar", label: "العربية" },
			{ id: "pt", label: "Português" },
			{ id: "ja", label: "日本語" }
		];
		/** The "follow the system" value shared with the host schema. */
		const THINKING_LANGUAGE_DEFAULT = "auto";
		/**
		 * Normalize a settings transport's describe face to the bare document
		 * {@link findNamespaceSchema} walks: dsh 0.2.x hands back its describe
		 * mirror (a store), earlier generations the document itself.
		 * @param described - the transport's describe face.
		 * @returns the document, or undefined when there is nothing to read.
		 */
		function describeView(described) {
			if (described === null || described === undefined) return undefined;
			if (typeof described.getSnapshot === "function") {
				const snapshot = described.getSnapshot();
				return snapshot !== null && typeof snapshot === "object" ? snapshot.view : undefined;
			}
			return described;
		}
		/**
		 * Find one namespace's serialized schema in whatever shape a settings
		 * transport's describe face returns (a bare array on some builds, a
		 * `{ namespaces }` object on others).
		 * @param described - the described document.
		 * @param ns - the namespace to find.
		 * @returns the serialized schema, or undefined.
		 */
		function findNamespaceSchema(described, ns) {
			const views = Array.isArray(described) ? described : described !== null && typeof described === "object" ? described.namespaces : undefined;
			if (!Array.isArray(views)) return undefined;
			for (const view of views) {
				if (view !== null && typeof view === "object" && view.ns === ns && view.schema !== null && typeof view.schema === "object") return view.schema;
			}
			return undefined;
		}
		/**
		 * Extract an enum field's values and labels from a schemastery JSON tree.
		 *
		 * The tree is a `refs` dictionary keyed by numeric uid; a union lists its
		 * member uids in `list`, and those members are `const` nodes whose `value`
		 * is the entry and whose `meta.description` is the label the host attached.
		 * Anything unexpected yields an empty result rather than throwing.
		 * @param schema - the serialized namespace schema.
		 * @param field - the object field name holding the enum.
		 * @returns the ordered `{ id, label }` entries.
		 */
		function readEnumField(schema, field) {
			const refs = schema.refs;
			if (refs === null || typeof refs !== "object") return [];
			const root = refs[String(schema.uid)];
			const fieldUid = root !== null && typeof root === "object" && root.dict !== null && typeof root.dict === "object" ? root.dict[field] : undefined;
			const union = refs[String(fieldUid)];
			if (union === null || typeof union !== "object" || !Array.isArray(union.list)) return [];
			const entries = [];
			for (const uid of union.list) {
				const member = refs[String(uid)];
				if (member === null || typeof member !== "object" || typeof member.value !== "string") continue;
				const meta = member.meta;
				const label = meta !== null && typeof meta === "object" && typeof meta.description === "string" ? meta.description : undefined;
				entries.push(label === undefined ? { id: member.value } : { id: member.value, label });
			}
			return entries;
		}
		/**
		 * Build the picker catalog: the host schema when it is readable, the
		 * built-in fallback otherwise. `auto` is always present and always first.
		 * @param described - the describe() result, or undefined when unavailable.
		 * @param ns - the settings namespace to read.
		 * @returns the ordered picker entries.
		 */
		function readCatalog(described, ns) {
			const schema = described === undefined ? undefined : findNamespaceSchema(described, ns);
			const entries = schema === undefined ? [] : readEnumField(schema, "language");
			const values = entries.length > 0 ? entries : FALLBACK_LANGUAGES;
			const seen = new Set();
			const options = [{ id: THINKING_LANGUAGE_DEFAULT }];
			seen.add(THINKING_LANGUAGE_DEFAULT);
			for (const entry of values) {
				if (seen.has(entry.id)) continue;
				seen.add(entry.id);
				options.push(entry);
			}
			return options;
		}
		//#endregion
		//#region dsh-thinking-language/locales.js
		/** `settings.thinking-language` dictionaries (the picker row's copy). */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"title": "思考语言",
			"hint": "选择模型思考过程使用的语言，新会话生效。",
			"lang.auto": "跟随系统"
		};
		/** English dictionary. */
		const en = {
			"title": "Thinking language",
			"hint": "Language used for the model's reasoning/thinking process. Applies to new sessions.",
			"lang.auto": "Follow the system (auto)"
		};
		/** Russian dictionary. */
		const ru = {
			"title": "Язык размышлений",
			"hint": "Язык для процесса рассуждений модели. Применяется к новым сессиям.",
			"lang.auto": "Следовать за системой (авто)"
		};
		/** French dictionary. */
		const fr = {
			"title": "Langue de réflexion",
			"hint": "Langue utilisée pour le raisonnement du modèle. S'applique aux nouvelles sessions.",
			"lang.auto": "Suivre le système (auto)"
		};
		/** German dictionary. */
		const de = {
			"title": "Denksprache",
			"hint": "Sprache für den Denkprozess des Modells. Gilt für neue Sitzungen.",
			"lang.auto": "Dem System folgen (auto)"
		};
		/** Spanish dictionary. */
		const es = {
			"title": "Idioma de razonamiento",
			"hint": "Idioma para el proceso de razonamiento del modelo. Se aplica a sesiones nuevas.",
			"lang.auto": "Seguir al sistema (auto)"
		};
		/** Japanese dictionary. */
		const ja = {
			"title": "思考言語",
			"hint": "モデルの思考プロセスで使う言語。新しいセッションに適用されます。",
			"lang.auto": "システムに従う（自動）"
		};
		/** Arabic dictionary. */
		const ar = {
			"title": "لغة التفكير",
			"hint": "اللغة المستخدمة في عملية تفكير النموذج. تُطبَّق على الجلسات الجديدة.",
			"lang.auto": "اتّباع النظام (تلقائي)"
		};
		/** Portuguese dictionary. */
		const pt = {
			"title": "Idioma do raciocínio",
			"hint": "Idioma usado no processo de raciocínio do modelo. Aplica-se a novas sessões.",
			"lang.auto": "Seguir o sistema (automático)"
		};
		//#endregion
		//#region dsh-thinking-language/settings-store.js
		/**
		 * Picker row store: a mirror of the settings scope snapshot. The apply-world
		 * scope listener is the only writer; the row reads via props.useStore.
		 */
		/**
		 * Minimal `defineStore` shim, inlined so the bundle does not depend on a
		 * version-specific platform seed word:
		 * - DSH 0.2.9+ exposes `@deepseek-ai/dsh-client-store`
		 * - DSH 0.2.7 exposes `@deepseek-ai/dsh-client-runtime/client`
		 * - DSH <= 0.2.6 exposes neither as a require-able platform module
		 *
		 * Resolving the platform store would trade that portability for very
		 * little: the shim below is the whole contract the slot system needs.
		 *
		 * It satisfies the ui-slots / ui-renderer store-handle contract:
		 * `{ spec, create(scopeKey) -> { actions, getSnapshot, subscribe, store } }`.
		 * `update` keeps the snapshot reference stable when a mutator leaves the
		 * draft unchanged (mirrors immer's `produce`), so the row's revision guard
		 * can drop stale duplicates without re-rendering.
		 */
		function defineStore(decl) {
			return {
				spec: decl,
				create() {
					let state = decl.init();
					const listeners = /* @__PURE__ */ new Set();
					const notify = () => {
						for (const fn of [...listeners]) {
							try {
								fn();
							} catch {}
						}
					};
					const store = {
						getSnapshot: () => state,
						subscribe(fn) {
							listeners.add(fn);
							return () => {
								listeners.delete(fn);
							};
						},
						update(mutator) {
							const draft = { ...state };
							mutator(draft);
							const keys = Object.keys(state);
							if (keys.length === Object.keys(draft).length && keys.every((key) => state[key] === draft[key])) return;
							state = draft;
							notify();
						},
						set(next) {
							state = next;
							notify();
						}
					};
					const actions = {};
					for (const key of Object.keys(decl.actions)) {
						const mutate = decl.actions[key];
						actions[key] = (...params) => {
							store.update((draft) => {
								mutate(draft, ...params);
							});
						};
					}
					return {
						actions,
						getSnapshot: () => store.getSnapshot(),
						subscribe: (fn) => store.subscribe(fn),
						store,
						clearPersisted: () => {}
					};
				}
			};
		}
		/**
		 * Declares the row state and write surface.
		 * @returns the store handle.
		 */
		function createThinkingLanguageStore() {
			return defineStore({
				init: () => ({
					language: THINKING_LANGUAGE_DEFAULT,
					revision: -1,
					catalog: [{ id: THINKING_LANGUAGE_DEFAULT }]
				}),
				actions: { sync: (d, language, catalog, revision) => {
					if (revision <= d.revision && d.catalog.length > 1) return;
					d.language = language;
					d.catalog = catalog;
					d.revision = revision;
				} }
			});
		}
		//#endregion
		//#region dsh-thinking-language/row.js
		/**
		 * Fallback selector used when the platform UI primitives module is
		 * absent from the running harness's static module table.
		 *
		 * The row must never be silently dropped: a harness generation that
		 * renames or drops the primitives package would otherwise lose the
		 * whole setting, which is indistinguishable from "the plugin is not
		 * installed". A native `<select>` covers the same contract ('open' is
		 * ignored; the control is always visible) using nothing but the React
		 * seat the slot renderer owns.
		 * @param props - the same composed props the primitives Menu receives.
		 * @returns the selector element.
		 */
		function FallbackMenu({ items, selectedId, onSelect }) {
			return element(
				"select",
				{
					className: "dshtl_selector",
					"aria-label": "thinking-language",
					value: selectedId,
					onChange: (event) => {
						onSelect(event.target.value);
					}
				},
				...items.map((item) => element("option", { key: item.id, value: item.id }, item.label))
			);
		}
		/** The menu component: the platform primitive when present, the fallback otherwise. */
		const rowMenu = primitives !== undefined && primitives.Menu !== undefined ? primitives.Menu : FallbackMenu;
		/**
		 * The chevron, by whichever name the running primitives package exports.
		 *
		 * This is the one icon the row draws, and its name is generation-specific:
		 * dsh 0.1.x shipped size-suffixed icons (`IconChevronDownOutline14`), dsh
		 * 0.2.x ships weight-suffixed ones (`IconChevronDownOutlineRegular`).
		 * Resolving the old name unguarded made the row render `undefined` as a
		 * component; React throws while rendering, the slot renderer drops the
		 * row, and the setting silently disappears from an otherwise healthy
		 * Settings panel. Absence now degrades to no icon, never to a lost row.
		 */
		const rowChevron =
			(primitives === undefined
				? undefined
				: primitives.IconChevronDownOutlineRegular ?? primitives.IconChevronDownOutline ?? primitives.IconChevronDownOutline14) ?? (() => null);
		/**
		 * Thinking-language picker row registered into the General section item
		 * slot. Setting-Cell layout, identical to the built-in Language and
		 * Permission rows: title + hint on the left, selector pill on the right.
		 * @param props - composed slot props.
		 * @returns the row element tree.
		 */
		function ThinkingLanguageRow({ t, setLanguage, useStore }) {
			const language = useStore((s) => s.language);
			const catalog = useStore((s) => s.catalog);
			const [open, setOpen] = react.useState(false);
			// `t` only exists while a locale face is installed; the renderer treats a
			// declared locale namespace without that face as a fatal assembly error,
			// so an older/leaner harness falls back to the raw keys instead of
			// taking the whole Settings panel down.
			const translate = typeof t === "function" ? t : (key) => key;
			const autoLabel = translate("lang.auto");
			const active = catalog.find((entry) => entry.id === language);
			const activeLabel = active !== void 0 && active.label !== undefined ? active.label : language === THINKING_LANGUAGE_DEFAULT ? autoLabel : language;
			const items = catalog.map((entry) => ({ id: entry.id, label: entry.label !== undefined ? entry.label : autoLabel }));
			return element(
				"div",
				{ className: "dshtl_row" },
				element(
					"div",
					{ className: "dshtl_rowText" },
					element("div", { className: "dshtl_title" }, translate("title")),
					element("div", { className: "dshtl_desc" }, translate("hint"))
				),
				element(rowMenu, {
					open,
					onClose: () => {
						setOpen(false);
					},
					items,
					selectedId: language,
					onSelect: (id) => {
						setLanguage(id);
						setOpen(false);
					},
					align: "end",
					portal: true,
					anchor: element(
						"button",
						{
							type: "button",
							className: "dshtl_selector",
							"aria-haspopup": "menu",
							"aria-expanded": open,
							onClick: () => {
								setOpen((value) => !value);
							}
						},
						activeLabel,
						element(rowChevron, { className: "dshtl_chevron" })
					)
				})
			);
		}
		//#endregion
		//#region dsh-thinking-language/index.js
		/** Dictionary namespace owned by this feature's settings row. */
		const SETTINGS_NS = "settings.thinking-language";
		/** Settings namespace owned by the host entry. */
		const THINKING_NS = "thinking-language";
		/** Field carrying the selected language id. */
		const THINKING_LANGUAGE_FIELD = "language";
		/**
		 * The row's only hard requirement.
		 *
		 * `slots` is the one service every harness with a Settings panel provides.
		 * The other services the row needs — the `locale` dictionaries and one of
		 * the two settings transport generations — are acquired through their own
		 * `ctx.inject` branches below, which WAIT for them instead of testing once
		 * — so a harness that lacks one loses a single feature rather than the
		 * whole bundle. `locale` in particular must be waited for: `slots` arrives
		 * before the transport, so this plugin's apply runs before the locale
		 * plugin is up, and a one-shot `ctx.get("locale")` check would skip the
		 * dictionary registration forever (the row would then render raw keys).
		 */
		const inject = ["slots"];
		/**
		 * Read one settings section defensively: the write path is remote — and
		 * absent entirely on a host that does not expose the namespace — so every
		 * read goes through a plain-object + string guard.
		 * @param snapshot - a scope snapshot.
		 * @returns the selected language id, or undefined.
		 */
		function languageOf(snapshot) {
			const section = snapshot !== null && typeof snapshot === "object" ? snapshot.value : undefined;
			if (section === null || typeof section !== "object" || Array.isArray(section)) return undefined;
			const language = section[THINKING_LANGUAGE_FIELD];
			return typeof language === "string" && language !== "" ? language : undefined;
		}
		/**
		 * The row requires the settings transport, but NOT as a bundle-level
		 * requirement: `ctx.inject` starts the row branch whenever the service
		 * appears, and a harness that never provides it loses only this row.
		 * {@link reportRowAvailability} makes that degradation visible in the log
		 * once the boot has settled, instead of leaving a silently missing row.
		 *
		 * The transport is named differently per generation — `configForms` on dsh
		 * 0.2.x, `settingsScope` before it — so both branches are installed and the
		 * first one to be served mounts the row. A harness serves one generation,
		 * never both, which is why the mounting is latched here.
		 */
		const ROW_AVAILABILITY_DELAY_MS = 5000;
		/** Set once a transport has mounted the row, so the other branch stands down. */
		let rowMounted = false;
		/**
		 * Client plugin body: register the row dictionaries and the picker row into
		 * the General section's item slot, mirroring the settings transport.
		 * @param ctx - browser plugin context.
		 */
		function apply(ctx) {
			// The dictionaries are registered on a branch that WAITS for `locale`.
			// This plugin only requires `slots`, so apply runs before the locale
			// plugin is up; checking `ctx.get("locale")` here instead would find
			// nothing and never register, leaving the row to render its raw keys.
			ctx.inject(["locale"], (localeCtx) => {
				localeCtx.effect(
					() =>
						localeCtx.locale.register(SETTINGS_NS, {
							zh,
							en,
							ru,
							fr,
							de,
							es,
							ar,
							pt,
							ja
						}),
					"thinking-language: row dictionaries"
				);
			});
			if (primitives === undefined) log(ctx, "the platform UI primitives module is unavailable; the settings row falls back to a native selector");
			reportRowAvailability(ctx);
			// The row declares `locale: SETTINGS_NS`, and the slot renderer treats a
			// declared namespace without an installed locale face as a fatal
			// assembly error — so the row waits for `locale` too, and its branch
			// starts only when the dictionaries above can exist.
			//
			// dsh 0.2.x publishes the transport as `configForms`, an entry per
			// Host-served namespace, and serves only namespaces the Host composed:
			// `whileServed` keeps the row in step with that.
			ctx.inject(["configForms", "locale"], (rowCtx) => {
				mountRow(rowCtx, () => ({
					form: rowCtx.configForms.get(THINKING_NS),
					described: describeView(rowCtx.configForms.describe()),
					watch: (register) => rowCtx.effect(() => rowCtx.configForms.whileServed([THINKING_NS], register), "thinking-language: settings row")
				}));
			});
			// dsh 0.1.x published the same form face as `settingsScope`. Injecting
			// only this name on a 0.2.x harness left the branch waiting forever for
			// a service that no longer exists: nothing registered, nothing failed,
			// and the row was simply absent from an otherwise healthy panel.
			ctx.inject(["settingsScope", "locale"], (rowCtx) => {
				mountRow(rowCtx, () => ({
					form: rowCtx.settingsScope.bind({ namespace: THINKING_NS }),
					described: typeof rowCtx.settingsScope.describe === "function" ? describeQuietly(rowCtx.settingsScope) : undefined,
					watch: (register) => register()
				}));
			});
		}
		/**
		 * Mount the picker row through whichever settings transport answered.
		 *
		 * `transport()` resolves that generation's form face (getSnapshot /
		 * subscribe / set / unset), its describe face, and a `watch` that registers
		 * the row while the Host serves its namespace. It runs at most once, since
		 * a harness serves exactly one transport generation.
		 * @param ctx - browser plugin context of the winning branch.
		 * @param transport - resolves the transport's faces on demand.
		 */
		function mountRow(ctx, transport) {
			if (rowMounted) return;
			let resolved;
			try {
				resolved = transport();
			} catch (error) {
				log(ctx, `the settings transport rejected the ${THINKING_NS} namespace`, error);
				return;
			}
			rowMounted = true;
			const form = resolved.form;
			const store = createThinkingLanguageStore();
			// The catalog is derived from the HOST-registered schema, so the picker
			// can never drift from the languages the host understands. A harness
			// whose describe() is unavailable falls back to the bundled copy.
			const catalog = readCatalog(resolved.described, THINKING_NS);
			let bound;
			const sync = () => {
				if (bound === undefined) return;
				const snapshot = form.getSnapshot();
				bound.sync(languageOf(snapshot) ?? THINKING_LANGUAGE_DEFAULT, catalog, typeof snapshot?.revision === "number" ? snapshot.revision : 0);
			};
			ctx.effect(() => form.subscribe(sync), "thinking-language: settings scope adoption");
			const injected = (actions) => {
				bound = actions;
				sync();
				return {
					setLanguage: (language) => {
						const write = language === THINKING_LANGUAGE_DEFAULT ? () => form.unset(THINKING_LANGUAGE_FIELD) : () => form.set(THINKING_LANGUAGE_FIELD, language);
						writeQuietly(ctx, write);
					}
				};
			};
			resolved.watch(() =>
				ctx.slots.inject("settings.general.item", () =>
					ctx.slots.register(
						{
							name: "settings.general.item",
							id: "thinking-language",
							order: 20,
							store,
							locale: SETTINGS_NS,
							inject: injected
						},
						ThinkingLanguageRow
					)
				)
			);
		}
		/** describe() is a best-effort read: an older or remote scope may not answer it. */
		function describeQuietly(settingsScope) {
			try {
				return settingsScope.describe();
			} catch {
				return undefined;
			}
		}
		/**
		 * Warn once when the row never became available, so a harness missing the
		 * services it waits for is diagnosed instead of silently showing no picker.
		 * Those services usually arrive within the same boot, so the check is
		 * deferred rather than run at apply time.
		 * @param ctx - browser plugin context (for its logger).
		 */
		function reportRowAvailability(ctx) {
			if (typeof setTimeout !== "function") return;
			const timer = setTimeout(() => {
				if (rowMounted) return;
				const transports = ["configForms", "settingsScope"].filter((service) => ctx.get(service) !== undefined);
				if (transports.length === 0) {
					log(ctx, "neither the configForms nor the settingsScope service is available; the settings row is disabled");
					return;
				}
				const missing = ["locale"].filter((service) => ctx.get(service) === undefined);
				if (missing.length > 0) {
					log(ctx, `the ${missing.join(" and ")} service is unavailable; the settings row is disabled`);
					return;
				}
				log(ctx, `the settings row did not mount on ${transports.join("/")}; the Host may not serve the ${THINKING_NS} namespace`);
			}, ROW_AVAILABILITY_DELAY_MS);
			if (timer !== null && typeof timer === "object" && typeof timer.unref === "function") timer.unref();
		}
		/**
		 * Start a durable write without letting a rejection escape into the row's
		 * click handler; the settings scope's own snapshot refresh is what makes
		 * the new value visible (or absent, when the Host refuses it).
		 */
		function writeQuietly(ctx, write) {
			try {
				const pending = write();
				if (pending !== undefined && typeof pending.then === "function") pending.then(undefined, (error) => log(ctx, "settings write failed", error));
			} catch (error) {
				log(ctx, "settings write failed", error);
			}
		}
		/** Report one degradation through the harness logger when it has one. */
		function log(ctx, message, error) {
			const logger = ctx.get("logger");
			const line = `thinking-language: ${message}`;
			if (logger !== undefined && typeof logger.warn === "function") logger.warn(line, error);
			else if (error !== undefined) console.warn(line, error);
			else console.warn(line);
		}
		//#endregion
		exports.SETTINGS_NS = SETTINGS_NS;
		exports.THINKING_LANGUAGE_DEFAULT = THINKING_LANGUAGE_DEFAULT;
		exports.apply = apply;
		exports.inject = inject;
		exports.findNamespaceSchema = findNamespaceSchema;
		exports.readCatalog = readCatalog;
		exports.readEnumField = readEnumField;
		return module.exports;
	}
});
