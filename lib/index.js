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
 *    0.2.x, where a volatile field is a reference its owning runtime updates
 *    in place.
 *  - A volatile-capable schemastery is not required. The field is marked
 *    volatile directly and the reference is built by this plugin against
 *    cosmokit's shared `Symbol.for` protocol (`markVolatile` /
 *    `withVolatileReference`), so a profile whose lockfile pinned an older
 *    schemastery — one without the `.volatile()` decorator — is still served a
 *    live, writable namespace instead of a silently missing settings page.
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
 * The shared key of cosmokit's volatile-reference protocol.
 *
 * References are recognized through a global symbol rather than by class
 * identity, so a reference built here is understood by the harness's own
 * cosmokit copy however many copies of the library are installed.
 */
const VOLATILE_WRITE = Symbol.for("cosmokit.volatile.write");

/**
 * Wrap a parsed value in a volatile reference.
 *
 * This is the shape `createVolatile()` produces in a current cosmokit, and
 * what schemastery 3.18.4's resolver returns for a `volatile()` field: a frozen
 * reference whose value only its owning runtime swaps. The Settings service
 * hands the running fiber's reference to the Loader, which compares it with
 * `deepEqual(…, true)` — references always compare equal to each other — and
 * commits changed values with `updateVolatile()` without remounting the
 * plugin. The reference is therefore what makes a settings write live.
 */
function volatileReference(value) {
	let current = value;
	return Object.freeze({
		get: () => current,
		[VOLATILE_WRITE]: (next) => {
			current = next;
		}
	});
}

/** Whether a parsed value already is a volatile reference (from any cosmokit copy). */
function isVolatileReference(value) {
	return typeof value === "object" && value !== null && VOLATILE_WRITE in value;
}

/**
 * Mark a schema field as volatile.
 *
 * `volatileForm()` reads this marker to decide whether the namespace is served
 * at all, and `isVolatilePath()` reads it for every write, so it must be set
 * even where the decorator is missing: `.volatile()` arrived in schemastery
 * 3.18.4, while an installed copy pinned by a stale lockfile can be an older
 * 3.18.x that only carries `meta`.
 */
function markVolatile(field) {
	if (typeof field.volatile === "function") return field.volatile();
	field.meta = { ...field.meta, volatile: true };
	return field;
}

/**
 * Make a schema resolve its volatile field into a live reference.
 *
 * A config is parsed through the schema's own Standard-Schema face
 * (`Config["~standard"].validate`), which the Loader calls for every config
 * update, so this is the one place a reference can be introduced when the
 * installed schemastery does not create one itself. A schemastery that already
 * wraps volatile fields returns a reference, which passes through untouched;
 * `vendor` is preserved so the Loader keeps diffing the config as schemastery
 * and takes its in-place update path.
 */
function withVolatileReference(schema) {
	const face = schema["~standard"];
	const validate = face.validate;
	Object.defineProperty(schema, "~standard", {
		configurable: true,
		get() {
			return {
				version: face.version,
				vendor: face.vendor,
				validate: (value, options) => {
					const result = validate(value, options);
					if (result === null || typeof result !== "object" || !("value" in result)) return result;
					const parsed = result.value;
					if (parsed === null || typeof parsed !== "object") return result;
					const current = Reflect.get(parsed, THINKING_LANGUAGE_FIELD);
					if (isVolatileReference(current)) return result;
					return { ...result, value: { ...parsed, [THINKING_LANGUAGE_FIELD]: volatileReference(current) } };
				}
			};
		}
	});
	return schema;
}

/**
 * Build the durable settings schema.
 *
 * The field carries per-language metadata (`description` = endonym plus
 * English name) so a configuration form can render a friendly enum label, and
 * so the browser page can derive its picker from the registered schema instead
 * of keeping a second copy of the catalog. `description()` is applied only
 * when the installed schemastery provides it, and the construction falls back
 * to a plain union — an unknown-builder harness still gets a valid schema.
 *
 * The field is marked volatile and resolves to a live reference: DSH 0.2.x
 * derives the served namespace list from `volatileForm()` and the writable
 * paths from `isVolatilePath()`, both of which key off that marker.
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
	const field = markVolatile(z.union(consts).default(THINKING_LANGUAGE_DEFAULT));
	return withVolatileReference(z.object({ [THINKING_LANGUAGE_FIELD]: field }));
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
