<div align="center">

[**简体中文**](README.md) | 🌐 English

</div>

# dsh-thinking-language

A DeepSeek Harness plugin that lets you switch the language of the agent's
**thinking/reasoning process** (chain-of-thought). Supports Chinese, English,
Russian, French, German, Spanish, Japanese, Korean and many more mainstream
languages, or "auto" to follow the system locale.

## What it does

- **Settings row** — Settings → General shows a **Thinking language** picker
  with the same Setting-Cell layout as the built-in Language / Permission rows:
  title and hint on the left, the selector pill (dropdown menu) on the right.
- **Prompt injection** — when a language is selected the plugin injects a
  system-prompt instruction telling the model to write its internal reasoning
  in that language, plus a **per-step dynamic reminder** (a prompt context)
  restated right after the user message on every model call. A switch therefore
  takes effect on the **next model call of the current session** — no restart,
  no new session. With *Follow the system (auto)* the language follows the
  system UI locale (Settings → General → Language).
- **`/thinking-language` command** — set or inspect the language directly from
  chat, e.g. `/thinking-language ru` or `/thinking-language auto`. Ids, English
  names, native names, and unique prefixes (`japan`) all work.

The setting is stored in the standard user-settings document under the
`thinking-language` namespace, so it survives restarts and is shared by the
settings row and the command.

> The final answer to the user is **not** affected: the setting only targets
> the model's internal thinking/chain-of-thought.

## Supported languages

`auto` (follow the system) · `zh-CN` 简体中文 · `zh-TW` 繁體中文 · `en` English ·
`ru` Русский · `fr` Français · `de` Deutsch · `es` Español · `pt` Português ·
`it` Italiano · `ja` 日本語 · `ko` 한국어 · `ar` العربية · `hi` हिन्दी ·
`tr` Türkçe · `vi` Tiếng Việt · `th` ไทย · `pl` Polski · `uk` Українська ·
`nl` Nederlands · `sv` Svenska · `id` Bahasa Indonesia · `cs` Čeština

*Auto* matches the system language tag hierarchically: exact id, then region
variant, then language code. So `en-US` → English, `ja` → Japanese, `de-AT` →
German, and Chinese is decided by **script/region**: `zh`, `zh-Hans`, `zh-CN`
mean Simplified while `zh-Hant`, `zh-TW`, `zh-HK`, `zh-MO` mean Traditional.
An unrecognised locale falls back to English (matching the shell locale
plugin's own fallback).

## Install

Run once from a shell (adjust the profile name if you use a different profile,
e.g. `desktop`):

**From GitHub (recommended):**

```bash
dsh plugin --profile web add github:qingmomo233/dsh-thinking-language
```

**Or from a local source checkout:**

```bash
dsh plugin --profile web add C:\ZiYong\ds-hs-work\dsh-plugin-thinking-language
```

The command installs the package into the profile and appends it to the
profile's bundle layer (because the package declares `dsh.bundle.patch`), then
**restart the GUI** (`dsh web` / the desktop app) — bundle layers and the
client-module scan are read at boot, so a page refresh alone is not enough.

> The package was renamed from `dsh-plugin-thinking-language` to
> `dsh-thinking-language` in v1.1. If you installed the old name, remove it
> first (`dsh plugin --profile web remove dsh-plugin-thinking-language`) so the
> profile does not carry two rows for the same plugin.

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

1. Open **Settings** (gear icon) → **General**.
2. Pick a language in the **Thinking language** row (or choose *Follow the
   system (auto)* to use the system UI locale).
3. It applies from the next model call — no restart and no new session needed.

Or from chat:

```
/thinking-language              → show the current value and usage
/thinking-language ru           → set Russian
/thinking-language auto         → back to auto
/thinking-language 日本語       → ids, English names, native names, unique prefixes
```

## Compatibility

The plugin degrades instead of failing when a service or dependency is absent:

| Situation | Behaviour |
| --- | --- |
| Harness without `systemPrompt` | settings namespace and `/thinking-language` keep working |
| Harness without `commands` | settings namespace and prompt injection keep working |
| `settings.register()` refused (duplicate / stricter signature) | one warning, the rest keeps reading and writing through the settings service |
| Harness without `settingsScope` (client settings transport) | the row is skipped and reported once after boot; the command is unaffected |
| Harness without the `locale` service | the row uses its built-in copy instead of crashing |
| Harness without the platform UI primitives module | the row is skipped and reported; other plugins are unaffected |
| `describe()` unavailable or a different schema shape | the picker falls back to the bundled catalog |
| Hand-edited/corrupt settings section | treated as `auto`; nothing is thrown and user data is never rewritten |
| Unrecognised system language tag | falls back to English (matching the shell locale plugin) |

Both halves share one catalog: the picker's entries are derived from the
**host-registered settings schema** (each enum value carries a
`简体中文 · Simplified Chinese` label), the browser keeps only a fallback copy,
and `smoke-test.mjs` fails when the two drift apart.

## How it works

| Part | File | Role |
| --- | --- | --- |
| Pure core | `lib/languages.js` | catalog, system-locale tag matching, instruction/reminder copy, command parsing (no cordis, no browser globals — directly unit-testable) |
| Host entry | `lib/index.js` | registers the `thinking-language` settings namespace and its labelled schema, the `app:thinking-language` system-prompt section (order 85), the per-step reminder (order 1000), and the `/thinking-language` command |
| Browser bundle | `lib/client.js` | registers the picker row into the `settings.general.item` slot, reads/writes the same namespace through the client settings scope, and derives its entries from the host schema |
| Bundle patch | `cordis.patch.yml` | inserts the plugin row into the composed profile tree |
| Tests | `smoke-test.mjs` | host registration, locale matrix, settings-handle shapes, browser-bundle drift and degradation paths |

```bash
node smoke-test.mjs   # or npm test
```
