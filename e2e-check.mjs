// End-to-end verification of dsh-plugin-thinking-language against a live
// dsh web instance (port 3399):
//   1. set thinking-language = ru, create a session, send a prompt
//   2. read session.history: the request/header system prompt must contain the
//      Russian instruction + per-message reminder, and the assistant reasoning
//      must contain Cyrillic characters (the model actually thought in Russian)
//   3. switch to en mid-session, send another prompt: the NEW request/header
//      (reason "change") must carry the English instruction and the new
//      reasoning must not be Cyrillic — no restart
//   4. cleanup: delete the session, reset the setting to auto
const BASE = "http://127.0.0.1:3399";
let rpcId = 0;

async function callApi(method, payload) {
  const body = JSON.stringify({ type: "client-request", rpcId: `e2e-${++rpcId}`, method, payload });
  const res = await fetch(`${BASE}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
  const json = await res.json();
  if (!json.result?.ok) throw new Error(`${method} failed: ${JSON.stringify(json.result?.error ?? json)}`);
  return json.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evs = (history) => history.events.map((h) => h.event);
const hasCyrillic = (s) => /[\u0400-\u04FF]/.test(s);

/** Collect reasoning text from assistant/chunk events. */
function reasoningOf(events) {
  let out = "";
  for (const e of events) {
    if (e.type !== "assistant/chunk") continue;
    const c = e.data?.chunk;
    if (!c) continue;
    if (c.type === "reasoning-delta" && typeof c.text === "string") out += c.text;
    else if (c.type === "block" && (c.block?.kind === "reasoning" || c.block?.type === "reasoning") && typeof (c.block.text ?? c.block.content) === "string") out += c.block.text ?? c.block.content;
    else if (c.type === "reasoning" && typeof c.text === "string") out += c.text;
  }
  return out;
}

/** Poll until at least `count` turns have fully ended (turn/end seen after the last prompt). */
async function waitTurns(sid, count) {
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const history = await callApi("session.history", { sessionId: sid });
    const ends = evs(history).filter((e) => e.type === "turn/end").length;
    if (ends >= count) return history;
  }
  throw new Error("timed out waiting for model turns");
}

const failures = [];
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!ok) failures.push(label);
};

// --- 1. set Russian, create session, prompt ---------------------------------
await callApi("settings.update", { ns: "thinking-language", patch: { language: "ru" } });
const created = await callApi("session.create", {});
const sid = created.sessionId;
console.log(`session: ${sid}`);

await callApi("session.prompt", {
  sessionId: sid,
  mode: "queue",
  content: [{ type: "text", text: "Just say hello briefly." }]
});
let history = await waitTurns(sid, 1);
let events = evs(history);

const headerRu = events.find((e) => e.type === "request/header");
const systemRu = headerRu?.data?.header?.system ?? "";
check("request/header recorded", headerRu !== undefined);
check("system prompt names Русский", systemRu.includes("Русский"), "Cyrillic name in instruction");
check("system prompt names Russian", systemRu.includes("Russian"));
// The per-message reminder is a prompt CONTEXT: agent-loop appends it as a
// user message after the user's message (RuntimeContextProjection.project +
// preStep `messages: [...claimed, context]`), never inside `system`, so it is
// verified indirectly through the reasoning-language switch below.

const reasoningRu = reasoningOf(events);
check("reasoning text produced", reasoningRu.length > 0, `${reasoningRu.length} chars`);
check("reasoning actually in Russian (Cyrillic)", hasCyrillic(reasoningRu), reasoningRu.slice(0, 150).replace(/\s+/g, " "));

// --- 2. switch to English mid-session, prompt again -------------------------
await callApi("settings.update", { ns: "thinking-language", patch: { language: "en" } });
await callApi("session.prompt", {
  sessionId: sid,
  mode: "queue",
  content: [{ type: "text", text: "Walk me through, step by step, how you would debug a memory leak in a long-running Node.js process. Be thorough." }]
});
history = await waitTurns(sid, 2);
events = evs(history);

const headers = events.filter((e) => e.type === "request/header");
const headerEn = headers[headers.length - 1];
const systemEn = headerEn?.data?.header?.system ?? "";
check("second request/header recorded (prompt re-assembled)", headers.length >= 2, `headers: ${headers.length}`);
check("switched system prompt is English (no restart)", systemEn.includes("English") && !systemEn.includes("Русский"));
const headerReasons = headers.map((h) => h.data?.reason ?? "?").join(",");
check("re-assembly marked as change", headerReasons.includes("change"), headerReasons);

const reasoningEn = reasoningOf(events.slice(events.findIndex((e) => e.seq === headerEn.seq)));
check("second reasoning produced", reasoningEn.length > 0, `${reasoningEn.length} chars`);
check("second reasoning switched away from Russian", !hasCyrillic(reasoningEn), reasoningEn.slice(0, 150).replace(/\s+/g, " "));

// --- 3. cleanup -------------------------------------------------------------
await callApi("settings.update", { ns: "thinking-language", patch: { language: "auto" } });
console.log(`\nsession to clean: ${sid}`);

if (failures.length === 0) console.log("\nALL E2E CHECKS PASSED");
else { console.log("\nFAILURES: " + failures.join("; ")); process.exit(1); }
