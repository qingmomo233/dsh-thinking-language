/**
 * dsh-thinking-language — host entry: switch the language of the agent's
 * thinking/reasoning process.
 *
 * Registers the `thinking-language` settings namespace, injects a
 * system-prompt section that tells the model to write its chain-of-thought in
 * the selected language (evaluated per prompt assembly), injects a dynamic
 * prompt context that re-states the choice on every model step, and registers
 * the `/thinking-language` command.
 *
 * The browser half (`./client`) renders the language picker row in Settings →
 * General and writes the same namespace, so both surfaces stay in sync.
 *
 * Compatibility notes (why this file looks the way it does):
 *
 *  - Every service is acquired through its own nested `ctx.inject` branch. A
 *    harness without `commands` (or without `systemPrompt`) still gets the
 *    other halves of the plugin instead of a fiber that never activates.
 *  - The settings namespace is registered defensively: a harness that refuses
 *    the registration (duplicate namespace, stricter `register` signature)
 *    logs once and keeps the prompt/command surfaces working against the
 *    settings service.
 *  - `settings.register()` owns the preference on a harness that still exposes
 *    the namespace API, and the scope it returns is passed to
 *    {@link resolveLanguage} so reads stay correct if the namespace is
 *    re-registered. A harness that instead keys a document by Loader entry id
 *    exposes no `register()`, and its preference is read from `describe()` and
 *    written through `update()`; {@link settingsReader} bridges both.
 */
import z from "@deepseek-ai/schemastery";
import {
	FALLBACK_THINKING_LANGUAGE,
	THINKING_LANGUAGE_DEFAULT,
	THINKING_LANGUAGE_FIELD,
	THINKING_LANGUAGE_IDS,
	THINKING_LANGUAGES,
	THINKING_NAMESPACE,
	currentLanguage,
	describeLanguage,
	languageForSystemLocale,
	languageLabel,
	localeChain,
	parseCommandArgument,
	resolveLanguage,
	thinkingInstruction,
	thinkingReminder,
	trackSettingsScope,
	usageLine
} from "./languages.js";

/** Stable Cordis plugin name. */
export const name = "thinking-language";

/** Plugin-level service requirements: none — every service is acquired through nested `ctx.inject` branches. */
export const inject = [];

/**
 * Build the durable settings schema.
 *
 * The field carries per-language metadata (`description` = endonym plus
 * English name) so a configuration form can render a friendly enum label, and
 * so the browser row can derive its picker from the registered schema instead
 * of keeping a second copy of the catalog. `description()` is applied only
 * when the installed schemastery provides it, and the construction falls back
 * to a plain union — an unknown-builder harness still gets a valid schema.
 */
function buildSettingsSchema() {
	const languageValues = [THINKING_LANGUAGE_DEFAULT, ...THINKING_LANGUAGE_IDS];
	const consts = languageValues.map((value) => {
		const label = languageLabel(value);
		const base = z.const(value);
		if (label === undefined) return base;
		// `description()` returns a labelled copy; the original stays untouched so
		// a schemastery without it still yields a usable, if unlabelled, schema.
		return typeof base.description === "function" ? base.description(label) : base;
	});
	const field = z.union(consts).default(THINKING_LANGUAGE_DEFAULT);
	// A settings document is editable only through the fields its Config marks
	// live, and a schema without one is refused as having no volatile fields —
	// so the preference itself must carry the mark. `extra()` is the primitive
	// the `volatile()` builder wraps, and it is the one every schemastery
	// generation this plugin can resolve provides.
	const live = typeof field.extra === "function" ? field.extra("volatile", true) : field;
	return z.object({ [THINKING_LANGUAGE_FIELD]: live });
}

/** Durable settings schema; the schema default is `auto` (follow the system locale). */
export const Config = buildSettingsSchema();

/**
 * The single namespace registration this plugin owns: the settings service
 * used for reads, plus the namespace scope `settings.register()` returned when
 * the harness provides one.
 *
 * Module-level state is enough because the settings namespace is a process
 * singleton: a second registration in the same process would be rejected as a
 * duplicate anyway, and `apply` is called once per plugin fiber.
 */
const registration = {
	/** Set once the registration was attempted, so a refused attempt is not retried per branch. */
	attempted: false,
	/** The namespace scope, when the harness returns one. */
	scope: undefined
};

/**
 * Forget the recorded registration so the next `apply` registers again.
 *
 * The settings namespace is a process singleton, so this exists for the two
 * flows where a fresh registration attempt is the point: a development reload
 * that swaps the plugin body, and a test that exercises a harness refusing the
 * registration.
 */
export function resetRegistration() {
	registration.attempted = false;
	registration.scope = undefined;
}

/** Loader entry id that owns this plugin's settings document. */
const THINKING_ENTRY_ID = "thinking-language";

/** How long one document read is reused; prompt assembly reads it on every model step. */
const DESCRIBE_TTL_MS = 1000;

/** Entry sections from the last document read, with the time it was taken. */
let describeCache;

/** Drop the cached sections so the next read observes a write made now. */
function invalidateSettingsCache() {
	describeCache = undefined;
}

/**
 * Read one entry's section from the settings document.
 *
 * The settings service keys a document by Loader entry id and reports the live
 * value through `describe()`; an entry whose Config declares no live field is
 * absent from that answer, which reads here as an absent section.
 *
 * @param settings - the settings service.
 * @param ns - Loader entry id.
 * @returns the entry's stored section, or undefined.
 */
function describeSection(settings, ns) {
	if (settings === undefined || settings === null || typeof settings.describe !== "function") return undefined;
	const now = Date.now();
	if (describeCache === undefined || now - describeCache.at >= DESCRIBE_TTL_MS) {
		let descriptors;
		try {
			descriptors = settings.describe();
		} catch {
			descriptors = undefined;
		}
		const sections = new Map();
		if (Array.isArray(descriptors)) {
			for (const descriptor of descriptors) {
				const value = descriptor?.value;
				if (descriptor?.ns === undefined || value === null || typeof value !== "object" || Array.isArray(value)) continue;
				sections.set(descriptor.ns, value);
			}
		}
		describeCache = { at: now, sections };
	}
	return describeCache.sections.get(ns);
}

/**
 * Adapt the settings service to the `get()`-style handles the language core
 * reads from: a namespace scope answers `get()`, the service answers
 * `get(ns)`, and both translate here into one entry-section lookup. A service
 * that still carries the namespace API is passed through untouched.
 *
 * @param settings - the settings service.
 * @returns a handle the core can read a namespace section from.
 */
function settingsReader(settings) {
	if (settings !== undefined && settings !== null && typeof settings.get === "function") return settings;
	return {
		get: (ns) => describeSection(settings, typeof ns === "string" ? ns : THINKING_ENTRY_ID)
	};
}

/** The read handle for one application context (the scope when available, else the service). */
function languageReader(ctx) {
	return registration.scope ?? settingsReader(ctx.get("settings"));
}

/**
 * Register the settings namespace once, tolerating a harness that refuses it.
 * @returns the namespace scope, or undefined when registration was refused.
 */
function ensureNamespace(ctx) {
	if (registration.attempted) return registration.scope;
	registration.attempted = true;
	const settings = ctx.get("settings");
	// A harness that keys settings documents by Loader entry id needs no
	// namespace registration: the entry's own Config is the document.
	if (settings === undefined || typeof settings.register !== "function") return undefined;
	try {
		registration.scope = trackSettingsScope(settings.register(THINKING_NAMESPACE, Config));
	} catch (error) {
		// A harness that already owns the namespace (or validates registrations
		// more strictly) must not take the prompt and command surfaces down with
		// it: log once and keep reading through the settings service.
		const logger = ctx.get("logger");
		if (logger !== undefined && typeof logger.warn === "function") logger.warn("thinking-language: settings namespace not registered", error);
	}
	return registration.scope;
}

/** The current setting plus the effective instruction language for one context. */
function readLanguage(ctx) {
	const settings = languageReader(ctx);
	// The system locale lives in another namespace, so it is always read through
	// the settings service — a namespace scope can only see its own section.
	return {
		settings,
		language: currentLanguage(settings),
		effective: resolveLanguage(settings, settingsReader(ctx.get("settings")))
	};
}

/**
 * Register the settings namespace, the reasoning-language prompt section, and
 * the `/thinking-language` command.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
	ctx.inject(["settings"], (settingsCtx) => {
		ensureNamespace(settingsCtx);
	});
	ctx.inject(["systemPrompt", "settings"], (promptCtx) => {
		// Registered before the first assembly that needs it; the section text is
		// evaluated per assembly, so the choice applies to every new session.
		promptCtx.systemPrompt.section({
			name: "app:thinking-language",
			order: 85,
			text: () => thinkingInstruction(readLanguage(promptCtx).effective)
		});
		// Per-step dynamic reminder: appended after the user message on every
		// model call, so a language switch takes effect on the next call even in
		// a session whose system prompt was assembled earlier.
		promptCtx.systemPrompt.context({
			name: "app:thinking-language-reminder",
			order: 1000,
			text: () => thinkingReminder(readLanguage(promptCtx).effective)
		});
	});
	ctx.inject(["commands", "settings"], (commandsCtx) => {
		const handler = async (invocation) => {
			const parsed = parseCommandArgument(invocation?.rawInput ?? "");
			if (parsed.kind === "invalid") {
				return { kind: "error", text: `Unknown language "${String(invocation?.rawInput ?? "").trim()}". ${usageLine()}` };
			}
			const settings = commandsCtx.get("settings");
			const before = currentLanguage(languageReader(commandsCtx));
			if (parsed.kind === "show") {
				return { kind: "success", text: `Thinking language is currently ${describeLanguage(before)}. ${usageLine()}` };
			}
			if (parsed.id === before) {
				return { kind: "success", text: `Thinking language is already ${describeLanguage(before)}.` };
			}
			const scope = registration.scope;
			const write =
				scope !== undefined && typeof scope.update === "function"
					? (patch) => scope.update(patch)
					: async (patch) => {
						if (typeof settings.update !== "function") throw new Error("the settings service does not accept updates");
						await settings.update(THINKING_ENTRY_ID, patch);
					};
			try {
				await write({ [THINKING_LANGUAGE_FIELD]: parsed.id });
				invalidateSettingsCache();
			} catch (error) {
				return { kind: "error", text: `Could not store the thinking language: ${error instanceof Error ? error.message : String(error)}` };
			}
			return {
				kind: "success",
				text: `Thinking language set to ${describeLanguage(parsed.id)}. It takes effect on the next model call — current and future turns switch immediately, no restart needed.`
			};
		};
		commandsCtx.effect(
			() =>
				commandsCtx.commands.register({
					name: "thinking-language",
					description: "Set the language of the agent's thinking/reasoning process",
					handler
				}),
			"thinking-language: /thinking-language command"
		);
	});
}

export {
	FALLBACK_THINKING_LANGUAGE,
	THINKING_LANGUAGE_DEFAULT,
	THINKING_LANGUAGE_FIELD,
	THINKING_LANGUAGE_IDS,
	THINKING_LANGUAGES,
	THINKING_NAMESPACE,
	currentLanguage,
	describeLanguage,
	languageForSystemLocale,
	languageLabel,
	localeChain,
	parseCommandArgument,
	resolveLanguage,
	thinkingInstruction,
	thinkingReminder,
	usageLine
};
