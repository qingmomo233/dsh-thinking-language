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
 *  - `settings.register()` returns an owner scope on newer harnesses; passing
 *    that scope to {@link resolveLanguage} keeps reads correct if the
 *    namespace is re-registered, while older harnesses keep working through
 *    `settings.get(ns)`.
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
	return z.object({ [THINKING_LANGUAGE_FIELD]: field });
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

/** The read handle for one application context (the scope when available, else the service). */
function languageReader(ctx) {
	return registration.scope ?? ctx.get("settings");
}

/**
 * Register the settings namespace once, tolerating a harness that refuses it.
 * @returns the namespace scope, or undefined when registration was refused.
 */
function ensureNamespace(ctx) {
	if (registration.attempted) return registration.scope;
	registration.attempted = true;
	try {
		registration.scope = trackSettingsScope(ctx.get("settings").register(THINKING_NAMESPACE, Config));
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
		effective: resolveLanguage(settings, ctx.get("settings"))
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
					: (patch) => settings.update(THINKING_NAMESPACE, patch);
			try {
				await write({ [THINKING_LANGUAGE_FIELD]: parsed.id });
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
