window.__ModuleLoader__.load({
	id: "dsh-plugin-thinking-language",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region \0dsh-css:dsh-plugin-thinking-language/row.css.mjs
		const css = ".dshtl_group{flex-direction:column;gap:6px;padding:16px 0;display:flex;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshtl_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.dshtl_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.dshtl_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;max-width:360px}.dshtl_select:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}";
		const tagId = "dsh-plugin-thinking-language/row.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-thinking-language";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/types/client/languages.js
		/**
		 * The browser copy of the language catalog (`id` + `native`). `id` values
		 * must match the host schema in lib/index.js; `native` is shown verbatim,
		 * so the picker needs no per-language locale entries. The "auto" entry
		 * (native absent) renders the locale key `lang.auto`.
		 */
		const THINKING_LANGUAGES = [
			{ id: "auto" },
			{ id: "zh-CN", native: "简体中文" },
			{ id: "zh-TW", native: "繁體中文" },
			{ id: "en", native: "English" },
			{ id: "ru", native: "Русский" },
			{ id: "fr", native: "Français" },
			{ id: "de", native: "Deutsch" },
			{ id: "es", native: "Español" },
			{ id: "pt", native: "Português" },
			{ id: "it", native: "Italiano" },
			{ id: "ja", native: "日本語" },
			{ id: "ko", native: "한국어" },
			{ id: "ar", native: "العربية" },
			{ id: "hi", native: "हिन्दी" },
			{ id: "tr", native: "Türkçe" },
			{ id: "vi", native: "Tiếng Việt" },
			{ id: "th", native: "ไทย" },
			{ id: "pl", native: "Polski" },
			{ id: "uk", native: "Українська" },
			{ id: "nl", native: "Nederlands" },
			{ id: "sv", native: "Svenska" },
			{ id: "id", native: "Bahasa Indonesia" },
			{ id: "cs", native: "Čeština" }
		];
		/** The "no instruction" value shared with the host schema. */
		const THINKING_LANGUAGE_DEFAULT = "auto";
		/** Settings namespace owned by the host entry. */
		const THINKING_NS = "thinking-language";
		/** Field carrying the selected language id. */
		const THINKING_LANGUAGE_FIELD = "language";
		//#endregion
		//#region lib/types/client/locales.js
		/** `settings.thinking-language` dictionaries (the picker row's copy). */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"title": "思考语言",
			"hint": "选择模型思考过程（推理/链式思考）使用的语言，新会话生效。",
			"lang.auto": "跟随模型（自动）"
		};
		/** English dictionary. */
		const en = {
			"title": "Thinking language",
			"hint": "Language used for the model's reasoning/thinking process. Applies to new sessions.",
			"lang.auto": "Follow the model (auto)"
		};
		/** Russian dictionary. */
		const ru = {
			"title": "Язык размышлений",
			"hint": "Язык для процесса рассуждений модели. Применяется к новым сессиям.",
			"lang.auto": "Следовать за моделью (авто)"
		};
		/** French dictionary. */
		const fr = {
			"title": "Langue de réflexion",
			"hint": "Langue utilisée pour le raisonnement du modèle. S'applique aux nouvelles sessions.",
			"lang.auto": "Suivre le modèle (auto)"
		};
		/** German dictionary. */
		const de = {
			"title": "Denksprache",
			"hint": "Sprache für den Denkprozess des Modells. Gilt für neue Sitzungen.",
			"lang.auto": "Dem Modell folgen (auto)"
		};
		/** Spanish dictionary. */
		const es = {
			"title": "Idioma de razonamiento",
			"hint": "Idioma para el proceso de razonamiento del modelo. Se aplica a sesiones nuevas.",
			"lang.auto": "Seguir al modelo (auto)"
		};
		/** Japanese dictionary. */
		const ja = {
			"title": "思考言語",
			"hint": "モデルの思考プロセスで使う言語。新しいセッションに適用されます。",
			"lang.auto": "モデルに従う（自動）"
		};
		/** Korean dictionary. */
		const ko = {
			"title": "사고 언어",
			"hint": "모델의 추론 과정에 사용할 언어입니다. 새 세션에 적용됩니다.",
			"lang.auto": "모델 따르기 (자동)"
		};
		//#endregion
		//#region lib/types/client/settings-store.js
		/**
		 * Picker row store: a mirror of the settings scope snapshot. The apply-world
		 * scope listener is the only writer; the row reads via props.useStore.
		 */
		/**
		 * Declares the row state and write surface.
		 * @returns the store handle.
		 */
		function createThinkingLanguageStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					language: THINKING_LANGUAGE_DEFAULT,
					revision: -1
				}),
				actions: {
					sync: (d, language, revision) => {
						if (d.language === language && revision <= d.revision) return;
						d.language = language;
						d.revision = revision;
					}
				}
			});
		}
		//#endregion
		//#region lib/types/client/row.js
		/**
		 * Thinking-language picker row registered into the General section item
		 * slot (next to the built-in Appearance and Language rows).
		 * @param props - composed slot props.
		 * @returns the row element tree.
		 */
		function ThinkingLanguageRow({ t, setLanguage, useStore }) {
			const language = useStore((s) => s.language);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dshtl_group",
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: "dshtl_title",
						children: t("title")
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: "dshtl_hint",
						children: t("hint")
					}),
					(0, react_jsx_runtime.jsx)("select", {
						className: "dshtl_select",
						value: language,
						onChange: (event) => {
							setLanguage(event.target.value);
						},
						children: THINKING_LANGUAGES.map((lang) => (0, react_jsx_runtime.jsx)("option", {
							value: lang.id,
							children: lang.native !== void 0 ? lang.native : t("lang.auto")
						}, lang.id))
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Dictionary namespace owned by this feature's settings row. */
		const SETTINGS_NS = "settings.thinking-language";
		/** Required services (cordis fiber inject): settings transport plus slots/locale for the row. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope"
		];
		/**
		 * Client plugin body: register the row dictionaries and the picker row into
		 * the General section's item slot, mirroring the settings scope.
		 * @param ctx - browser plugin context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(SETTINGS_NS, {
				zh,
				en,
				ru,
				fr,
				de,
				es,
				ja,
				ko
			}), "thinking-language: row dictionaries");
			const store = createThinkingLanguageStore();
			let bound;
			const host = ctx.settingsScope.bind({ namespace: THINKING_NS });
			const sync = () => {
				if (bound === void 0) return;
				const snapshot = host.getSnapshot();
				const language = snapshot.value !== void 0 && typeof snapshot.value.language === "string" ? snapshot.value.language : THINKING_LANGUAGE_DEFAULT;
				bound.sync(language, snapshot.revision ?? 0);
			};
			ctx.effect(() => host.subscribe(sync), "thinking-language: settings scope adoption");
			const injected = (actions) => {
				bound = actions;
				sync();
				return {
					setLanguage: (language) => {
						if (language === THINKING_LANGUAGE_DEFAULT) void host.unset(THINKING_LANGUAGE_FIELD);
						else void host.set(THINKING_LANGUAGE_FIELD, language);
					}
				};
			};
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "thinking-language",
				order: 20,
				store,
				locale: SETTINGS_NS,
				inject: injected
			}, ThinkingLanguageRow));
		}
		//#endregion
		exports.SETTINGS_NS = SETTINGS_NS;
		exports.THINKING_LANGUAGES = THINKING_LANGUAGES;
		exports.THINKING_LANGUAGE_DEFAULT = THINKING_LANGUAGE_DEFAULT;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
