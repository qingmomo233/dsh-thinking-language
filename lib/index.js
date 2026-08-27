import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
//#region lib/types/languages.js
/**
 * The thinking-language catalog: ids shared by the settings schema, the
 * system-prompt section, the `/thinking-language` command, and the browser
 * settings row (the client bundle keeps its own copy of `id`/`native`).
 */
const THINKING_LANGUAGES = [
	{ id: "zh-CN", name: "Simplified Chinese", native: "简体中文" },
	{ id: "zh-TW", name: "Traditional Chinese", native: "繁體中文" },
	{ id: "en", name: "English", native: "English" },
	{ id: "ru", name: "Russian", native: "Русский" },
	{ id: "fr", name: "French", native: "Français" },
	{ id: "de", name: "German", native: "Deutsch" },
	{ id: "es", name: "Spanish", native: "Español" },
	{ id: "pt", name: "Portuguese", native: "Português" },
	{ id: "it", name: "Italian", native: "Italiano" },
	{ id: "ja", name: "Japanese", native: "日本語" },
	{ id: "ko", name: "Korean", native: "한국어" },
	{ id: "ar", name: "Arabic", native: "العربية" },
	{ id: "hi", name: "Hindi", native: "हिन्दी" },
	{ id: "tr", name: "Turkish", native: "Türkçe" },
	{ id: "vi", name: "Vietnamese", native: "Tiếng Việt" },
	{ id: "th", name: "Thai", native: "ไทย" },
	{ id: "pl", name: "Polish", native: "Polski" },
	{ id: "uk", name: "Ukrainian", native: "Українська" },
	{ id: "nl", name: "Dutch", native: "Nederlands" },
	{ id: "sv", name: "Swedish", native: "Svenska" },
	{ id: "id", name: "Indonesian", native: "Bahasa Indonesia" },
	{ id: "cs", name: "Czech", native: "Čeština" }
];
/** The "follow the system" value: the model thinks in the system/UI locale. */
const THINKING_LANGUAGE_DEFAULT = "auto";
const THINKING_LANGUAGE_IDS = THINKING_LANGUAGES.map((language) => language.id);
const THINKING_LANGUAGE_BY_ID = new Map(THINKING_LANGUAGES.map((language) => [language.id, language]));
/** Locale settings namespace owned by the host locale plugin (`@deepseek-ai/dsh-client-locale`). */
const LOCALE_SETTINGS_NAMESPACE = settingsNamespace("locale");
/** Field carrying an explicit system-locale selection; absence delegates to the browser. */
const LOCALE_PREFERENCE_FIELD = "preference";
/** Fallback system locale matching the browser client's fallback (`FALLBACK_LOCALE`). */
const FALLBACK_SYSTEM_LOCALE = "zh";
//#endregion
//#region lib/types/index.js
/**
 * dsh-thinking-language — switch the language of the agent's
 * thinking/reasoning process.
 *
 * Host entry: registers the `thinking-language` settings namespace, injects a
 * system-prompt section that tells the model to write its chain-of-thought in
 * the selected language (evaluated per prompt assembly, so the change applies
 * to every new session), and registers the `/thinking-language` command.
 *
 * The browser half (`./client`) renders the language picker row in Settings →
 * General and writes the same namespace, so both surfaces stay in sync.
 */
/** Stable Cordis plugin name. */
const name = "thinking-language";
/** Plugin-level service requirements: none — every service is acquired through nested `ctx.inject` branches. */
const inject = [];
/** Settings namespace owning the thinking-language preference. */
const THINKING_NAMESPACE = settingsNamespace("thinking-language");
/** Field carrying the selected language id. */
const THINKING_LANGUAGE_FIELD = "language";
/** Durable settings schema; the schema default is `auto` (follow the system). */
const ThinkingLanguageSettingsSchema = z.object({ [THINKING_LANGUAGE_FIELD]: z.union([THINKING_LANGUAGE_DEFAULT, ...THINKING_LANGUAGE_IDS]).default(THINKING_LANGUAGE_DEFAULT) });
/** Human-readable current value for the command reply. */
function describeLanguage(language) {
	if (language === void 0 || language === THINKING_LANGUAGE_DEFAULT) return `${THINKING_LANGUAGE_DEFAULT} (follow the system)`;
	const meta = THINKING_LANGUAGE_BY_ID.get(language);
	return meta === void 0 ? language : `${meta.id} (${meta.native}, ${meta.name})`;
}
/** Map one system locale to the thinking-language id that follows it. */
function thinkingLanguageForSystemLocale(locale) {
	return locale === "en" ? "en" : "zh-CN";
}
/**
 * Resolve the effective thinking-language id for one settings snapshot:
 * `auto` follows the system locale (`locale.preference`, browser fallback
 * `zh` when unset); any explicit id passes through unchanged.
 */
function resolveLanguage(settings) {
	const language = currentLanguage(settings);
	if (language !== THINKING_LANGUAGE_DEFAULT) return language;
	const locale = settings?.get(LOCALE_SETTINGS_NAMESPACE)?.[LOCALE_PREFERENCE_FIELD] ?? FALLBACK_SYSTEM_LOCALE;
	return thinkingLanguageForSystemLocale(locale);
}
/** Compose the model instruction for one language id. */
function thinkingInstruction(language) {
	if (language === void 0 || language === THINKING_LANGUAGE_DEFAULT) return "";
	const meta = THINKING_LANGUAGE_BY_ID.get(language);
	if (meta === void 0) return "";
	return [
		`The user configured the language of your thinking/reasoning process: ${meta.native} (${meta.name}).`,
		`Write your entire internal reasoning — chain-of-thought, analysis, planning, and deliberation — in ${meta.name}.`,
		"Keep code, identifiers, file paths, and technical terms as they are.",
		"Your final answer to the user follows the user's own language; this setting never changes the final answer language."
	].join(" ");
}
/**
 * Compose the per-message dynamic reminder for one language id. Registered as
 * a prompt context, it is appended right after the user's message on every
 * model step, so the model re-reads it at each call and a language switch
 * takes effect on the very next call — no restart.
 */
function thinkingReminder(language) {
	if (language === void 0 || language === THINKING_LANGUAGE_DEFAULT) return "";
	const meta = THINKING_LANGUAGE_BY_ID.get(language);
	if (meta === void 0) return "";
	return `[Thinking language] The user wants your reasoning/thinking process written in ${meta.native} (${meta.name}). Continue your entire chain-of-thought in ${meta.name}. Your final answer follows the user's own language.`;
}
/** Read the current thinking-language preference (schema default when absent). */
function currentLanguage(settings) {
	return settings?.get(THINKING_NAMESPACE)?.[THINKING_LANGUAGE_FIELD] ?? THINKING_LANGUAGE_DEFAULT;
}
/** Parse one command argument into a language id or a clear error. */
function parseCommandArgument(raw) {
	const trimmed = raw.trim().toLowerCase();
	if (trimmed === "") return { kind: "show" };
	if (trimmed === "auto" || trimmed === "default" || trimmed === "reset") return { kind: "set", id: THINKING_LANGUAGE_DEFAULT };
	const exact = THINKING_LANGUAGE_BY_ID.get(trimmed);
	if (exact !== void 0) return { kind: "set", id: exact.id };
	const lower = trimmed.toLowerCase();
	const byNative = THINKING_LANGUAGES.find((language) => language.native.toLowerCase() === lower);
	if (byNative !== void 0) return { kind: "set", id: byNative.id };
	const byName = THINKING_LANGUAGES.find((language) => language.name.toLowerCase() === lower);
	if (byName !== void 0) return { kind: "set", id: byName.id };
	return { kind: "invalid" };
}
/** The `/thinking-language` usage line. */
function usageLine() {
	return `Usage: /thinking-language <id> — ids: ${THINKING_LANGUAGE_IDS.join(", ")} (or "auto" to follow the system locale)`;
}
/**
 * Register the settings namespace, the reasoning-language prompt section, and
 * the `/thinking-language` command.
 * @param ctx - Host plugin context.
 */
function apply(ctx) {
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.register(THINKING_NAMESPACE, ThinkingLanguageSettingsSchema);
	});
	ctx.inject(["systemPrompt", "settings"], (promptCtx) => {
		promptCtx.systemPrompt.section({
			name: "app:thinking-language",
			order: 85,
			text: () => thinkingInstruction(resolveLanguage(promptCtx.get("settings")))
		});
		// Per-step dynamic reminder: appended after the user message on every
		// model call, so the language switches immediately (next call) without
		// a restart and the model keeps following it even in long sessions.
		promptCtx.systemPrompt.context({
			name: "app:thinking-language-reminder",
			order: 1000,
			text: () => thinkingReminder(resolveLanguage(promptCtx.get("settings")))
		});
	});
	ctx.inject(["commands", "settings"], (commandsCtx) => {
		const handler = async (invocation) => {
			const parsed = parseCommandArgument(invocation.rawInput);
			if (parsed.kind === "invalid") return { kind: "error", text: `Unknown language "${invocation.rawInput.trim()}". ${usageLine()}` };
			const settings = commandsCtx.get("settings");
			const before = currentLanguage(settings);
			if (parsed.kind === "show") return { kind: "success", text: `Thinking language is currently ${describeLanguage(before)}. ${usageLine()}` };
			if (parsed.id === before) return { kind: "success", text: `Thinking language is already ${describeLanguage(before)}.` };
			await settings.update(THINKING_NAMESPACE, { [THINKING_LANGUAGE_FIELD]: parsed.id });
			return {
				kind: "success",
				text: `Thinking language set to ${describeLanguage(parsed.id)}. It takes effect on the next model call — current and future turns switch immediately, no restart needed.`
			};
		};
		commandsCtx.effect(() => commandsCtx.commands.register({
			name: "thinking-language",
			description: "Set the language of the agent's thinking/reasoning process",
			handler
		}), "thinking-language: /thinking-language command");
	});
}
//#endregion
export { THINKING_LANGUAGE_DEFAULT, THINKING_LANGUAGE_FIELD, THINKING_LANGUAGES, THINKING_NAMESPACE, ThinkingLanguageSettingsSchema as Config, apply, currentLanguage, describeLanguage, inject, name, resolveLanguage, thinkingInstruction, thinkingReminder, usageLine };
