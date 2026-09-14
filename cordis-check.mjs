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

if (failures.length === 0) console.log("\nALL CORDIS CHECKS PASSED");
else {
	console.log(`\nFAILURES (${failures.length}): ${failures.join("; ")}`);
	process.exit(1);
}
