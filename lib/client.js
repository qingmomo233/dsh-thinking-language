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
		 * This table is only the last-resort fallback for a harness whose
		 * `settingsScope.describe()` is missing, still loading, or shaped
		 * differently; `test/plugin.test.mjs` fails when the fallback and the host
		 * catalog drift apart.
		 */
		const FALLBACK_LANGUAGES = [
			{ id: "auto" },
			{ id: "zh-CN", label: "简体中文 · Simplified Chinese" },
			{ id: "zh-TW", label: "繁體中文 · Traditional Chinese" },
			{ id: "en", label: "English · English" },
			{ id: "ru", label: "Русский · Russian" },
			{ id: "fr", label: "Français · French" },
			{ id: "de", label: "Deutsch · German" },
			{ id: "es", label: "Español · Spanish" },
			{ id: "pt", label: "Português · Portuguese" },
			{ id: "it", label: "Italiano · Italian" },
			{ id: "ja", label: "日本語 · Japanese" },
			{ id: "ko", label: "한국어 · Korean" },
			{ id: "ar", label: "العربية · Arabic" },
			{ id: "hi", label: "हिन्दी · Hindi" },
			{ id: "tr", label: "Türkçe · Turkish" },
			{ id: "vi", label: "Tiếng Việt · Vietnamese" },
			{ id: "th", label: "ไทย · Thai" },
			{ id: "pl", label: "Polski · Polish" },
			{ id: "uk", label: "Українська · Ukrainian" },
			{ id: "nl", label: "Nederlands · Dutch" },
			{ id: "sv", label: "Svenska · Swedish" },
			{ id: "id", label: "Bahasa Indonesia · Indonesian" },
			{ id: "cs", label: "Čeština · Czech" }
		];
		/** The "follow the system" value shared with the host schema. */
		const THINKING_LANGUAGE_DEFAULT = "auto";
		/**
		 * Find one namespace's serialized schema in whatever shape
		 * `settingsScope.describe()` returns (a bare array on some builds, a
		 * `{ namespaces }` object on others).
		 * @param described - the describe() result.
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
			"hint": "选择模型思考过程（推理/链式思考）使用的语言。对当前会话的下一次模型调用即生效。",
			"lang.auto": "跟随系统（自动）"
		};
		/** English dictionary. */
		const en = {
			"title": "Thinking language",
			"hint": "Language used for the model's reasoning/thinking process. Applies from the next model call.",
			"lang.auto": "Follow the system (auto)"
		};
		/** Russian dictionary. */
		const ru = {
			"title": "Язык размышлений",
			"hint": "Язык для процесса рассуждений модели. Применяется со следующего вызова модели.",
			"lang.auto": "Следовать за системой (авто)"
		};
		/** French dictionary. */
		const fr = {
			"title": "Langue de réflexion",
			"hint": "Langue utilisée pour le raisonnement du modèle. S'applique dès le prochain appel.",
			"lang.auto": "Suivre le système (auto)"
		};
		/** German dictionary. */
		const de = {
			"title": "Denksprache",
			"hint": "Sprache für den Denkprozess des Modells. Gilt ab dem nächsten Modellaufruf.",
			"lang.auto": "Dem System folgen (auto)"
		};
		/** Spanish dictionary. */
		const es = {
			"title": "Idioma de razonamiento",
			"hint": "Idioma para el proceso de razonamiento del modelo. Se aplica desde la próxima llamada.",
			"lang.auto": "Seguir al sistema (auto)"
		};
		/** Japanese dictionary. */
		const ja = {
			"title": "思考言語",
			"hint": "モデルの思考プロセスで使う言語。次のモデル呼び出しから適用されます。",
			"lang.auto": "システムに従う（自動）"
		};
		/** Korean dictionary. */
		const ko = {
			"title": "사고 언어",
			"hint": "모델의 추론 과정에 사용할 언어입니다. 다음 모델 호출부터 적용됩니다.",
			"lang.auto": "시스템 따르기 (자동)"
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
				element(primitives.Menu, {
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
						element(primitives.IconChevronDownOutline14, { className: "dshtl_chevron" })
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
		 * `slots` is the one service every harness with a Settings panel provides;
		 * `settingsScope` is acquired through its own `ctx.inject` branch below so
		 * a harness missing it loses the row instead of the whole bundle, and
		 * `locale` is optional by design (the row falls back to raw keys).
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
		 */
		const ROW_AVAILABILITY_DELAY_MS = 5000;
		/**
		 * Client plugin body: register the row dictionaries and the picker row into
		 * the General section's item slot, mirroring the settings scope.
		 * @param ctx - browser plugin context.
		 */
		function apply(ctx) {
			const locale = ctx.get("locale");
			if (locale !== undefined) {
				ctx.effect(
					() =>
						locale.register(SETTINGS_NS, {
							zh,
							en,
							ru,
							fr,
							de,
							es,
							ja,
							ko
						}),
					"thinking-language: row dictionaries"
				);
			}
			if (primitives === undefined) {
				log(ctx, "the platform UI primitives module is unavailable; the settings row is disabled");
				return;
			}
			reportRowAvailability(ctx);
			ctx.inject(["settingsScope"], (rowCtx) => {
				const host = rowCtx.settingsScope.bind({ namespace: THINKING_NS });
				const store = createThinkingLanguageStore();
				// The catalog is derived from the HOST-registered schema, so the picker
				// can never drift from the languages the host understands. A harness
				// whose describe() is unavailable falls back to the bundled copy.
				const catalog = readCatalog(typeof rowCtx.settingsScope.describe === "function" ? describeQuietly(rowCtx.settingsScope) : undefined, THINKING_NS);
				let bound;
				const sync = () => {
					if (bound === undefined) return;
					const snapshot = host.getSnapshot();
					bound.sync(languageOf(snapshot) ?? THINKING_LANGUAGE_DEFAULT, catalog, snapshot?.revision ?? 0);
				};
				ctx.effect(() => host.subscribe(sync), "thinking-language: settings scope adoption");
				const injected = (actions) => {
					bound = actions;
					sync();
					return {
						setLanguage: (language) => {
							const write = language === THINKING_LANGUAGE_DEFAULT ? () => host.unset(THINKING_LANGUAGE_FIELD) : () => host.set(THINKING_LANGUAGE_FIELD, language);
							writeQuietly(rowCtx, write);
						}
					};
				};
				rowCtx.slots.inject("settings.general.item", () =>
					rowCtx.slots.register(
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
				);
			});
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
		 * Warn once when the row never became available, so a harness without the
		 * settings transport is diagnosed instead of silently missing the picker.
		 * The scope usually arrives within the same boot, so the check is deferred.
		 * @param ctx - browser plugin context (for its logger).
		 */
		function reportRowAvailability(ctx) {
			if (typeof setTimeout !== "function") return;
			const timer = setTimeout(() => {
				if (ctx.get("settingsScope") !== undefined) return;
				log(ctx, "the settings transport (settingsScope) is unavailable; the settings row is disabled — the /thinking-language command still works");
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
