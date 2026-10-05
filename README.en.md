<div align="center">

[**简体中文**](README.md) | 🌐 English

</div>

# dsh-thinking-language

A DeepSeek Harness plugin that lets you switch the language of the agent's
**thinking/reasoning process** (chain-of-thought). Supports Chinese (Simplified
and Traditional), English, Russian, French, German, Spanish, Arabic, Portuguese
and Japanese, or "auto" to follow the system locale.

## What it does

- **A settings page of its own** — Settings → **Thinking language** is a page
  with a single row: the title and its hint on the left, one selector pill
  (dropdown menu) on the right — the same shape as the built-in Language /
  Permission rows.
- **Prompt injection** — when a language is selected the plugin injects a
  system-prompt instruction telling the model to write its internal reasoning
  in that language. With *Follow the system (auto)* the instruction uses the
  system UI locale (Settings → General → Language; defaults to Chinese). The
  instruction is evaluated per prompt assembly, so it applies to every **new
  session**. Existing sessions keep the prompt they already composed.

The setting is stored in the standard user-settings document under the
`thinking-language` namespace, so it survives restarts.

> The final answer to the user is **not** affected: the setting only targets
> the model's internal thinking/chain-of-thought.

## Supported languages

`auto` (follow the system) · `zh-CN` 简体中文 · `zh-TW` 繁體中文 · `en` English ·
`ru` Русский · `fr` Français · `de` Deutsch · `es` Español · `ar` العربية ·
`pt` Português · `ja` 日本語

*Auto* matches the system language tag hierarchically: exact id, then region
variant, then language code. So `en-US` → English, `ja` → Japanese, `de-AT` →
German, and Chinese is decided by **script/region**: `zh`, `zh-Hans`, `zh-CN`
mean Simplified while `zh-Hant`, `zh-TW`, `zh-HK`, `zh-MO` mean Traditional.
An unrecognised locale falls back to English (matching the shell locale
plugin's own fallback).

## Install

Install into **the Harness home you actually run** — check `DSH_HOME` /
`DSH_PROFILE`, since the desktop app and the CLI do not share one by default
(adjust the profile name too if you use e.g. `desktop`):

**From GitHub (recommended):**

```bash
dsh plugin --profile web add github:qingmomo233/dsh-thinking-language
```

**Or from a local source checkout** (replace `<plugin-dir>` with your own local
path; pnpm resolves it inside the profile directory, so point it at the plugin
directory itself):

```bash
dsh plugin --profile web add <plugin-dir>
```

Then **restart the Harness** (fully quit and relaunch the desktop app). The
client module graph is written into `index.html` when the page is rendered, so a
page refresh does not deliver a newly added plugin to an already-open page.

The desktop app **owns** its home: `dsh --profile …` against it is refused with
`profile "desktop" is managed exclusively by the Electron application`, so
install from the app's own plugin market instead (it accepts only a
`github:owner/repo[#sha]` spec).

> **If it installs but does not show, look for `skipping profile bundle` in the
> log.** A leftover entry under the old package name (renamed from
> `dsh-plugin-thinking-language` to `dsh-thinking-language` in v1.1) is skipped —
> `dsh plugin --profile web remove dsh-plugin-thinking-language` first. A
> `peerDependencies` mismatch against the running dsh version is skipped too
> (`^0.1.0-rc.6` does **not** match 0.2.x); the log says
> `is incompatible with dsh …`.

### About the settings-exposure patch (very old harnesses only)

Since DSH 0.2.6 the host exposes **every** registered settings namespace to the
browser, and DSH 0.2.9 removed `dsh-host-apiproxy` entirely. Current builds
therefore need **no patch at all**.

Only DSH ≤ 0.2.3 (the `dsh-host-apiproxy@0.1.0-rc.5` generation) still keeps a
hard-coded `WEB_SETTINGS_NAMESPACES` allowlist; there a plugin-owned namespace
registers host-side but the browser gets `settings-not-exposed`, so the row
renders but never persists. The script detects the allowlist before touching
anything:

```bash
node scripts/patch-apiproxy.mjs          # dry run: detect and report only
node scripts/patch-apiproxy.mjs --write  # apply (writes a .dsh-thinking-language.bak backup first)
```

## Usage

1. Open **Settings** (gear icon) → **Thinking language** in the left nav.
2. Pick a language on that page (or choose *Follow the system (auto)* to use
   the system UI locale).
3. Start a **new session** — its thinking process is written in the selected
   language.

## Compatibility

The plugin degrades instead of failing when a service or dependency is absent:

| Situation | Behaviour |
| --- | --- |
| Harness without `systemPrompt` | the settings namespace keeps working |
| Harness without this settings channel (no `settings` service / registration refused) | one warning, the prompt surfaces keep working |
| Harness without a settings transport (`configForms` / `settingsScope`) | the page is skipped and reported once after boot |
| Harness without the `locale` service | the page uses its built-in copy instead of crashing |
| Harness without the platform UI primitives module | the page falls back to a native select and still shows |
| `describe()` unavailable or a different schema shape | the picker falls back to the bundled catalog |
| Hand-edited/corrupt settings section | treated as `auto`; nothing is thrown and user data is never rewritten |
| Unrecognised system language tag | falls back to English (matching the shell locale plugin) |

Both halves share one catalog: the picker's entries are derived from the
**host-registered settings schema** (each enum value carries its endonym, e.g.
`简体中文` — exactly what the picker showed before), the browser keeps only a
fallback copy, and `smoke-test.mjs` fails when the two drift apart.

## How it works

| Part | File | Role |
| --- | --- | --- |
| Pure core | `lib/languages.js` | catalog, system-locale tag matching, instruction/reminder copy (no cordis, no browser globals — directly unit-testable) |
| Host entry | `lib/index.js` | registers the `thinking-language` settings namespace and the `app:thinking-language` system-prompt section (order 85) |
| Browser bundle | `lib/client.js` | registers a dedicated **Thinking language** page into the `settings.section` slot and reads/writes the same namespace through the client settings scope |
| Bundle patch | `cordis.patch.yml` | inserts the plugin row into the composed profile tree |
| Tests | `smoke-test.mjs` | host registration, locale matrix, settings-handle shapes, browser-bundle drift and degradation paths, frozen UI copy |

```bash
pnpm install   # installs the test dependencies (@deepseek-ai/cordis, @deepseek-ai/schemastery)
npm test       # smoke-test.mjs + cordis-check.mjs
```
