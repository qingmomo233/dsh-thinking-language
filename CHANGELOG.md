# Changelog

## 1.2.0

Compatibility-focused refactor. No settings migration is required: the
`thinking-language` namespace, its `language` field, its stored values, the
plugin name (`thinking-language`), and the `/thinking-language` command all
keep working exactly as before.

### Fixed

- **"Follow the system (auto)" only knew about English.** Every locale except
  `en` — including `zh-TW`, `ja`, `ko`, and `de` — resolved to Simplified
  Chinese. The locale tag is now matched hierarchically over the whole catalog
  (exact id → region → language), with the Chinese entries decided by
  script/region (`zh`/`zh-Hans`/`zh-CN` → Simplified,
  `zh-Hant`/`zh-TW`/`zh-HK`/`zh-MO` → Traditional), and an unrecognised locale
  falls back to English, matching the shell locale plugin's own fallback.
- **The schema default was applied on every write.** Selecting "auto" now
  clears the stored field (leaving the schema default in charge) instead of
  writing the literal `"auto"`.
- **The `auto` command reply is byte-identical.** `describeLanguage` still
  answers `auto (follow the system)`.
- **No user-visible copy changed.** The row's hint and the usage step still
  describe the system-prompt instruction, which is evaluated per prompt assembly
  and therefore applies to new sessions. A separately registered prompt context
  additionally restates the choice on every model call, but the copy was left
  untouched rather than "corrected" — see *Unchanged* below.

### Compatibility

- **Host**: each service is acquired through its own `ctx.inject` branch, so a
  harness without `commands` (or without `systemPrompt`) keeps the other
  surfaces. A refused `settings.register()` is logged once and the plugin keeps
  working through the settings service.
- **Reads** accept both handle shapes (`settings.get(ns)` and the namespace
  scope `settings.register()` returns) and treat any refusal as "absent"
  instead of throwing; a malformed stored section degrades to `auto`.
- **Browser bundle**: hard-requires only `slots`. The platform UI primitives
  module and React are resolved through a tolerant `require` helper, so a
  bundle never dies at materialization on a missing seed word; without
  `settingsScope` the row is skipped and reported once after boot; without
  `locale` the row uses its own copy.
- **No React peer dependency**: elements are built with the platform
  `React.createElement` when available, so `react/jsx-runtime` is no longer
  required by the bundle.
- **The picker can no longer drift from the host catalog**: the settings schema
  carries a label per enum value (the endonym, e.g. `简体中文`) and the row
  derives its entries from `settingsScope.describe()`, with a bundled fallback
  and a test that fails on drift. The rendered labels are byte-for-byte what
  the hard-coded table used to show.
- `settings.register()` failures, `describe()` failures, refused writes, and a
  missing settings transport are now reported through the harness logger.
- `scripts/patch-apiproxy.mjs` is a **dry run by default** (`--write` to
  apply), backs the file up before editing, and reports "exposure is automatic"
  on harnesses that no longer carry the `WEB_SETTINGS_NAMESPACES` allowlist
  (DSH ≥ 0.2.6).

### Added

- `lib/languages.js`: the pure core (catalog, locale matching, instruction and
  reminder copy, command parsing) — no cordis and no browser globals, so it is
  directly unit-testable.
- Command arguments accept unique prefixes (`/thinking-language japan`).
- `smoke-test.mjs` now covers the locale matrix, both settings-handle shapes, a
  refused registration, the client bundle's degradation paths, and host/client
  catalog drift.

### Changed

- `lib/types/*.d.ts` describe the full exported surface.
- The package declares `npm test`.

### Unchanged (deliberately)

- Every user-visible string: the row's title/hint and the `lang.auto` label in
  all eight dictionaries, and the endonym shown for each entry in the dropdown.
  This release only touches compatibility, robustness, and the `auto` locale
  mapping.

## 1.1.0

- Renamed the package from `dsh-plugin-thinking-language` to
  `dsh-thinking-language`.
- Made the browser bundle independent of `@deepseek-ai/dsh-client-store` by
  inlining the small `defineStore` shim it needs.

## 1.0.0

- First release: settings row, system-prompt instruction, per-step reminder,
  and the `/thinking-language` command.
