# dsh-plugin-thinking-language

A DeepSeek Harness plugin that lets you switch the language of the agent's
**thinking/reasoning process** (chain-of-thought). Supports Chinese, English,
Russian, French, German, Spanish, Japanese, Korean and many more mainstream
languages, or "auto" to follow the model.

## What it does

- **Settings row** — Settings → General now shows a **Thinking language**
  picker (a `<select>` next to the built-in Appearance / Language rows).
- **System prompt instruction** — when a language is selected, the plugin
  injects an instruction telling the model to write its internal reasoning in
  that language. The instruction is evaluated per prompt assembly, so it
  applies to every **new session**. Existing sessions keep the prompt they
  already composed.
- **`/thinking-language` command** — set or inspect the language directly from
  chat, e.g. `/thinking-language ru` or `/thinking-language auto`.

The setting is stored in the standard user-settings document under the
`thinking-language` namespace, so it survives restarts and is shared by the
settings row and the command.

> The final answer to the user is **not** affected: the setting only targets
> the model's internal thinking/chain-of-thought.

## Supported languages

`auto` (follow the model) · `zh-CN` 简体中文 · `zh-TW` 繁體中文 · `en` English ·
`ru` Русский · `fr` Français · `de` Deutsch · `es` Español · `pt` Português ·
`it` Italiano · `ja` 日本語 · `ko` 한국어 · `ar` العربية · `hi` हिन्दी ·
`tr` Türkçe · `vi` Tiếng Việt · `th` ไทย · `pl` Polski · `uk` Українська ·
`nl` Nederlands · `sv` Svenska · `id` Bahasa Indonesia · `cs` Čeština

## Install

Run once from a shell (adjust the profile name if you use a different profile,
e.g. `desktop`):

```bash
dsh plugin --profile web add C:\ZiYong\ds-hs-work\dsh-plugin-thinking-language
```

The command installs the package into the profile and appends it to the
profile's bundle layer (because the package declares `dsh.bundle.patch`).

### One-time harness patch (settings exposure)

DeepSeek Harness keeps a hard-coded allowlist of settings namespaces that the
browser may read/write (`WEB_SETTINGS_NAMESPACES` in `dsh-host-apiproxy`), so a
plugin-owned namespace is registered host-side but refused by the browser
(`settings-not-exposed`) until it is added to that list. This installation
already applied the one-line patch to the installed `dsh-host-apiproxy`
(both the profile copy and the CLI install share the same file). To re-apply it
after a reinstall or on another machine, run:

```bash
node scripts\patch-apiproxy.mjs
```

Then **restart the GUI** (`dsh web` / the desktop app) — bundle layers, the
client-module scan, and the patched allowlist are read at boot, so a page
refresh alone is not enough.

## Usage

1. Open **Settings** (gear icon) → **General**.
2. Pick a language in the **Thinking language** row (or choose *Follow the
   model (auto)* to disable the instruction).
3. Start a **new session** — its thinking process is written in the selected
   language.

Or from chat:

```
/thinking-language              → show the current value and usage
/thinking-language ru           → set Russian
/thinking-language auto         → back to auto
/thinking-language 日本語       → ids, English names, and native names all work
```

## How it works

| Part | File | Role |
| --- | --- | --- |
| Host entry | `lib/index.js` | registers the `thinking-language` settings namespace, the `app:thinking-language` system-prompt section (order 85), and the `/thinking-language` command |
| Browser bundle | `lib/client.js` | registers the picker row into the `settings.general.item` slot; reads/writes the same namespace through the client settings scope |
| Bundle patch | `cordis.patch.yml` | inserts the plugin row into the composed profile tree |

The two halves share the `thinking-language` settings namespace, so changing
the value in either surface keeps the other in sync.
