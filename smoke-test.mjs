// Smoke + invariant test for dsh-thinking-language.
//
// Runs against a minimal fake cordis context and the plugin's own pure core, so
// it needs no running harness:
//
//   1. the host entry registers its namespace and prompt surfaces
//   2. the system-locale → thinking-language mapping covers the whole catalog
//      (the pre-refactor build answered Simplified Chinese for every locale
//      except `en`)
//   3. settings reads and writes stay correct across every handle shape the
//      supported harnesses hand out (namespace scope, settings service, none)
//   4. the client bundle's fallback catalog cannot drift from the host catalog
//
// Run with: node smoke-test.mjs
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
	Config,
	FALLBACK_THINKING_LANGUAGE,
	THINKING_LANGUAGE_DEFAULT,
	THINKING_LANGUAGE_FIELD,
	THINKING_LANGUAGE_IDS,
	THINKING_LANGUAGES,
	THINKING_NAMESPACE,
	apply,
	currentLanguage,
	languageForSystemLocale,
	resetRegistration,
	resolveLanguage,
	thinkingInstruction,
	thinkingReminder
} from "./lib/index.js";

const failures = [];
const check = (label, ok, extra = "") => {
	console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
	if (!ok) failures.push(label);
};

// --- 1. host entry against a fake cordis context ----------------------------
const document = {};
const registrations = { namespaces: [], sections: [], contexts: [] };

const settings = {
	register(ns, schema) {
		registrations.namespaces.push({ ns, schema });
		// The real harness hands back a namespace scope. Model that shape.
		return {
			get: () => document[ns],
			update: async (patch) => {
				document[ns] = { ...(document[ns] ?? {}), ...patch };
			},
			replace: async (section) => {
				document[ns] = section;
			},
			watch: () => () => {}
		};
	},
	get(ns) {
		return document[ns];
	},
	async update(ns, patch) {
		document[ns] = { ...(document[ns] ?? {}), ...patch };
	}
};

let sectionTextThunk = null;
let contextTextThunk = null;
const systemPrompt = {
	section(section) {
		registrations.sections.push(section.name);
		if (section.name === "app:thinking-language") sectionTextThunk = section.text;
	},
	context(context) {
		registrations.contexts.push(context.name);
		if (context.name === "app:thinking-language-reminder") contextTextThunk = context.text;
	}
};
function makeCtx({ withSystemPrompt = true } = {}) {
	const ctx = {
		get(name) {
			if (name === "settings") return settings;
			if (name === "systemPrompt" && withSystemPrompt) return systemPrompt;
			return void 0;
		},
		effect(fn) {
			const disposer = fn();
			return () => {
				if (typeof disposer === "function") disposer();
			};
		},
		inject(services, callback) {
			// The real cordis starts the callback only when every service is on the
			// fiber; the fake mirrors that by skipping absent branches.
			if (services.some((name) => ctx.get(name) === undefined)) return () => {};
			callback(ctx);
			return () => {};
		}
	};
	// The real context resolves services as plain properties (`ctx.settings`);
	// the fake does the same so the plugin's own access style is exercised.
	for (const name of ["settings", "systemPrompt", "logger"]) {
		Object.defineProperty(ctx, name, {
			get: () => ctx.get(name)
		});
	}
	return ctx;
}

apply(makeCtx());

check("settings namespace registered", registrations.namespaces.some((entry) => String(entry.ns) === THINKING_NAMESPACE));
check("system-prompt section registered", registrations.sections.includes("app:thinking-language"));
check("dynamic reminder context registered", registrations.contexts.includes("app:thinking-language-reminder"));
// The 0.2.x namespace gate: `@deepseek-ai/dsh-settings` serves an entry only
// when its schema declares a volatile field, and it edits only volatile paths —
// an unmarked schema is a namespace the Settings UI cannot see or write.
check("schema marks the language field volatile", Config.dict[THINKING_LANGUAGE_FIELD].meta.volatile === true);
check("schema default resolves to auto", currentLanguage(Config({})) === THINKING_LANGUAGE_DEFAULT);

// A harness without `systemPrompt` must still get its settings namespace. The
// namespace is a process singleton, so a second apply does not re-register it.
const beforePromptless = { sections: registrations.sections.length, contexts: registrations.contexts.length };
apply(makeCtx({ withSystemPrompt: false }));
check("prompt-less harness registers no prompt surface", registrations.sections.length === beforePromptless.sections && registrations.contexts.length === beforePromptless.contexts);
check("the settings namespace registers once per process", registrations.namespaces.length === 1);

// --- 1b. DSH 0.2.x generation: the profile entry itself is the namespace ----
// That generation has no `register()`: the namespace is this package's profile
// entry, served from the exported `Config`, so the only claim left to make is
// the row-presentation policy. The preference is read from the plugin's own
// resolved config, whose volatile field is a `createVolatile()` reference the
// owning runtime updates in place.
{
	const forms = await import("./lib/index.js?form-transport");
	const calls = { configured: [], sections: [] };
	const policySettings = {
		configure(presentation, owner) {
			calls.configured.push({ presentation, owner });
			return () => {};
		},
		describe: () => [{ ns: "locale", value: { preference: "ja" } }]
	};
	const prompt = {
		section(section) {
			calls.sections.push(section);
		},
		context() {}
	};
	const owner = { id: "thinking-language" };
	const ctx = {
		fiber: owner,
		get(name) {
			if (name === "settings") return policySettings;
			if (name === "systemPrompt") return prompt;
			return void 0;
		},
		effect(fn) {
			const disposer = fn();
			return () => {
				if (typeof disposer === "function") disposer();
			};
		},
		inject(services, callback) {
			if (services.some((name) => ctx.get(name) === undefined)) return () => {};
			callback(ctx);
			return () => {};
		}
	};
	// The real context resolves services as plain properties too.
	ctx.settings = policySettings;
	ctx.systemPrompt = prompt;
	// The reference is mutated in place, exactly as the loader does on a live
	// settings write.
	let live = "fr";
	const liveField = { get: () => live };
	forms.apply(ctx, { [forms.THINKING_LANGUAGE_FIELD]: liveField });
	const section = calls.sections.find((entry) => entry.name === "app:thinking-language");
	check("0.2.x: the row policy is declared exactly once", calls.configured.length === 1);
	check("0.2.x: the policy names this plugin's own fiber and disables the auto page", calls.configured[0]?.presentation.auto === false && calls.configured[0]?.owner === owner);
	check("0.2.x: the live config value drives the instruction", section?.text({}).includes("Français") === true, section?.text({}));
	live = "auto";
	check("0.2.x: auto follows the system locale from describe()", section?.text({}).includes("日本語") === true, section?.text({}));
}

// --- 2. system-locale resolution -------------------------------------------
const sectionText = () => sectionTextThunk({});
const reminderText = () => contextTextThunk({});

document[THINKING_NAMESPACE] = { language: "auto" };
delete document.locale;
check("auto without a locale falls back to en", sectionText().includes("English"), FALLBACK_THINKING_LANGUAGE);
check("auto reminder follows the same fallback", reminderText().includes("English"));

document.locale = { preference: "zh" };
check("locale zh -> Simplified Chinese", sectionText().includes("简体中文"));
document.locale = { preference: "zh-Hans" };
check("locale zh-Hans -> Simplified Chinese", sectionText().includes("简体中文"));
document.locale = { preference: "zh-TW" };
check("locale zh-TW -> Traditional Chinese", sectionText().includes("繁體中文"));
document.locale = { preference: "zh-Hant-HK" };
check("locale zh-Hant-HK -> Traditional Chinese", sectionText().includes("繁體中文"));
document.locale = { preference: "ja" };
check("locale ja -> Japanese", sectionText().includes("日本語"));
document.locale = { preference: "pt-BR" };
check("locale pt-BR -> Portuguese", sectionText().includes("Português"));
document.locale = { preference: "ar-EG" };
check("locale ar-EG -> Arabic", sectionText().includes("العربية"));
document.locale = { preference: "de-AT" };
check("locale de-AT -> German", sectionText().includes("Deutsch"));
document.locale = { preference: "en-US" };
check("locale en-US -> English", sectionText().includes("English"));
document.locale = { preference: "xx-YY" };
check("unknown locale -> en fallback", sectionText().includes("English"));
document.locale = { preference: 42 };
check("malformed locale -> en fallback", sectionText().includes("English"));
delete document.locale;

check("every catalog language resolves from its own id", THINKING_LANGUAGES.every((language) => languageForSystemLocale(language.id)?.id === language.id));
check("case/underscore variants resolve", languageForSystemLocale("EN_us")?.id === "en");
check("empty locale resolves to nothing", languageForSystemLocale("") === undefined);
check("non-string locale resolves to nothing", languageForSystemLocale(null) === undefined);

// Explicit values pass through untouched, including ones the catalog dropped.
document[THINKING_NAMESPACE] = { language: "ru" };
const ruText = sectionText();
check("ru -> instruction names the endonym", ruText.includes("Русский"));
check("ru -> instruction names the English name", ruText.includes("Russian"));
check("ru -> instruction keeps the final answer language", ruText.includes("final answer"));
const ruReminder = reminderText();
check("ru -> reminder names the endonym", ruReminder.includes("Русский"));
check("ru -> reminder is a single line of context", ruReminder.startsWith("[Thinking language]"));
document[THINKING_NAMESPACE] = { language: "en" };
check("switch to en applies immediately", sectionText().includes("English") && !sectionText().includes("Русский"));
check("switch to en applies to the reminder immediately", reminderText().includes("English") && !reminderText().includes("Русский"));
document[THINKING_NAMESPACE] = { language: "bogus" };
check("unknown explicit id -> empty instruction", sectionText() === "");
check("unknown explicit id -> empty reminder", reminderText() === "");
check("unknown explicit id survives resolution", resolveLanguage(settings) === "bogus");
document[THINKING_NAMESPACE] = { language: 7 };
check("non-string stored value -> auto treatment", sectionText().includes(FALLBACK_THINKING_LANGUAGE === "en" ? "English" : FALLBACK_THINKING_LANGUAGE));
document[THINKING_NAMESPACE] = "not-a-section";
check("non-object section -> auto treatment", sectionText().includes("English"));
document[THINKING_NAMESPACE] = { language: "auto" };
delete document[THINKING_NAMESPACE];

// --- 3. read-handle shapes --------------------------------------------------
// The host reads the preference through whichever handle the harness hands
// out: the namespace scope `settings.register()` returned, or the settings
// service itself.
document[THINKING_NAMESPACE] = { language: "ja" };
const scope = settings.register(THINKING_NAMESPACE, Config);
check("namespace scope carries the stored value", currentLanguage(scope) === "ja");
check("bare settings service carries the stored value", currentLanguage(settings) === "ja");
check("no handle -> the default", currentLanguage(undefined) === THINKING_LANGUAGE_DEFAULT);
// A plugin's own resolved config (DSH 0.2.x) is a plain section, and a volatile
// field arrives as a live reference rather than as a value.
check("an own config section is read directly", currentLanguage({ [THINKING_LANGUAGE_FIELD]: "de" }) === "de");
check("a live volatile field reference is unwrapped", currentLanguage({ [THINKING_LANGUAGE_FIELD]: { get: () => "ru" } }) === "ru");
check("a refusing field reference reads as the default", currentLanguage({ [THINKING_LANGUAGE_FIELD]: { get: () => { throw new Error("disposed"); } } }) === THINKING_LANGUAGE_DEFAULT);
check("the system locale comes from a describe() projection", resolveLanguage({ [THINKING_LANGUAGE_FIELD]: "auto" }, { describe: () => [{ ns: "locale", value: { preference: "ja" } }] }) === "ja");
check("a malformed describe() projection falls back", resolveLanguage({ [THINKING_LANGUAGE_FIELD]: "auto" }, { describe: () => "nope" }) === FALLBACK_THINKING_LANGUAGE);
check("scope and service resolve identically", resolveLanguage(scope, settings) === resolveLanguage(settings, settings));
document[THINKING_NAMESPACE] = { language: "bogus" };
check("an unknown stored id is passed through verbatim", currentLanguage(settings) === "bogus");
check("an unknown stored id still resolves", resolveLanguage(settings, settings) === "bogus");
document[THINKING_NAMESPACE] = "not-a-section";
check("a non-object section reads as the default", currentLanguage(settings) === THINKING_LANGUAGE_DEFAULT);
delete document[THINKING_NAMESPACE];

// A harness whose settings service refuses to register the namespace must keep
// the prompt surface alive and keep reading through the service.
resetRegistration();
const failingDocument = {};
const failingSettings = {
	register() {
		throw new Error("settings namespace \"thinking-language\" is already registered");
	},
	get(ns) {
		return failingDocument[ns];
	},
	async update(ns, patch) {
		failingDocument[ns] = { ...(failingDocument[ns] ?? {}), ...patch };
	}
};
const warnings = [];
const failingCtx = {
	get(name) {
		if (name === "settings") return failingSettings;
		if (name === "systemPrompt") return systemPrompt;
		if (name === "logger") return { warn: (...args) => warnings.push(args) };
		return void 0;
	},
	effect(fn) {
		const disposer = fn();
		return () => {
			if (typeof disposer === "function") disposer();
		};
	},
	inject(services, callback) {
		callback(this);
		return () => {};
	}
};
Object.defineProperty(failingCtx, "settings", { get: () => failingSettings });
Object.defineProperty(failingCtx, "systemPrompt", { get: () => systemPrompt });
Object.defineProperty(failingCtx, "logger", { get: () => ({ warn: (...args) => warnings.push(args) }) });
const failingSection = [];
const originalSection = systemPrompt.section.bind(systemPrompt);
systemPrompt.section = (section) => {
	failingSection.push(section);
	originalSection(section);
};
apply(failingCtx);
check("refused registration is logged once", warnings.length === 1, JSON.stringify(warnings[0]?.[0] ?? ""));
check("refused registration still exposes the prompt section", failingSection.some((section) => section.name === "app:thinking-language"));
failingDocument[THINKING_NAMESPACE] = { language: "fr" };
check("refused registration still reads through the service", currentLanguage(failingSettings) === "fr" && resolveLanguage(failingSettings, failingSettings) === "fr");
systemPrompt.section = originalSection;

// --- 4. text helpers --------------------------------------------------------
check("instruction is empty for auto", thinkingInstruction(THINKING_LANGUAGE_DEFAULT) === "");
check("reminder is empty for auto", thinkingReminder(THINKING_LANGUAGE_DEFAULT) === "");

// --- 5. client/host catalog drift guard ------------------------------------
const hostDir = dirname(fileURLToPath(import.meta.url));
const clientSource = readFileSync(join(hostDir, "lib", "client.js"), "utf8");
const fallbackBlock = /const FALLBACK_LANGUAGES = \[([\s\S]*?)\];/.exec(clientSource);
check("client fallback catalog is present", fallbackBlock !== null);
const clientIds = [...(fallbackBlock?.[1] ?? "").matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
const expectedIds = [THINKING_LANGUAGE_DEFAULT, ...THINKING_LANGUAGE_IDS];
check(
	"client fallback catalog matches the host catalog",
	clientIds.length === expectedIds.length && clientIds.every((id, index) => id === expectedIds[index]),
	`client=${clientIds.length} host=${expectedIds.length}`
);
const clientOptions = [...clientSource.matchAll(/\{ id: "([^"]+)", label: "([^"]*)" \}/g)].map((match) => ({ id: match[1], label: match[2] }));
// The picker must show exactly what it showed before the refactor: the endonym,
// with no English name appended.
const hostLabels = THINKING_LANGUAGES.map((language) => ({ id: language.id, label: language.native }));
check(
	"client fallback labels match the host schema labels",
	clientOptions.length === hostLabels.length && clientOptions.every((entry, index) => entry.id === hostLabels[index].id && entry.label === hostLabels[index].label)
);
check("client bundle declares the auto entry first", clientIds[0] === THINKING_LANGUAGE_DEFAULT);
check("client bundle does not require an optional seed word eagerly", !/^\s*let \w+ = require\("@deepseek-ai\/dsh-client-(store|runtime)/m.test(clientSource));

// The client half is a browser bundle, but its factory is plain synchronous
// code once `require` is stubbed, so it can be exercised here: the module
// loader contract (`window.__ModuleLoader__.load`) and the platform modules are
// all it touches before `apply` runs.
//
// The stub answers exactly what the bundle asks for and throws for anything
// else, which is what a real module table does — so a bundle that starts
// requiring an unavailable seed word fails this test instead of a browser.
const requireStub = (specifier) => {
	if (specifier === "react") return { createElement: (type, props, ...children) => ({ type, props, children }), useState: (initial) => [initial, () => {}] };
	if (specifier === "react/jsx-runtime") throw new Error("client bundle required react/jsx-runtime; it must build elements through the platform React or a plain description");
	if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return { Menu: "Menu", IconChevronDownOutlineRegular: "IconChevronDownOutlineRegular" };
	throw new Error(`client bundle required an unavailable module: ${specifier}`);
};
const registrationsSeen = [];
globalThis.window = {
	__ModuleLoader__: {
		load(registration) {
			registrationsSeen.push(registration);
		}
	}
};
// The bundle executes on import and registers its factory with the loader; the
// factory itself only runs when the module system materializes it.
await import("./lib/client.js");
const clientExports = registrationsSeen.length === 0 ? undefined : registrationsSeen[0].factory(requireStub);
delete globalThis.window;
check("client bundle registers itself with the module loader", clientExports !== undefined && registrationsSeen[0].id === "dsh-thinking-language");
check("client bundle exports apply and inject", typeof clientExports?.apply === "function" && Array.isArray(clientExports?.inject));
check("client bundle hard-requires only slots", JSON.stringify(clientExports?.inject) === JSON.stringify(["slots"]), JSON.stringify(clientExports?.inject));
check("client bundle survives a missing optional module", clientExports !== undefined);

if (clientExports !== undefined) {
	// readCatalog must accept the namespace view both describe() shapes and the
	// schemastery JSON tree the host registers.
	const derived = clientExports.readCatalog({ namespaces: [{ ns: THINKING_NAMESPACE, schema: Config.toJSON() }] }, THINKING_NAMESPACE);
	check("client derives its catalog from the host schema", derived.length === expectedIds.length && derived.every((entry, index) => entry.id === expectedIds[index]));
	check(
		"client schema catalog carries every host label",
		derived.length === hostLabels.length + 1 &&
			derived[0].id === THINKING_LANGUAGE_DEFAULT &&
			hostLabels.every((entry, index) => derived[index + 1].id === entry.id && derived[index + 1].label === entry.label),
		JSON.stringify(derived.slice(0, 3))
	);
	const arrayShaped = clientExports.readCatalog([{ ns: THINKING_NAMESPACE, schema: Config.toJSON() }], THINKING_NAMESPACE);
	check("client accepts an array-shaped describe()", arrayShaped.length === expectedIds.length);
	const unreadable = clientExports.readCatalog(undefined, THINKING_NAMESPACE);
	check("client falls back when describe() is unavailable", unreadable.length === expectedIds.length && unreadable[0].id === THINKING_LANGUAGE_DEFAULT);
	const wrongShape = clientExports.readCatalog({ namespaces: [{ ns: THINKING_NAMESPACE, schema: { uid: 1, refs: {} } }] }, THINKING_NAMESPACE);
	check("client falls back on an unparseable schema", wrongShape.length === expectedIds.length);

	// apply() must reach the row registration on a complete harness and degrade
	// (registering dictionaries only) when no settings transport is present.
	// The transport is named `configForms` on dsh 0.2.x and `settingsScope`
	// before it, so both generations are exercised: the mount is latched per
	// module (a harness serves exactly one generation), which is why the legacy
	// half needs its own copy of the bundle.
	const slotRegistrations = [];
	const makeClientCtx = (services) => {
		const ctx = {
			get: (name) => services[name],
			effect(fn) {
				const disposer = fn();
				return () => {
					if (typeof disposer === "function") disposer();
				};
			},
			inject(names, callback) {
				if (names.some((name) => services[name] === undefined)) return () => {};
				callback(ctx);
				return () => {};
			}
		};
		// cordis resolves services as plain context properties too, and the row
		// branch reads `ctx.configForms` / `ctx.settingsScope` / `ctx.slots`
		// directly.
		for (const [name, value] of Object.entries(services)) Object.defineProperty(ctx, name, { get: () => value });
		return ctx;
	};
	const slots = {
		inject: (name, callback) => {
			callback();
			return () => {};
		},
		register: (options, component) => {
			slotRegistrations.push({ options, component });
			return () => {};
		}
	};
	const dictionaries = [];
	const locale = {
		register: (ns, dicts) => {
			dictionaries.push({ ns, locales: Object.keys(dicts) });
			return () => {};
		},
		bind: (ns) => (key) => `${ns}.${key}`
	};

	// (1) Neither transport: dictionaries only, plus one diagnostic warning.
	const degraded = [];
	const realSetTimeout = globalThis.setTimeout;
	const timers = [];
	globalThis.setTimeout = (fn) => {
		timers.push(fn);
		return 0;
	};
	try {
		clientExports.apply(
			makeClientCtx({
				slots,
				locale: {
					register: () => () => {}
				},
				logger: {
					warn: (...args) => degraded.push(args[0])
				}
			})
		);
	} finally {
		globalThis.setTimeout = realSetTimeout;
	}
	check("client skips the settings page when no settings transport is present", slotRegistrations.length === 0);
	check("client defers its availability check", timers.length === 1);
	for (const fire of timers) fire();
	check(
		"client reports the missing settings transport",
		degraded.some((line) => String(line).includes("neither the configForms nor the settingsScope")),
		JSON.stringify(degraded)
	);

	// (2) dsh 0.2.x: the transport is `configForms`, one form per Host-served
	// namespace, and the page exists only while the Host serves that namespace.
	// A hand-built schema (auto + de) proves the catalog came from the describe
	// MIRROR, which the transport exposes as a store rather than as a document.
	const tinySchema = {
		uid: 1,
		refs: {
			"1": { uid: 1, dict: { language: 2 } },
			"2": { uid: 2, list: [3, 4] },
			"3": { uid: 3, value: "auto" },
			"4": { uid: 4, value: "de", meta: { description: "Deutsch" } }
		}
	};
	const scopeSnapshot = { value: { language: "ru" }, revision: 3, writable: true };
	let scopeListener;
	const settingsScope = {
		bind: () => ({
			getSnapshot: () => scopeSnapshot,
			subscribe: (listener) => {
				scopeListener = listener;
				return () => {};
			},
			set: () => Promise.resolve(),
			unset: () => Promise.resolve()
		}),
		describe: () => ({ namespaces: [{ ns: THINKING_NAMESPACE, schema: Config.toJSON() }] })
	};
	const formSnapshot = { status: "ready", value: { language: "ja" }, revision: 5, writable: true };
	let formListener;
	let whileServedCalls = 0;
	const configForms = {
		get: () => ({
			getSnapshot: () => formSnapshot,
			subscribe: (listener) => {
				formListener = listener;
				return () => {};
			},
			set: () => Promise.resolve(),
			unset: () => Promise.resolve()
		}),
		describe: () => ({ getSnapshot: () => ({ view: { writable: true, namespaces: [{ ns: THINKING_NAMESPACE, schema: tinySchema }] } }) }),
		whileServed: (namespaces, register) => {
			whileServedCalls += 1;
			return register(namespaces);
		}
	};
	// Both transports are offered: a real harness serves one, and the page must
	// mount exactly once — through the current generation.
	clientExports.apply(makeClientCtx({ slots, locale, configForms, settingsScope, logger: { warn: () => {} } }));
	check("client registers the page through configForms", slotRegistrations.length === 1 && whileServedCalls === 1);
	check("client prefers configForms over the legacy settings scope", scopeListener === undefined);
	const row = slotRegistrations[0];
	check("client page targets its own settings section", row?.options.name === "settings.section" && row?.options.id === "thinking-language");
	check(
		"client labels the nav entry through the locale face",
		typeof row?.options.label === "function" && row.options.label() === "settings.thinking-language.title",
		typeof row?.options.label === "function" ? row.options.label() : "(no label)"
	);
	check("client registers its dictionaries", dictionaries.length === 1 && dictionaries[0].locales.includes("zh") && dictionaries[0].locales.includes("en"));
	const syncs = [];
	const boundActions = row?.options.inject({ sync: (...args) => syncs.push(args) });
	check("client exposes a setLanguage write path", typeof boundActions?.setLanguage === "function");
	check("client adopts the settings transport snapshot", typeof formListener === "function");
	check("client pushes the served language and revision through the store", syncs.length === 1 && syncs[0][0] === "ja" && syncs[0][2] === 5, JSON.stringify(syncs));
	check(
		"client reads the catalog through the describe mirror",
		JSON.stringify(syncs[0]?.[1]) === JSON.stringify([{ id: "auto" }, { id: "de", label: "Deutsch" }]),
		JSON.stringify(syncs[0]?.[1])
	);

	// The page draws its own heading, its own explanation and one selector: the
	// shell renders a `settings.section` cell with no label of its own, so a bare
	// container would leave a blank page behind the nav entry.
	const page = row?.component({
		t: (key) => key,
		setLanguage: () => {},
		useStore: (select) => select({ language: "ja", catalog: [{ id: "auto" }, { id: "ja", label: "日本語" }] })
	});
	const [heading, intro, field] = page?.children ?? [];
	check(
		"client page draws a heading, an intro and one selector",
		page?.props?.className === "dshtl_page" &&
			heading?.props?.className === "dshtl_heading" &&
			heading?.children?.[0] === "title" &&
			intro?.props?.className === "dshtl_intro" &&
			intro?.children?.[0] === "hint" &&
			field?.props?.className === "dshtl_field",
		JSON.stringify(page?.children?.map((child) => child?.props?.className))
	);
	const picker = field?.children?.[0];
	const menu = typeof picker?.type === "function" ? picker.type(picker.props) : undefined;
	const anchor = menu?.props?.anchor;
	check(
		"client page selector names the active language",
		menu?.props?.selectedId === "ja" && anchor?.props?.className === "dshtl_selector" && anchor?.children?.[0] === "日本語",
		JSON.stringify(anchor?.children?.[0])
	);

	// (3) dsh 0.1.x: the same form face, published as `settingsScope`.
	slotRegistrations.length = 0;
	const legacyBefore = registrationsSeen.length;
	globalThis.window = {
		__ModuleLoader__: {
			load(registration) {
				registrationsSeen.push(registration);
			}
		}
	};
	await import("./lib/client.js?legacy-transport");
	delete globalThis.window;
	const legacyExports = registrationsSeen[legacyBefore].factory(requireStub);
	legacyExports.apply(makeClientCtx({ slots, locale, settingsScope, logger: { warn: () => {} } }));
	check("client registers the page through the legacy settings scope", slotRegistrations.length === 1 && typeof scopeListener === "function");
	check("client keeps the legacy write path", typeof slotRegistrations[0]?.options.inject({ sync: () => {} })?.setLanguage === "function");
	check("client registers its dictionaries on the legacy generation too", dictionaries.length === 2);
}

// --- 6. schema metadata the client reads -----------------------------------
const schemaJson = Config.toJSON();
const unionUid = schemaJson.refs[String(schemaJson.uid)].dict[THINKING_LANGUAGE_FIELD];
const union = schemaJson.refs[String(unionUid)];
const described = union.list.map((uid) => schemaJson.refs[String(uid)]);
check("schema enum carries every id", described.length === expectedIds.length && described.every((node, index) => node.value === expectedIds[index]));
check("schema enum carries labels for every language", described.slice(1).every((node) => typeof node.meta?.description === "string" && node.meta.description.length > 0));
check("schema leaves auto unlabelled, as before", described[0]?.value === THINKING_LANGUAGE_DEFAULT && described[0]?.meta?.description === undefined);
// The picker label must be the endonym alone — the string the row has always
// rendered. A label carrying extra text would silently change the UI.
check(
	"schema labels are the plain endonyms",
	described.slice(1).every((node, index) => node.meta.description === THINKING_LANGUAGES[index]?.native),
	described.slice(0, 3).map((node) => node.meta?.description).join(" | ")
);

// --- 6b. the volatile contract the harness reads ----------------------------
// DSH 0.2.x serves a settings namespace only when `volatileForm()` finds a
// volatile field, and applies a write in place only when the running config
// holds a reference built on cosmokit's shared `Symbol.for` protocol: the
// Loader compares references with `deepEqual(…, true)` and commits changed
// values through `updateVolatile()` instead of remounting the plugin.
const volatileWrite = Symbol.for("cosmokit.volatile.write");
check("schema marks the language field volatile", Config.dict[THINKING_LANGUAGE_FIELD].meta.volatile === true);
check("schema keeps the schemastery vendor the Loader diffs by", Config["~standard"].vendor === "schemastery");
const resolvedConfig = Config["~standard"].validate({ [THINKING_LANGUAGE_FIELD]: "fr" }).value;
check(
	"resolving the schema yields a live reference",
	typeof resolvedConfig[THINKING_LANGUAGE_FIELD]?.get === "function" && resolvedConfig[THINKING_LANGUAGE_FIELD].get() === "fr"
);
check("the reference speaks cosmokit's protocol", volatileWrite in resolvedConfig[THINKING_LANGUAGE_FIELD]);
resolvedConfig[THINKING_LANGUAGE_FIELD][volatileWrite]("ja");
check("a committed write reaches the read path", currentLanguage(resolvedConfig) === "ja");
// A profile whose lockfile pinned a schemastery older than 3.18.4 has no
// `.volatile()` decorator, so the plugin must set the marker and build the
// reference itself; hiding the decorator for one import reproduces that.
const schemaPrototype = Object.getPrototypeOf(Config);
const volatileDecorator = schemaPrototype.volatile;
const decoratorDescriptor = Object.getOwnPropertyDescriptor(schemaPrototype, "volatile");
check("the installed schemastery keeps the decorator replaceable", typeof volatileDecorator === "function" && decoratorDescriptor?.configurable === true);
delete schemaPrototype.volatile;
let decoratorless;
try {
	decoratorless = await import("./lib/index.js?without-volatile-decorator");
} finally {
	schemaPrototype.volatile = volatileDecorator;
}
const decoratorlessField = decoratorless.Config.dict[THINKING_LANGUAGE_FIELD];
check("a schemastery without the decorator still marks the field volatile", decoratorlessField.meta.volatile === true && decoratorlessField.meta.default === THINKING_LANGUAGE_DEFAULT);
const decoratorlessValue = decoratorless.Config["~standard"].validate({ [THINKING_LANGUAGE_FIELD]: "de" }).value;
check(
	"a schemastery without the decorator still resolves a live reference",
	typeof decoratorlessValue[THINKING_LANGUAGE_FIELD]?.get === "function" && decoratorlessValue[THINKING_LANGUAGE_FIELD].get() === "de"
);
check("the decorator is restored for the rest of the run", typeof schemaPrototype.volatile === "function");

// --- 7. user-visible copy is frozen ----------------------------------------
// Everything the user reads on the settings row, in every shipped dictionary.
// These literals changed once by accident during a refactor; this check exists
// so a compatibility change can never alter the UI again.
const FROZEN_COPY = [
	'"title": "思考语言"',
	'"hint": "选择模型思考过程使用的语言，新会话生效。"',
	'"lang.auto": "跟随系统"',
	'"title": "Thinking language"',
	'"hint": "Language used for the model\'s reasoning/thinking process. Applies to new sessions."',
	'"lang.auto": "Follow the system (auto)"',
	'"title": "Язык размышлений"',
	'"hint": "Язык для процесса рассуждений модели. Применяется к новым сессиям."',
	'"lang.auto": "Следовать за системой (авто)"',
	'"title": "Langue de réflexion"',
	'"hint": "Langue utilisée pour le raisonnement du modèle. S\'applique aux nouvelles sessions."',
	'"lang.auto": "Suivre le système (auto)"',
	'"title": "Denksprache"',
	'"hint": "Sprache für den Denkprozess des Modells. Gilt für neue Sitzungen."',
	'"lang.auto": "Dem System folgen (auto)"',
	'"title": "Idioma de razonamiento"',
	'"hint": "Idioma para el proceso de razonamiento del modelo. Se aplica a sesiones nuevas."',
	'"lang.auto": "Seguir al sistema (auto)"',
	'"title": "思考言語"',
	'"hint": "モデルの思考プロセスで使う言語。新しいセッションに適用されます。"',
	'"lang.auto": "システムに従う（自動）"',
	'"title": "لغة التفكير"',
	'"hint": "اللغة المستخدمة في عملية تفكير النموذج. تُطبَّق على الجلسات الجديدة."',
	'"lang.auto": "اتّباع النظام (تلقائي)"',
	'"title": "Idioma do raciocínio"',
	'"hint": "Idioma usado no processo de raciocínio do modelo. Aplica-se a novas sessões."',
	'"lang.auto": "Seguir o sistema (automático)"'
];
const missingCopy = FROZEN_COPY.filter((literal) => !clientSource.includes(literal));
check("settings page copy is byte-for-byte unchanged", missingCopy.length === 0, missingCopy.join(" | "));
const frozenClasses = ["dshtl_page", "dshtl_heading", "dshtl_intro", "dshtl_field", "dshtl_selector", "dshtl_chevron"];
const missingClasses = frozenClasses.filter((name) => !clientSource.includes(`"${name}"`) && !clientSource.includes(`.${name}`));
check("settings page CSS class names are unchanged", missingClasses.length === 0, missingClasses.join(" | "));

// The one icon the page draws is named per generation (0.1.x sizes, 0.2.x
// weights), and an unguarded miss renders `undefined` as a component: React
// throws, the slot renderer drops the page, and the setting vanishes from a
// healthy Settings panel. Every primitives access must therefore be one of the
// names the bundle tolerates.
const primitiveRefs = [...new Set([...clientSource.matchAll(/primitives\.([A-Za-z0-9_]+)/g)].map((match) => match[1]))];
const toleratedPrimitives = ["Menu", "IconChevronDownOutlineRegular", "IconChevronDownOutline", "IconChevronDownOutline14"];
check(
	"client only touches primitives through generation-tolerant lookups",
	primitiveRefs.length > 0 && primitiveRefs.every((name) => toleratedPrimitives.includes(name)),
	primitiveRefs.join(",")
);
check(
	"client resolves the chevron from the newer icon name first",
	clientSource.includes("primitives.IconChevronDownOutlineRegular ?? primitives.IconChevronDownOutline ?? primitives.IconChevronDownOutline14")
);

// --- 8. package manifest ---------------------------------------------------
// The harness reads these fields at boot: a missing bundle path or a
// `cordis.patch.yml` that names a different package fails the whole profile.
const manifest = JSON.parse(readFileSync(join(hostDir, "package.json"), "utf8"));
check("package main entry exists", existsSync(join(hostDir, manifest.main)));
check("package types entry exists", existsSync(join(hostDir, manifest.types)));
check("client bundle exists", existsSync(join(hostDir, manifest.exports["./client"].default)));
check("client types exist", existsSync(join(hostDir, manifest.exports["./client"].types)));
check("bundle patch exists", existsSync(join(hostDir, manifest.dsh.bundle.patch)));
const patchSource = readFileSync(join(hostDir, manifest.dsh.bundle.patch), "utf8");
check("bundle patch inserts this package", patchSource.includes(`name: ${manifest.name}`));
check("package does not require react any more", manifest.peerDependencies.react === undefined);
check("client half declares its runtime packages", Array.isArray(manifest.dsh.client.inject) && manifest.dsh.client.inject.length > 0);

if (failures.length === 0) console.log("\nALL CHECKS PASSED");
else {
	console.log(`\nFAILURES (${failures.length}): ${failures.join("; ")}`);
	process.exit(1);
}
