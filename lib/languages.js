/**
 * dsh-thinking-language — the pure core: the thinking-language catalog, the
 * system-locale → thinking-language resolution, and the model-facing texts.
 *
 * Every export here is free of cordis, Node builtins, and browser globals, so
 * the same facts drive the settings schema, the system-prompt section, the
 * `/thinking-language` command, and the test suite.
 *
 * The browser half (`lib/client.js`) cannot import this file: a DSH client
 * bundle is served as one self-contained factory per package, and its
 * `require` resolves only platform seed words and other registered client
 * bundles — never a relative path inside the package. The client therefore
 * keeps its own copy of the catalog (for its last-resort fallback) and reads
 * the authoritative copy from the host-registered settings schema at runtime;
 * `smoke-test.mjs` fails when the two copies drift.
 */

/**
 * The thinking-language catalog: ids shared by the settings schema, the
 * system-prompt section, the `/thinking-language` command, and the browser
 * settings row.
 *
 * `native` is the endonym shown verbatim in the picker. `regionless` marks the
 * entry a language-only request resolves to (`fr` → `fr`, `ja` → `ja`); the
 * Chinese entries deliberately omit it, because script and region — not the
 * bare `zh` — decide between Simplified and Traditional.
 */
export const THINKING_LANGUAGES = [
	{ id: "zh-CN", name: "Simplified Chinese", native: "简体中文" },
	{ id: "zh-TW", name: "Traditional Chinese", native: "繁體中文" },
	{ id: "en", name: "English", native: "English", regionless: true },
	{ id: "ru", name: "Russian", native: "Русский", regionless: true },
	{ id: "fr", name: "French", native: "Français", regionless: true },
	{ id: "de", name: "German", native: "Deutsch", regionless: true },
	{ id: "es", name: "Spanish", native: "Español", regionless: true },
	{ id: "pt", name: "Portuguese", native: "Português", regionless: true },
	{ id: "it", name: "Italian", native: "Italiano", regionless: true },
	{ id: "ja", name: "Japanese", native: "日本語", regionless: true },
	{ id: "ko", name: "Korean", native: "한국어", regionless: true },
	{ id: "ar", name: "Arabic", native: "العربية", regionless: true },
	{ id: "hi", name: "Hindi", native: "हिन्दी", regionless: true },
	{ id: "tr", name: "Turkish", native: "Türkçe", regionless: true },
	{ id: "vi", name: "Vietnamese", native: "Tiếng Việt", regionless: true },
	{ id: "th", name: "Thai", native: "ไทย", regionless: true },
	{ id: "pl", name: "Polish", native: "Polski", regionless: true },
	{ id: "uk", name: "Ukrainian", native: "Українська", regionless: true },
	{ id: "nl", name: "Dutch", native: "Nederlands", regionless: true },
	{ id: "sv", name: "Swedish", native: "Svenska", regionless: true },
	{ id: "id", name: "Indonesian", native: "Bahasa Indonesia", regionless: true },
	{ id: "cs", name: "Czech", native: "Čeština", regionless: true }
];

/** The "follow the system" value: the model thinks in the system/UI locale. */
export const THINKING_LANGUAGE_DEFAULT = "auto";

/** The catalog ids, in catalog order (the settings-schema enum order). */
export const THINKING_LANGUAGE_IDS = THINKING_LANGUAGES.map((language) => language.id);

/** Catalog lookup by lowercase id. */
const LANGUAGE_BY_ID = new Map(THINKING_LANGUAGES.map((language) => [language.id.toLowerCase(), language]));

/** Catalog lookup by the id a regionless request resolves to. */
const REGIONLESS_ID = new Map(
	THINKING_LANGUAGES.filter((language) => language.regionless === true).map((language) => [language.id.split("-")[0], language.id])
);

/** Settings namespace owning the thinking-language preference. */
export const THINKING_NAMESPACE = "thinking-language";

/** Field carrying the selected language id. */
export const THINKING_LANGUAGE_FIELD = "language";

/** Locale settings namespace owned by the host locale plugin (`@deepseek-ai/dsh-client-locale`). */
export const LOCALE_SETTINGS_NAMESPACE = "locale";

/** Field carrying an explicit system-locale selection; absence delegates to the browser. */
export const LOCALE_PREFERENCE_FIELD = "preference";

/**
 * The thinking language used when the system locale matches no catalog entry.
 *
 * `en` mirrors the shell locale plugin's own terminal fallback
 * (`@deepseek-ai/dsh-client-locale` resolves an unknown browser language to
 * `en`), so an unrecognised locale now lands on the same language the UI does.
 */
export const FALLBACK_THINKING_LANGUAGE = "en";

/** A BCP 47-ish tag: language, optional 4-letter script, optional region. */
const LOCALE_TAG = /^([a-z]{2,3})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?$/;

/**
 * Normalize one locale tag into its matching chain, most specific first:
 * `zh-Hant-TW` → `["zh-hant-tw", "zh-hant", "zh-tw", "zh"]`,
 * `en-US` → `["en-us", "en"]`. Anything that is not a language tag yields an
 * empty chain.
 */
export function localeChain(locale) {
	if (typeof locale !== "string") return [];
	const normalized = locale.trim().toLowerCase().replace(/_/g, "-");
	const match = LOCALE_TAG.exec(normalized);
	if (match === null) return [];
	const [, language, script, region] = match;
	const chain = [normalized];
	if (script !== undefined) chain.push(`${language}-${script}`);
	if (region !== undefined) chain.push(`${language}-${region}`);
	if (!chain.includes(language)) chain.push(language);
	return chain;
}

/**
 * Chinese needs one explicit rule because its two catalog entries share a
 * language subtag and the script — not the region — decides between them:
 * `zh`, `zh-Hans`, and `zh-CN` mean Simplified, while `zh-Hant`, `zh-TW`,
 * `zh-HK`, and `zh-MO` mean Traditional. `zh-Hant-HK` therefore lands on
 * Traditional Chinese even though `zh-HK` is not itself a catalog id.
 */
const CHINESE_FALLBACK = new Map([
	["hans", "zh-CN"],
	["hant", "zh-TW"],
	["cn", "zh-CN"],
	["sg", "zh-CN"],
	["my", "zh-CN"],
	["tw", "zh-TW"],
	["hk", "zh-TW"],
	["mo", "zh-TW"]
]);

/**
 * Resolve one system locale to a catalog entry, honoring the tag hierarchy:
 * exact id, then region, then language, then the regionless default.
 *
 * The previous implementation mapped only `en` to English and dropped every
 * other locale (including `zh-TW`, `ja`, `ko`, and `de`) onto Simplified
 * Chinese; this resolves the whole catalog instead.
 *
 * @param locale - the system/UI locale, e.g. `en`, `en-US`, `zh-Hant-TW`.
 * @returns the matching catalog entry, or undefined when nothing matches.
 */
export function languageForSystemLocale(locale) {
	const chain = localeChain(locale);
	for (const tag of chain) {
		const exact = LANGUAGE_BY_ID.get(tag);
		if (exact !== undefined) return exact;
		const regionless = REGIONLESS_ID.get(tag);
		if (regionless !== undefined) return LANGUAGE_BY_ID.get(regionless);
	}
	for (const tag of chain) {
		if (!tag.startsWith("zh")) continue;
		for (const subtag of tag.split("-").slice(1)) {
			const resolved = CHINESE_FALLBACK.get(subtag);
			if (resolved !== undefined) return LANGUAGE_BY_ID.get(resolved.toLowerCase());
		}
		return LANGUAGE_BY_ID.get("zh-cn");
	}
	return undefined;
}

/** The `auto` entry's picker label, stored as schema metadata for the browser row. */
export const AUTO_SYSTEM_LOCALE_LABEL = "Follow the system locale";

/**
 * The JSON-schema metadata label describing one language id, or undefined when
 * the id is not in the catalog. Used when building the settings schema so a
 * configuration form (and the browser picker, which reads the registered
 * schema) can label an enum value without a second copy of the catalog.
 *
 * @param id - a catalog id or {@link THINKING_LANGUAGE_DEFAULT}.
 * @returns the endonym plus English name, or undefined.
 */
export function languageLabel(id) {
	if (id === THINKING_LANGUAGE_DEFAULT) return AUTO_SYSTEM_LOCALE_LABEL;
	const meta = catalogEntry(id);
	return meta === undefined ? undefined : `${meta.native} · ${meta.name}`;
}

/**
 * Resolve the effective thinking-language id for one settings snapshot:
 * `auto` follows the system locale (`locale.preference`, then the caller's
 * browser-derived fallback, then {@link FALLBACK_THINKING_LANGUAGE}); any
 * explicit id passes through unchanged even when the catalog no longer knows
 * it, so a hand-edited settings document is never silently rewritten.
 *
 * @param settings - the handle carrying the thinking-language preference.
 * @param services - optional settings service used to read the locale
 *   namespace; the preference handle itself may be a namespace scope, which
 *   cannot see any other namespace.
 * @param systemLocale - the browser-derived locale, when the host knows one.
 * @returns the effective catalog id used for instructions.
 */
export function resolveLanguage(settings, services, systemLocale) {
	const preference = currentLanguage(settings);
	if (preference !== THINKING_LANGUAGE_DEFAULT) return preference;
	const stored = storedSystemLocale(services ?? settings);
	const candidates = [typeof stored === "string" && stored !== "" ? stored : undefined, systemLocale, FALLBACK_THINKING_LANGUAGE];
	for (const candidate of candidates) {
		const matched = languageForSystemLocale(candidate);
		if (matched !== undefined) return matched.id;
	}
	return FALLBACK_THINKING_LANGUAGE;
}

/**
 * Read the system locale stored by the locale plugin, tolerating a settings
 * service that is absent, unregistered, or holding a malformed section.
 */
function storedSystemLocale(settings) {
	if (settings === undefined || settings === null || typeof settings.get !== "function") return undefined;
	let section;
	try {
		section = settings.get(LOCALE_SETTINGS_NAMESPACE);
	} catch {
		return undefined;
	}
	if (section === null || typeof section !== "object" || Array.isArray(section)) return undefined;
	const preference = section[LOCALE_PREFERENCE_FIELD];
	return typeof preference === "string" ? preference : undefined;
}

/**
 * Read the current thinking-language preference.
 *
 * Both accepted inputs are real service shapes: a settings service exposes
 * `get(ns)`, while the namespace scope returned by
 * `settings.register(ns, schema)` (DSH >= 0.2.x) exposes `get()` with no
 * argument. Passing the service keeps the plugin working on harnesses whose
 * `register()` returns nothing useful.
 *
 * @param settings - the settings service or one registered namespace scope.
 * @returns the stored id, or {@link THINKING_LANGUAGE_DEFAULT} when absent.
 */
export function currentLanguage(settings) {
	if (settings === undefined || settings === null) return THINKING_LANGUAGE_DEFAULT;
	const section = readSection(settings);
	if (section === null || typeof section !== "object" || Array.isArray(section)) return THINKING_LANGUAGE_DEFAULT;
	const language = section[THINKING_LANGUAGE_FIELD];
	return typeof language === "string" && language !== "" ? language : THINKING_LANGUAGE_DEFAULT;
}

/**
 * Namespace scopes this plugin already registered, so a read can pick the
 * right `get` arity: a scope reads its own namespace with `get()`, while the
 * settings service reads one namespace with `get(ns)`. Runtime feature
 * detection cannot separate the two reliably — a fake or partial service may
 * answer either call — so registration, which is the only place that knows
 * for certain, records the handle here.
 */
const REGISTERED_SCOPES = new WeakSet();

/**
 * Remember a namespace scope returned by `settings.register()`.
 * @param scope - the value `register()` returned, whatever shape it has.
 * @returns the same value, for call-site convenience.
 */
export function trackSettingsScope(scope) {
	if (scope !== null && typeof scope === "object") REGISTERED_SCOPES.add(scope);
	return scope;
}

/** Read a namespace section through whichever `get` arity the handle supports. */
function readSection(handle) {
	if (typeof handle.get !== "function") return undefined;
	if (REGISTERED_SCOPES.has(handle)) return safeGet(() => handle.get());
	const byNamespace = safeGet(() => handle.get(THINKING_NAMESPACE));
	return byNamespace === undefined ? safeGet(() => handle.get()) : byNamespace;
}

/** Call one reader, treating any refusal (unregistered, disposed, malformed) as absent. */
function safeGet(read) {
	try {
		return read();
	} catch {
		return undefined;
	}
}

/** Human-readable current value for the command reply. */
export function describeLanguage(language) {
	if (language === undefined || language === THINKING_LANGUAGE_DEFAULT) return `${THINKING_LANGUAGE_DEFAULT} (follow the system locale)`;
	const meta = LANGUAGE_BY_ID.get(String(language).toLowerCase());
	return meta === undefined ? language : `${meta.id} (${meta.native}, ${meta.name})`;
}

/** Compose the model instruction for one language id; `auto` and unknown ids yield "". */
export function thinkingInstruction(language) {
	const meta = catalogEntry(language);
	if (meta === undefined) return "";
	return [
		`The user configured the language of your thinking/reasoning process: ${meta.native} (${meta.name}).`,
		`Write your entire internal reasoning — chain-of-thought, analysis, planning, and deliberation — in ${meta.name}.`,
		"Keep code, identifiers, file paths, and technical terms as they are.",
		"Your final answer to the user follows the user's own language; this setting never changes the final answer language."
	].join(" ");
}

/**
 * Compose the per-message dynamic reminder for one language id.
 *
 * Registered as a prompt context, it is appended right after the user's
 * message on every model step, so the model re-reads it at each call and a
 * language switch takes effect on the very next call — no restart, and no
 * dependence on the session's already-assembled system prompt.
 */
export function thinkingReminder(language) {
	const meta = catalogEntry(language);
	if (meta === undefined) return "";
	return `[Thinking language] The user wants your reasoning/thinking process written in ${meta.native} (${meta.name}). Continue your entire chain-of-thought in ${meta.name}. Your final answer follows the user's own language.`;
}

/** The catalog entry for one stored value; `auto`, absent, and unknown ids yield undefined. */
function catalogEntry(language) {
	if (typeof language !== "string" || language === "" || language === THINKING_LANGUAGE_DEFAULT) return undefined;
	return LANGUAGE_BY_ID.get(language.toLowerCase());
}

/** The `/thinking-language` usage line. */
export function usageLine() {
	return `Usage: /thinking-language <id> — ids: ${THINKING_LANGUAGE_IDS.join(", ")} (or "auto" to follow the system locale)`;
}

/**
 * Parse one command argument into a language id or a clear outcome.
 *
 * Accepted in order: empty (show), the reset words, an exact id
 * (case-insensitive), an exact native endonym, an exact English name, then a
 * unique prefix of either name — so `/thinking-language 日本語` and
 * `/thinking-language zh` both work.
 */
export function parseCommandArgument(raw) {
	const trimmed = typeof raw === "string" ? raw.trim() : "";
	if (trimmed === "") return { kind: "show" };
	const lower = trimmed.toLowerCase();
	if (lower === THINKING_LANGUAGE_DEFAULT || lower === "default" || lower === "reset") return { kind: "set", id: THINKING_LANGUAGE_DEFAULT };
	const exact = LANGUAGE_BY_ID.get(lower);
	if (exact !== undefined) return { kind: "set", id: exact.id };
	const byNative = THINKING_LANGUAGES.find((language) => language.native.toLowerCase() === lower);
	if (byNative !== undefined) return { kind: "set", id: byNative.id };
	const byName = THINKING_LANGUAGES.find((language) => language.name.toLowerCase() === lower);
	if (byName !== undefined) return { kind: "set", id: byName.id };
	const byPrefix = THINKING_LANGUAGES.filter(
		(language) => language.id.toLowerCase().startsWith(lower) || language.name.toLowerCase().startsWith(lower)
	);
	if (byPrefix.length === 1) return { kind: "set", id: byPrefix[0].id };
	// A language-only tag that names several catalog entries (`zh`) still
	// resolves through the same region/script rules the system locale uses.
	const normalized = LANGUAGE_BY_ID.get(lower)?.id ?? languageForSystemLocale(lower)?.id;
	return normalized === undefined ? { kind: "invalid" } : { kind: "set", id: normalized };
}
