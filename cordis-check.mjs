// Cordis-integration check for dsh-thinking-language.
//
// `smoke-test.mjs` runs the plugin against a hand-written fake context; this
// one runs it against the REAL cordis container with only the three services
// the plugin consumes replaced, so the plugin's `ctx.inject` nesting, its
// effect disposal, and its service access style are exercised as the harness
// itself would exercise them.
//
// Run with: node cordis-check.mjs
import { Context, Service } from "@deepseek-ai/cordis";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	Config,
	THINKING_LANGUAGE_FIELD,
	THINKING_NAMESPACE,
	apply,
	currentLanguage,
	name,
	resetRegistration
} from "./lib/index.js";

const failures = [];
const check = (label, ok, extra = "") => {
	console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
	if (!ok) failures.push(label);
};

/** A settings provider shaped like `@deepseek-ai/dsh-settings`. */
class FakeSettings extends Service {
	constructor(ctx, document) {
		super(ctx, "settings");
		this.document = document;
		this.registrations = new Map();
		this.revision = 0;
	}
	register(ns, schema) {
		this.registrations.set(ns, schema);
		return {
			get: () => this.document[ns],
			update: async (patch) => {
				this.document[ns] = { ...(this.document[ns] ?? {}), ...patch };
				this.revision += 1;
				return this.document[ns];
			},
			replace: async (section) => {
				this.document[ns] = section;
				return section;
			},
			watch: () => () => {}
		};
	}
	get(ns) {
		return this.document[ns];
	}
	async update(ns, patch) {
		this.document[ns] = { ...(this.document[ns] ?? {}), ...patch };
		this.revision += 1;
		return this.document[ns];
	}
}

/**
 * A system-prompt registry shaped like `@deepseek-ai/dsh-system-prompt`.
 *
 * The real package registers through `this.ctx.effect(...)`, and cordis binds
 * `this.ctx` to the CALLING plugin's fiber (the service proxy shadows the
 * context per call) — that is what makes prompt sections disappear when the
 * plugin unloads. The fake reproduces it by delegating every registration to
 * `ctx.effect`, which is the exact mechanism under test.
 */
class FakeSystemPrompt extends Service {
	constructor(ctx) {
		super(ctx, "systemPrompt");
		this.sections = new Map();
		this.contexts = new Map();
	}
	section(section) {
		const owner = this.ctx;
		return owner.effect(() => {
			this.sections.set(section.name, section);
			return () => this.sections.delete(section.name);
		}, "fake systemPrompt.section");
	}
	context(context) {
		const owner = this.ctx;
		return owner.effect(() => {
			this.contexts.set(context.name, context);
			return () => this.contexts.delete(context.name);
		}, "fake systemPrompt.context");
	}
}

/** A command registry shaped like `@deepseek-ai/dsh-commands` (same effect binding). */
class FakeCommands extends Service {
	constructor(ctx) {
		super(ctx, "commands");
		this.commands = new Map();
	}
	register(def) {
		const owner = this.ctx;
		return owner.effect(() => {
			this.commands.set(def.name, def);
			return () => this.commands.delete(def.name);
		}, "fake commands.register");
	}
}

const document = {};
const ctx = new Context();
const settings = new FakeSettings(ctx, document);
const systemPrompt = new FakeSystemPrompt(ctx);
const commands = new FakeCommands(ctx);

const plugin = await ctx.plugin({ name, inject: [], apply });
await plugin;

const registrations = [...settings.registrations.keys()];
check("namespace registered through the real container", registrations.includes(THINKING_NAMESPACE), registrations.join(","));
check("settings schema is the plugin's Config", settings.registrations.get(THINKING_NAMESPACE) === Config);
check("prompt section registered", systemPrompt.sections.has("app:thinking-language"));
check("prompt context registered", systemPrompt.contexts.has("app:thinking-language-reminder"));
check("command registered", commands.commands.has("thinking-language"));

// Real cordis evaluates the prompt thunks per call, so a settings write must be
// visible to the very next call with no reload.
const sectionText = () => systemPrompt.sections.get("app:thinking-language").text();
const contextText = () => systemPrompt.contexts.get("app:thinking-language-reminder").text();
document[THINKING_NAMESPACE] = { language: "ru" };
check("section text follows the stored value", sectionText().includes("Русский"));
check("context text follows the stored value", contextText().includes("Русский"));
await settings.update(THINKING_NAMESPACE, { language: "ja" });
check("section text follows a service write", sectionText().includes("日本語") && !sectionText().includes("Русский"));

const handler = commands.commands.get("thinking-language").handler;
const invoked = await handler({ rawInput: "de", agent: "a", signal: new AbortController().signal, commandId: "c1" });
check("command write succeeds", invoked.kind === "success", invoked.text);
check("command write landed in the document", document[THINKING_NAMESPACE]?.language === "de");
check("plugin reads back its own write", currentLanguage(settings) === "de");
const reset = await handler({ rawInput: "auto", agent: "a", signal: new AbortController().signal, commandId: "c2" });
check("reset succeeds", reset.kind === "success");
check("reset stores the auto value", document[THINKING_NAMESPACE]?.[THINKING_LANGUAGE_FIELD] === "auto");

// Disposal must remove every registration (cordis scopes them to the fiber).
const beforeDispose = {
	sections: systemPrompt.sections.size,
	contexts: systemPrompt.contexts.size,
	commands: commands.commands.size
};
await plugin.dispose();
check(
	"disposing the fiber removes every registration",
	systemPrompt.sections.size === 0 && systemPrompt.contexts.size === 0 && commands.commands.size === 0,
	JSON.stringify(beforeDispose)
);

// A container without the optional services must still boot the settings half
// and must not throw.
resetRegistration();
const bareDocument = {};
const bareCtx = new Context();
new FakeSettings(bareCtx, bareDocument);
const barePlugin = await bareCtx.plugin({ name, inject: [], apply });
await barePlugin;
check("bare container still registers the namespace", bareDocument !== undefined && [...bareCtx.settings.registrations.keys()].includes(THINKING_NAMESPACE));
check("bare container survives with no prompt/command services", true);
await barePlugin.dispose();

// --- client bundle: a LATE locale service must still get the dictionaries ----
//
// Regression guard. The browser half registers its row dictionaries through the
// `locale` service, which is NOT a bundle-level requirement (only `slots` is).
// `slots` becomes available before `settingsScope`, so this plugin's apply can
// run before the locale plugin is up: a one-shot `ctx.get("locale")` check
// silently skipped the registration forever and the row rendered raw keys
// (`title`, `hint`, `lang.auto`). The registration must instead WAIT for the
// service, which is what `ctx.inject` guarantees.
const clientStub = (spec) => {
	if (spec === "react") return { createElement: (type, props, ...children) => ({ type, props, children }), useState: (value) => [value, () => {}] };
	if (spec === "@deepseek-ai/dsh-client-ui-primitives") return { Menu: "Menu", IconChevronDownOutline14: "Icon" };
	throw new Error(`client bundle required an unavailable module: ${spec}`);
};
const captured = [];
globalThis.window = { __ModuleLoader__: { load: (registration) => captured.push(registration) } };
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "lib", "client.js")).href);
delete globalThis.window;
const clientBundle = captured[0].factory(clientStub);

class FakeSlots extends Service {
	constructor(ctx) {
		super(ctx, "slots");
		this.registrations = [];
	}
	inject(_name, callback) {
		callback();
		return () => {};
	}
	register(options, component) {
		this.registrations.push({ options, component });
		return () => {};
	}
}

const dictionaries = [];
const clientCtx = new Context();
const clientSlots = new FakeSlots(clientCtx);
clientCtx.provide("settingsScope", {
	bind: () => ({
		getSnapshot: () => ({ value: { language: "ru" }, revision: 1, writable: true }),
		subscribe: () => () => {},
		set: () => Promise.resolve(),
		unset: () => Promise.resolve()
	}),
	describe: () => ({ namespaces: [{ ns: THINKING_NAMESPACE, schema: Config.toJSON() }] })
});
const clientPlugin = await clientCtx.plugin({ name: "thinking-language", inject: clientBundle.inject, apply: clientBundle.apply });
await clientPlugin;

check("client boots with slots + settingsScope and no locale", dictionaries.length === 0);
check("client waits for locale before registering the row", clientSlots.registrations.length === 0, `rows=${String(clientSlots.registrations.length)}`);

// The locale service arrives only now — and must still reach the plugin.
clientCtx.provide("locale", {
	register: (ns, dicts) => {
		dictionaries.push({ ns, locales: Object.keys(dicts) });
		return () => {};
	}
});
await new Promise((resolve) => setTimeout(resolve, 0));

check("late locale still receives the dictionaries", dictionaries.length === 1 && dictionaries[0].ns === "settings.thinking-language", JSON.stringify(dictionaries));
check(
	"the dictionaries cover every shipped locale",
	dictionaries[0] !== undefined && ["zh", "en", "ru", "fr", "de", "es", "ja", "ko"].every((id) => dictionaries[0].locales.includes(id)),
	JSON.stringify(dictionaries[0]?.locales ?? [])
);
check("the row registers once locale is up", clientSlots.registrations.length === 1, `rows=${String(clientSlots.registrations.length)}`);
check("the row declares its dictionary namespace", clientSlots.registrations[0]?.options.locale === "settings.thinking-language");
await clientPlugin.dispose();

if (failures.length === 0) console.log("\nALL CORDIS CHECKS PASSED");
else {
	console.log(`\nFAILURES (${failures.length}): ${failures.join("; ")}`);
	process.exit(1);
}
