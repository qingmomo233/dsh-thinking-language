# Changelog

## 1.4.2

### Fixed

- **The settings row now appears on dsh 0.2.x.** The 1.4.1 chevron fix was real
  but unreachable: the row was still waiting for the `settingsScope` service,
  which dsh 0.2.x renamed to `configForms` (a scan of the shipped core finds the
  old name in 104 files of the 0.1.x runtime and in **none** of the 0.2.0-rc.2
  tree). A `ctx.inject` branch waiting for a service that no longer exists never
  runs and never fails, so nothing registered, nothing was logged as an error,
  and the setting was simply absent from an otherwise healthy Settings panel.

  The plugin now installs a branch per transport generation and mounts the row
  through whichever one the harness serves: `configForms` on 0.2.x, where the
  form is fetched per namespace and the row is registered while
  `whileServed([...])` reports the Host serving it; the legacy `settingsScope`
  (form bound per namespace) before that. A harness serves exactly one
  generation, so the mount is latched and the row can never register twice. The
  availability warning after boot now distinguishes "no transport at all", "no
  `locale`", and "transport present but the row never mounted".

  Both suites cover the split: `smoke-test.mjs` exercises every generation with
  a hand-built schema (proving the catalog is read through the `configForms`
  describe *mirror*, not the fallback table), and `cordis-check.mjs` boots the
  real container against `configForms` to keep the late-`locale` guard.

## 1.4.1

### Fixed

- **The settings row disappeared on dsh 0.2.x — the real cause of "installed but
  not showing".** The row asked the primitives package for
  `IconChevronDownOutline14`. dsh 0.1.x named its icons by size, dsh 0.2.x names
  them by weight, so on 0.2.x that lookup was `undefined` and the row rendered
  `undefined` as a component. React then throws *while rendering* ("Element type
  is invalid… expected a string or a class/function but got: undefined"), the
  slot renderer drops the row, and the setting vanishes from an otherwise
  perfectly healthy Settings panel — no plugin error, no failed fiber, nothing
  in the UI to point at it.

  The chevron is now resolved through the names the shipped packages actually
  use, newest first (`IconChevronDownOutlineRegular` → `IconChevronDownOutline`
  → `IconChevronDownOutline14`), and an absent icon degrades to no icon instead
  of a failed row. `smoke-test.mjs` now fails when the bundle names a primitives
  export outside that tolerated set, so the next rename cannot repeat this.

## 1.4.0

### Removed

- **The `/thinking-language` chat command.** The Settings → General row is the
  only surface now: the command duplicated it and was rarely used. Gone with it
  are its pure helpers (`describeLanguage`, `usageLine`, `parseCommandArgument`)
  from `lib/languages.js`, the host's `commands` injection branch, the exported
  type declarations, and both suites' command coverage.

### Changed

- The host entry no longer acquires the `commands` service, so one less
  degradation path is needed. Reads and writes still go through the same
  `thinking-language` namespace, and the stored value is untouched.
- **The catalog is down to ten entries**: `zh-CN`, `zh-TW`, `en`, `ru`, `fr`,
  `de`, `es`, `ar`, `pt`, `ja` (plus `auto`). Italian, Korean, Hindi, Turkish,
  Vietnamese, Thai, Polish, Ukrainian, Dutch, Swedish, Indonesian and Czech are
  gone from the picker and the settings schema. A session that stored one of the
  removed ids keeps the value verbatim (the plugin never rewrites user data) and
  simply produces no thinking instruction, exactly like any other unknown id.
- The row's own dictionaries now match that set: Arabic and Portuguese were
  added, Korean removed.

## 1.3.0

Desktop-app (dsh 0.2.0-rc.2) alignment. No settings migration: the
`thinking-language` namespace, its `language` field, the plugin name and the
`/thinking-language` command are unchanged.

### Fixed

- **The settings row could be dropped silently.** The browser half aborted its
  whole `apply` — logging "the platform UI primitives module is unavailable;
  the settings row is disabled" — whenever `@deepseek-ai/dsh-client-ui-primitives`
  was absent from the harness's static module table. A missing row is
  indistinguishable from "the plugin is not installed". The row is now always
  registered: when the primitives module (or just its `Menu`) is unavailable it
  falls back to a native `<select>` built from the React seat the slot renderer
  already owns, so the preference stays reachable on every harness generation.

### Changed

- `dsh.client` now follows the shape the shipped client plugins actually use:
  `inject` names the **package rows** whose services the row waits for
  (`@deepseek-ai/dsh-client-locale` for `locale`,
  `@deepseek-ai/dsh-client-ui-settings` for `settingsScope`,
  `@deepseek-ai/dsh-client-ui-settings-general` for the
  `settings.general.item` slot) so the module graph orders them before this
  row.
- Dropped the non-standard `dsh.client.external` array (`react` and
  `@deepseek-ai/dsh-client-ui-primitives` are platform **seed words**, not
  graph rows, so the array could never add an edge) and the `immediately: true`
  bootstrap-tier flag, which is reserved for bundles that must activate before
  the shell's own providers (this row consumes them instead).
- Added `dsh.compatibility` (`dsh` range plus a per-release `dshReleases`
  table) so the desktop app's and the CLI's compatibility gates can accept the
  release instead of skipping the bundle.
- `exports` now publishes `./cordis.patch.yml`, matching `dsh-base` and the
  other published bundles.
- The `@deepseek-ai/dsh-client-ui-primitives` peer range is bounded
  (`>=0.1.0-rc.5 <0.3.0-0`) so a future 0.3.x generation is not silently
  claimed as compatible.

## 1.2.0

Compatibility-focused refactor. No settings migration is required: the
`thinking-language` namespace, its `language` field, its stored values, the
plugin name (`thinking-language`), and the `/thinking-language` command all
keep working exactly as before.

### Fixed

- **The settings row rendered its raw keys (`title`, `hint`, `lang.auto`).**
  A regression introduced while making the browser half's service set optional:
  the dictionaries were registered behind a one-shot `ctx.get("locale")` check
  while the plugin only requires `slots`. `slots` becomes available before
  `settingsScope`, so apply could run while the locale plugin was still
  starting, the check found nothing, and the registration was skipped for the
  whole session — the renderer's `t` seat then fell back to the key itself. The
  dictionaries now register on a `ctx.inject(["locale"])` branch that **waits**
  for the service, and the row waits for it as well (the slot renderer treats a
  declared `locale` namespace with no installed locale face as a fatal assembly
  error). `cordis-check.mjs` reproduces the late-locale boot and fails if the
  registration stops waiting.
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
- The package declares `npm test`, and `@deepseek-ai/cordis` is a devDependency,
  so a fresh `pnpm install` is enough to run the checks.
- The READMEs no longer embed a machine-specific absolute path in the local
  install example; they use a `<plugin-dir>` placeholder instead.

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
