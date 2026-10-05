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
		 * does not seed takes the whole bundle — and with it the settings page —
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
		 * The platform's UI primitives module. Absence costs the page its dropdown
		 * (the native-selector fallback takes over), but absence is REPORTED rather
		 * than thrown so the plugin still registers its dictionaries and the page.
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
		 * a harness whose React is not a require-able seed word (the page is a
		 * single control anyway, and the slot renderer accepts whatever React it
		 * already has), and it removes the `react` peer requirement entirely.
		 */
		const platformReact = optionalRequire("react");
		/** Build one element, preferring the platform React and never throwing. */
		function element(type, props, ...children) {
			if (platformReact !== undefined && typeof platformReact.createElement === "function") return platformReact.createElement(type, props, ...children);
			return { type, props: { ...(props ?? {}), children: children.length > 1 ? children : children[0] } };
		}
		/**
		 * The hooks the page uses. A React-less platform cannot render the page at
		 * all (the slot renderer owns React), so these are inert stand-ins that
		 * keep module evaluation and the harmless paths working instead of
		 * throwing a TypeError on a missing platform module.
		 */
		const react = {
			useState: platformReact !== undefined && typeof platformReact.useState === "function" ? platformReact.useState : (initial) => [initial, () => {}]
		};
		//#endregion
		//#region dsh-thinking-language/page.css.mjs
		// The dedicated "Thinking language" settings page: a page heading, its
		// explanation, and one selector pill — the pill the built-in
		// Language/Permission rows draw. The shell's content column already pads
		// its children (`.options` in ui-settings-general), so the page only adds
		// the heading rhythm.
		const css = ".dshtl_page{max-width:760px;padding-top:20px;flex-direction:column;display:flex}.dshtl_heading{color:var(--dsw-alias-label-primary);margin:0;font-size:18px;font-weight:600;line-height:26px}.dshtl_intro{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:13px;line-height:20px}.dshtl_field{border-top:1px solid var(--dsw-alias-border-l2);margin-top:16px;padding:16px 0;align-items:center;display:flex}.dshtl_selector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.dshtl_selector:hover{background:var(--dsw-alias-interactive-bg-hover)}.dshtl_chevron{flex:none}";
		const tagId = "dsh-thinking-language/page.css";
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
		/** `settings.thinking-language` dictionaries (the settings page's copy). */
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
		 * Picker page store: a mirror of the settings scope snapshot. The
		 * apply-world scope listener is the only writer; the page reads it through
		 * props.useStore.
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
		 * draft unchanged (mirrors immer's `produce`), so the page's revision guard
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
		 * Declares the page's state and write surface.
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
		//#region dsh-thinking-language/page.js
		/**
		 * Fallback selector used when the platform UI primitives module is
		 * absent from the running harness's static module table.
		 *
		 * The page must never lose its control: a harness generation that
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
		 * This is the one icon the page draws, and its name is generation-specific:
		 * dsh 0.1.x shipped size-suffixed icons (`IconChevronDownOutline14`), dsh
		 * 0.2.x ships weight-suffixed ones (`IconChevronDownOutlineRegular`).
		 * Resolving the old name unguarded made the page render `undefined` as a
		 * component; React throws while rendering, the slot renderer drops the
		 * page, and the setting silently disappears from an otherwise healthy
		 * Settings panel. Absence now degrades to no icon, never to a lost page.
		 */
		const rowChevron =
			(primitives === undefined
				? undefined
				: primitives.IconChevronDownOutlineRegular ?? primitives.IconChevronDownOutline ?? primitives.IconChevronDownOutline14) ?? (() => null);
		/**
		 * The language selector: the one control the page draws, identical to the
		 * pill the built-in Language row uses (the same primitives `Menu`, the same
		 * generation-tolerant chevron, and a native `<select>` when the primitives
		 * package is absent).
		 * @param props - the locale face, the resolved selection and its catalog.
		 * @returns the selector element.
		 */
		function ThinkingLanguagePicker({ t, language, catalog, onSelect }) {
			const [open, setOpen] = react.useState(false);
			const translate = typeof t === "function" ? t : (key) => key;
			const autoLabel = translate("lang.auto");
			const active = catalog.find((entry) => entry.id === language);
			const activeLabel = active !== void 0 && active.label !== undefined ? active.label : language === THINKING_LANGUAGE_DEFAULT ? autoLabel : language;
			const items = catalog.map((entry) => ({ id: entry.id, label: entry.label !== undefined ? entry.label : autoLabel }));
			return element(rowMenu, {
				open,
				onClose: () => {
					setOpen(false);
				},
				items,
				selectedId: language,
				onSelect: (id) => {
					onSelect(id);
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
			});
		}
		/**
		 * The dedicated "Thinking language" settings page (settings → 思考语言),
		 * registered into the `settings.section` slot: its own nav entry, its own
		 * page, no cell borrowed from the General section.
		 * @param props - composed slot props (the locale face, the transport's
		 * inject face, and the page's store hook).
		 * @returns the page element tree.
		 */
		function ThinkingLanguageSection({ t, setLanguage, useStore }) {
			const language = useStore((s) => s.language);
			const catalog = useStore((s) => s.catalog);
			// `t` only exists while a locale face is installed; the renderer treats a
			// declared locale namespace without that face as a fatal assembly error,
			// so an older/leaner harness falls back to the raw keys instead of
			// taking the whole Settings panel down.
			const translate = typeof t === "function" ? t : (key) => key;
			return element(
				"div",
				{ className: "dshtl_page" },
				element("h2", { className: "dshtl_heading" }, translate("title")),
				element("div", { className: "dshtl_intro" }, translate("hint")),
				element("div", { className: "dshtl_field" }, element(ThinkingLanguagePicker, { t, language, catalog, onSelect: setLanguage }))
			);
		}
		//#endregion
		//#region dsh-thinking-language/index.js
		/** Dictionary namespace owned by this feature's settings page. */
		const SETTINGS_NS = "settings.thinking-language";
		/** Settings namespace owned by the host entry. */
		const THINKING_NS = "thinking-language";
		/** Field carrying the selected language id. */
		const THINKING_LANGUAGE_FIELD = "language";
		/**
		 * The page's only hard requirement.
		 *
		 * `slots` is the one service every harness with a Settings panel provides.
		 * The other services the page needs — the `locale` dictionaries and one of
		 * the two settings transport generations — are acquired through their own
		 * `ctx.inject` branches below, which WAIT for them instead of testing once
		 * — so a harness that lacks one loses a single feature rather than the
		 * whole bundle. `locale` in particular must be waited for: `slots` arrives
		 * before the transport, so this plugin's apply runs before the locale
		 * plugin is up, and a one-shot `ctx.get("locale")` check would skip the
		 * dictionary registration forever (the page would then render raw keys).
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
		 * The page requires the settings transport, but NOT as a bundle-level
		 * requirement: `ctx.inject` starts the registration branch whenever the
		 * service appears, and a harness that never provides it loses only this
		 * page. {@link reportPageAvailability} makes that degradation visible in
		 * the log once the boot has settled, instead of leaving a silently missing
		 * page.
		 *
		 * The transport is named differently per generation — `configForms` on dsh
		 * 0.2.x, `settingsScope` before it — so both branches are installed and the
		 * first one to be served mounts the page. A harness serves one generation,
		 * never both, which is why the mounting is latched here.
		 */
		const PAGE_AVAILABILITY_DELAY_MS = 5000;
		/** Set once a transport has mounted the page, so the other branch stands down. */
		let pageMounted = false;
		/**
		 * Client plugin body: register the page dictionaries and the "Thinking
		 * language" settings page, mirroring the settings transport.
		 * @param ctx - browser plugin context.
		 */
		function apply(ctx) {
			// The dictionaries are registered on a branch that WAITS for `locale`.
			// This plugin only requires `slots`, so apply runs before the locale
			// plugin is up; checking `ctx.get("locale")` here instead would find
			// nothing and never register, leaving the page to render its raw keys.
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
					"thinking-language: page dictionaries"
				);
			});
			if (primitives === undefined) log(ctx, "the platform UI primitives module is unavailable; the settings page falls back to a native selector");
			reportPageAvailability(ctx);
			// The page declares `locale: SETTINGS_NS`, and the slot renderer treats a
			// declared namespace without an installed locale face as a fatal
			// assembly error — so the page waits for `locale` too, and its branch
			// starts only when the dictionaries above can exist.
			//
			// dsh 0.2.x publishes the transport as `configForms`, an entry per
			// Host-served namespace, and serves only namespaces the Host composed:
			// `whileServed` keeps the page in step with that.
			ctx.inject(["configForms", "locale"], (pageCtx) => {
				mountPage(pageCtx, () => ({
					form: pageCtx.configForms.get(THINKING_NS),
					described: describeView(pageCtx.configForms.describe()),
					watch: (register) => pageCtx.effect(() => pageCtx.configForms.whileServed([THINKING_NS], register), "thinking-language: settings page")
				}));
			});
			// dsh 0.1.x published the same form face as `settingsScope`. Injecting
			// only this name on a 0.2.x harness left the branch waiting forever for
			// a service that no longer exists: nothing registered, nothing failed,
			// and the page was simply absent from an otherwise healthy panel.
			ctx.inject(["settingsScope", "locale"], (pageCtx) => {
				mountPage(pageCtx, () => ({
					form: pageCtx.settingsScope.bind({ namespace: THINKING_NS }),
					described: typeof pageCtx.settingsScope.describe === "function" ? describeQuietly(pageCtx.settingsScope) : undefined,
					watch: (register) => register()
				}));
			});
		}
		/**
		 * Mount the "Thinking language" settings page through whichever settings
		 * transport answered.
		 *
		 * `transport()` resolves that generation's form face (getSnapshot /
		 * subscribe / set / unset), its describe face, and a `watch` that registers
		 * the page while the Host serves its namespace. It runs at most once, since
		 * a harness serves exactly one transport generation.
		 * @param ctx - browser plugin context of the winning branch.
		 * @param transport - resolves the transport's faces on demand.
		 */
		function mountPage(ctx, transport) {
			if (pageMounted) return;
			let resolved;
			try {
				resolved = transport();
			} catch (error) {
				log(ctx, `the settings transport rejected the ${THINKING_NS} namespace`, error);
				return;
			}
			pageMounted = true;
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
			// The nav label is projected by the shell on every render, and a thunk is
			// re-read there — so it follows a locale switch without re-registering.
			// This branch waited for the locale face, so it is the one place that can
			// bind the dictionary; without it the label stays the English title.
			const locale = ctx.get("locale");
			const label = locale !== undefined && typeof locale.bind === "function" ? locale.bind(SETTINGS_NS) : undefined;
			resolved.watch(() =>
				ctx.slots.inject("settings.section", () =>
					ctx.slots.register(
						{
							name: "settings.section",
							id: THINKING_NS,
							order: 25,
							label: () => (label === undefined ? "Thinking language" : label("title")),
							store,
							locale: SETTINGS_NS,
							inject: injected
						},
						ThinkingLanguageSection
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
		 * Warn once when the page never became available, so a harness missing the
		 * services it waits for is diagnosed instead of silently showing no picker.
		 * Those services usually arrive within the same boot, so the check is
		 * deferred rather than run at apply time.
		 * @param ctx - browser plugin context (for its logger).
		 */
		function reportPageAvailability(ctx) {
			if (typeof setTimeout !== "function") return;
			const timer = setTimeout(() => {
				if (pageMounted) return;
				const transports = ["configForms", "settingsScope"].filter((service) => ctx.get(service) !== undefined);
				if (transports.length === 0) {
					log(ctx, "neither the configForms nor the settingsScope service is available; the settings page is disabled");
					return;
				}
				const missing = ["locale"].filter((service) => ctx.get(service) === undefined);
				if (missing.length > 0) {
					log(ctx, `the ${missing.join(" and ")} service is unavailable; the settings page is disabled`);
					return;
				}
				log(ctx, `the settings page did not mount on ${transports.join("/")}; the Host may not serve the ${THINKING_NS} namespace`);
			}, PAGE_AVAILABILITY_DELAY_MS);
			if (timer !== null && typeof timer === "object" && typeof timer.unref === "function") timer.unref();
		}
		/**
		 * Start a durable write without letting a rejection escape into the page's
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
