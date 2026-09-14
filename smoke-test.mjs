// Smoke + invariant test for dsh-thinking-language.
//
// Runs against a minimal fake cordis context and the plugin's own pure core, so
// it needs no running harness:
//
//   1. the host entry registers its namespace, prompt surfaces, and command
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
	describeLanguage,
	languageForSystemLocale,
	parseCommandArgument,
	resetRegistration,
	resolveLanguage,
	thinkingInstruction,
	thinkingReminder,
	usageLine
} from "./lib/index.js";

const failures = [];
const check = (label, ok, extra = "") => {
	console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
	if (!ok) failures.push(label);
};

// --- 1. host entry against a fake cordis context ----------------------------
const document = {};
const registrations = { namespaces: [], sections: [], contexts: [], commands: [] };

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
const commands = {
	register(def) {
		registrations.commands.push({ name: def.name, description: def.description, handler: def.handler });
		return () => {};
	}
};

function makeCtx({ withCommands = true, withSystemPrompt = true } = {}) {
	const ctx = {
		get(name) {
			if (name === "settings") return settings;
			if (name === "systemPrompt" && withSystemPrompt) return systemPrompt;
			if (name === "commands" && withCommands) return commands;
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
	for (const name of ["settings", "systemPrompt", "commands", "logger"]) {
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
check("/thinking-language command registered", registrations.commands.some((command) => command.name === "thinking-language"));
check("schema default is auto", Config({})[THINKING_LANGUAGE_FIELD] === THINKING_LANGUAGE_DEFAULT);

// A harness without `commands` must still get its prompt surfaces.
apply(makeCtx({ withCommands: false }));
check("commands-less harness keeps the prompt section", registrations.sections.length === 2);
check("commands-less harness registers no command", registrations.commands.length === 1);

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
document.locale = { preference: "ko-KR" };
check("locale ko-KR -> Korean", sectionText().includes("한국어"));
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

// --- 3. read/write handle shapes -------------------------------------------
const handler = registrations.commands.find((command) => command.name === "thinking-language").handler;
const invoke = async (rawInput) => handler({ rawInput, agent: "a", signal: new AbortController().signal, commandId: "c1" });

const setResult = await invoke("ru");
check("command set ru -> success", setResult.kind === "success" && setResult.text.includes("ru"));
const showResult = await invoke("");
check("command show -> reports the current value", showResult.kind === "success" && showResult.text.includes("Русский"));
const invalidResult = await invoke("klingon");
check("command invalid -> error", invalidResult.kind === "error" && invalidResult.text.includes("Unknown language"));
check("command accepts a native endonym", (await invoke("Русский")).kind === "success");
check("command accepts an English name", (await invoke("german")).kind === "success");
check("command accepts a unique prefix", (await invoke("japan")).kind === "success" && document[THINKING_NAMESPACE]?.language === "ja");
const ambiguous = await invoke("zh");
check("ambiguous prefix falls back to an exact id", ambiguous.kind === "success" && document[THINKING_NAMESPACE]?.language === "zh-CN");
const resetResult = await invoke("auto");
check("command reset -> success", resetResult.kind === "success");
check("command reset clears the stored value", document[THINKING_NAMESPACE]?.language === "auto");

// A harness whose settings service refuses to register the namespace must keep
// the prompt and command surfaces alive.
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
		if (name === "commands") return commands;
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
Object.defineProperty(failingCtx, "commands", { get: () => commands });
Object.defineProperty(failingCtx, "logger", { get: () => ({ warn: (...args) => warnings.push(args) }) });
const failingSection = [];
const originalSection = systemPrompt.section.bind(systemPrompt);
systemPrompt.section = (section) => {
	failingSection.push(section);
	originalSection(section);
};
const failingCommands = [];
const originalRegister = commands.register.bind(commands);
commands.register = (def) => {
	failingCommands.push(def);
	return originalRegister(def);
};
apply(failingCtx);
check("refused registration is logged once", warnings.length === 1, JSON.stringify(warnings[0]?.[0] ?? ""));
check("refused registration still exposes the prompt section", failingSection.some((section) => section.name === "app:thinking-language"));
check("refused registration still exposes the command", failingCommands.some((def) => def.name === "thinking-language"));
failingDocument[THINKING_NAMESPACE] = { language: "auto" };
await failingCommands.find((def) => def.name === "thinking-language").handler({ rawInput: "fr", agent: "a", signal: new AbortController().signal, commandId: "c2" });
check("refused registration still writes through the service", failingDocument[THINKING_NAMESPACE]?.language === "fr");
systemPrompt.section = originalSection;
commands.register = originalRegister;

// --- 4. command argument + text helpers ------------------------------------
check("empty argument asks to show", parseCommandArgument("  ").kind === "show");
check("reset alias maps to auto", parseCommandArgument("reset").id === THINKING_LANGUAGE_DEFAULT);
check("id matching ignores case", parseCommandArgument("RU").id === "ru");
check("usage line lists every id", THINKING_LANGUAGE_IDS.every((id) => usageLine().includes(id)));
check("describeLanguage names the endonym", describeLanguage("ja").includes("日本語"));
check("describeLanguage explains auto", describeLanguage(THINKING_LANGUAGE_DEFAULT).includes("auto"));
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
	if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return { Menu: "Menu", IconChevronDownOutline14: "IconChevronDownOutline14" };
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
	// (registering dictionaries only) when the settings scope is absent.
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
		// branch reads `ctx.settingsScope` / `ctx.slots` directly.
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
	clientExports.apply(makeClientCtx({ slots, locale, settingsScope, logger: { warn: () => {} } }));
	check("client registers the row on a complete harness", slotRegistrations.length === 1);
	const row = slotRegistrations[0];
	check("client row targets the General item slot", row?.options.name === "settings.general.item" && row?.options.id === "thinking-language");
	check("client registers its dictionaries", dictionaries.length === 1 && dictionaries[0].locales.includes("zh") && dictionaries[0].locales.includes("en"));
	const boundActions = row?.options.inject({ sync: () => {} });
	check("client exposes a setLanguage write path", typeof boundActions?.setLanguage === "function");
	check("client adopts the settings snapshot", typeof scopeListener === "function");

	slotRegistrations.length = 0;
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
	check("client skips the row when the settings scope is absent", slotRegistrations.length === 0);
	check("client defers its availability check", timers.length === 1);
	for (const fire of timers) fire();
	check("client reports the missing settings transport", degraded.some((line) => String(line).includes("settingsScope")), JSON.stringify(degraded));
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

// --- 7. user-visible copy is frozen ----------------------------------------
// Everything the user reads on the settings row, in every shipped dictionary.
// These literals changed once by accident during a refactor; this check exists
// so a compatibility change can never alter the UI again.
const FROZEN_COPY = [
	'"title": "思考语言"',
	'"hint": "选择模型思考过程（推理/链式思考）使用的语言，新会话生效。"',
	'"lang.auto": "跟随系统（自动）"',
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
	'"title": "사고 언어"',
	'"hint": "모델의 추론 과정에 사용할 언어입니다. 새 세션에 적용됩니다."',
	'"lang.auto": "시스템 따르기 (자동)"'
];
const missingCopy = FROZEN_COPY.filter((literal) => !clientSource.includes(literal));
check("row copy is byte-for-byte unchanged", missingCopy.length === 0, missingCopy.join(" | "));
const frozenClasses = ["dshtl_row", "dshtl_rowText", "dshtl_title", "dshtl_desc", "dshtl_selector", "dshtl_chevron"];
const missingClasses = frozenClasses.filter((name) => !clientSource.includes(`"${name}"`) && !clientSource.includes(`.${name}`));
check("row CSS class names are unchanged", missingClasses.length === 0, missingClasses.join(" | "));

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
