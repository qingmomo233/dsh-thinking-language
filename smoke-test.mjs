// Smoke test: exercise dsh-plugin-thinking-language/lib/index.js apply()
// against a minimal fake cordis context. Verifies the settings namespace is
// registered, the system-prompt section exists and its text thunk reads the
// current setting per assembly, and the /thinking-language command registers
// and its handler updates the settings document.
import { apply } from "file:///C:/ZiYong/ds-hs-work/dsh-plugin-thinking-language/lib/index.js";

const registrations = { namespaces: [], sections: [], commands: [] };
const document = {};

const settings = {
  register(ns, schema) { registrations.namespaces.push({ ns, schema }); },
  get(ns) { return document[ns]; },
  async update(ns, patch) { document[ns] = { ...(document[ns] ?? {}), ...patch }; return void 0; }
};

let sectionTextThunk = null;
const systemPrompt = {
  section(section) {
    registrations.sections.push(section.name);
    if (section.name === "app:thinking-language") sectionTextThunk = section.text;
  }
};

const commands = {
  register(def) { registrations.commands.push({ name: def.name, description: def.description, handler: def.handler }); }
};

function makeCtx() {
  const ctx = {
    get(name) {
      if (name === "settings") return settings;
      if (name === "systemPrompt") return systemPrompt;
      if (name === "commands") return commands;
      return void 0;
    },
    effect(fn, label) {
      const disposer = fn();
      return () => { if (typeof disposer === "function") disposer(); };
    },
    inject(services, cb) {
      const sub = { ...ctx, get: ctx.get };
      for (const name of services) sub[name] = ctx.get(name);
      cb(sub);
      return () => {};
    }
  };
  return ctx;
}

apply(makeCtx());

const failures = [];
const check = (label, ok) => { console.log((ok ? "PASS" : "FAIL") + "  " + label); if (!ok) failures.push(label); };

check("settings namespace registered", registrations.namespaces.some((n) => String(n.ns) === "thinking-language"));
check("system-prompt section registered", registrations.sections.includes("app:thinking-language"));
check("/thinking-language command registered", registrations.commands.some((c) => c.name === "thinking-language"));

// Section thunk: per-assembly read of the current setting.
document["thinking-language"] = { language: "auto" };
check("auto -> empty instruction", sectionTextThunk({}) === "");
document["thinking-language"] = { language: "ru" };
const ruText = sectionTextThunk({});
check("ru -> non-empty instruction", typeof ruText === "string" && ruText.length > 0);
check("ru instruction names Русский", ruText.includes("Русский"));
check("ru instruction names Russian", ruText.includes("Russian"));
check("ru instruction keeps final answer language", ruText.includes("final answer"));
document["thinking-language"] = { language: "bogus" };
check("bogus -> empty instruction", sectionTextThunk({}) === "");
delete document["thinking-language"];

// Command handler: set, show, reset, invalid.
const handler = registrations.commands.find((c) => c.name === "thinking-language").handler;
const invoke = async (rawInput) => handler({ rawInput, agent: "a", signal: new AbortController().signal, commandId: "c1" });
const setResult = await invoke("ru");
check("command set ru -> success", setResult.kind === "success" && setResult.text.includes("ru"));
check("command set ru persisted", document["thinking-language"]?.language === "ru");
const showResult = await invoke("");
check("command show -> success with current value", showResult.kind === "success" && showResult.text.includes("Русский"));
const invalidResult = await invoke("klingon");
check("command invalid -> error", invalidResult.kind === "error" && invalidResult.text.includes("Unknown language"));
const nativeResult = await invoke("Русский");
check("command accepts native name", nativeResult.kind === "success");
const resetResult = await invoke("auto");
check("command reset -> success", resetResult.kind === "success");
check("command reset persisted auto", document["thinking-language"]?.language === "auto");

if (failures.length === 0) console.log("\nALL CHECKS PASSED");
else { console.log("\nFAILURES: " + failures.join("; ")); process.exit(1); }
