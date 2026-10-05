/**
 * dsh-thinking-language — host entry: switch the language of the agent's
 * thinking/reasoning process.
 *
 * Registers the `thinking-language` settings namespace, injects a
 * system-prompt section that tells the model to write its chain-of-thought in
 * the selected language (evaluated per prompt assembly), and injects a dynamic
 * prompt context that re-states the choice on every model step.
 *
 * The browser half (`./client`) renders the language picker row in Settings →
 * General and writes the same namespace, so both surfaces stay in sync.
 *
 * Compatibility notes (why this file looks the way it does):
 *
 *  - Every service is acquired through its own nested `ctx.inject` branch. A
 *    harness without `systemPrompt` still gets the settings namespace instead
 *    of a fiber that never activates.
 *  - Two settings generations are supported. DSH 0.1.x has
 *    `settings.register(ns, schema)` and hands back an owner scope; DSH 0.2.x
 *    dropped it — the namespace *is* this plugin's profile entry, keyed by the
 *    entry id (`thinking-language`), and is served only when the exported
 *    `Config` declares a volatile field. The namespace is therefore claimed
 *    defensively: whichever generation is present is used, an absent one logs
 *    once, and the prompt surfaces keep working either way.
 *  - The preference is read from the live source of its generation: the
 *    registered scope on 0.1.x, and this plugin's own resolved config on
 *    0.2.x, where a volatile field is a `createVolatile()` reference whose
 *    owning runtime updates it in place.
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
	languageForSystemLocale,
	languageLabel,
	localeChain,
	resolveLanguage,
	thinkingInstruction,
	thinkingReminder,
	trackSettingsScope
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
 *
 * The field is marked volatile for the same reason: DSH 0.2.x derives both the
 * served namespace list and the writable-path set from `meta.volatile`
 * (`volatileForm()` / `isVolatilePath()` in `@deepseek-ai/dsh-settings`), so an
 * unmarked schema is a namespace the Settings UI cannot see. Harnesses whose
 * schemastery predates the decorator get the unmarked field and keep the 0.1.x
 * `register()`-based read path.
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
	return z.object({ [THINKING_LANGUAGE_FIELD]: typeof field.volatile === "function" ? field.volatile() : field });
}

/** Durable settings schema; the schema default is `auto` (follow the system locale). */
export const Config = buildSettingsSchema();

/**
 * The single namespace claim this plugin owns: the settings service used for
 * reads, the namespace scope `settings.register()` returned when the harness
 * provides one (DSH 0.1.x), and this plugin's own resolved config (DSH 0.2.x,
 * where the entry itself is the namespace).
 *
 * Module-level state is enough because the settings namespace is a process
 * singleton: a second registration in the same process would be rejected as a
 * duplicate anyway, and `apply` is called once per plugin fiber.
 */
const registration = {
	/** Set once the claim was attempted, so a refused attempt is not retried per branch. */
	attempted: false,
	/** The namespace scope, when the harness returns one. */
	scope: undefined,
	/** This plugin's resolved config, whose volatile fields are live references. */
	config: undefined
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
	registration.config = undefined;
}

/**
 * The read handle for one application context: the registered scope, else this
 * plugin's own live config, else the settings service itself.
 */
function languageReader(ctx) {
	return registration.scope ?? registration.config ?? ctx.get("settings");
}

/**
 * Claim the settings namespace once, tolerating a harness that has neither
 * generation available.
 *
 * @param ctx - the settings-injected context, used for the service and effects.
 * @param fiber - the plugin's own fiber, which owns the settings presentation.
 * @returns the namespace scope on the generation that has one, else undefined.
 */
function ensureNamespace(ctx, fiber) {
	if (registration.attempted) return registration.scope;
	registration.attempted = true;
	const settings = ctx.get("settings");
	try {
		if (typeof settings.register === "function") {
			// DSH 0.1.x: the plugin hands over its namespace and schema, and later
			// reads the live section back through the returned owner scope.
			registration.scope = trackSettingsScope(settings.register(THINKING_NAMESPACE, Config));
			return registration.scope;
		}
		if (typeof settings.configure === "function") {
			// DSH 0.2.x: this plugin's profile entry IS the namespace, keyed by
			// the entry id and served from the exported `Config`; the only thing
			// left to declare is that the instance draws its own settings row
			// (the browser half) instead of an auto-generated page. The owner
			// fiber must be the plugin's own, because that is the fiber the
			// settings service looks the policy up by.
			ctx.effect(() => settings.configure({ auto: false }, fiber));
		}
	} catch (error) {
		// A harness that already owns the namespace (or validates registrations
		// more strictly) must not take the prompt surfaces down with it: log once
		// and keep reading through whatever handle is left.
		const logger = ctx.get("logger");
		if (logger !== undefined && typeof logger.warn === "function") logger.warn("thinking-language: settings namespace not registered", error);
	}
	return registration.scope;
}

/** The current setting plus the effective instruction language for one context. */
function readLanguage(ctx) {
	// The preference comes from the generation's live source (scope or own
	// config); the system locale lives in another namespace and can only be read
	// through the settings service itself.
	const settings = languageReader(ctx);
	return {
		settings,
		language: currentLanguage(settings),
		effective: resolveLanguage(settings, ctx.get("settings"))
	};
}

/**
 * Register the settings namespace and the reasoning-language prompt surfaces.
 * @param ctx - Host plugin context.
 * @param config - this plugin's resolved config; on DSH 0.2.x its volatile
 *   field is the live preference and the read handle for the prompt surfaces.
 */
export function apply(ctx, config) {
	if (config !== undefined && config !== null) registration.config = config;
	const fiber = ctx.fiber;
	ctx.inject(["settings"], (settingsCtx) => {
		ensureNamespace(settingsCtx, fiber);
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
}

export {
	FALLBACK_THINKING_LANGUAGE,
	THINKING_LANGUAGE_DEFAULT,
	THINKING_LANGUAGE_FIELD,
	THINKING_LANGUAGE_IDS,
	THINKING_LANGUAGES,
	THINKING_NAMESPACE,
	currentLanguage,
	languageForSystemLocale,
	languageLabel,
	localeChain,
	resolveLanguage,
	thinkingInstruction,
	thinkingReminder
};
