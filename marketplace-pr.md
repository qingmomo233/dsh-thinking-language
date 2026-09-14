# Add dsh-thinking-language to awesome-dsh-plugin

## What this PR does

Adds `qingmomo233/dsh-thinking-language` to the curated plugin list
(`data/plugins/qingmomo233__dsh-thinking-language.yml`), so it becomes
visible in the DSH plugin market (dshmarket) and installable with:

```bash
dsh plugin --profile web add github:qingmomo233/dsh-thinking-language
```

## New file: `data/plugins/qingmomo233__dsh-thinking-language.yml`

```yaml
url: https://github.com/qingmomo233/dsh-thinking-language
name: qingmomo233/dsh-thinking-language
category: session
description:
  en: 'Switch the language of the agent''s thinking/reasoning process (chain-of-thought): 简体中文, English, Русский, Français, Deutsch, Español, 日本語, 한국어 and more, or auto-follow the system locale. Adds a Settings → General row, a system-prompt instruction plus a per-step reminder (effective from the next model call, no restart), and the /thinking-language command.'
  zh: 切换智能体思考过程（推理/链式思考）的语言：支持简体中文、英文、俄语、法语、德语、西班牙语、日语、韩语等，或跟随系统界面语言（自动）。新增「设置 → 通用」中的思考语言选择行、系统提示词注入与每步动态提示（下一次模型调用即生效，无需重启）与 /thinking-language 命令。
```

## Compatibility notes

- Optional harness services (`systemPrompt`, `commands`, `settingsScope`,
  `locale`) are acquired per branch: a missing one degrades a single surface
  instead of disabling the plugin.
- The browser bundle hard-requires only `slots`; the platform UI primitives and
  React are resolved optionally, so it loads on leaner/older harnesses.
- The picker's language list is derived from the host-registered settings
  schema; the browser keeps only a fallback copy, guarded by `smoke-test.mjs`.
- `scripts/patch-apiproxy.mjs` is a dry run by default and only ever touches
  harnesses that still carry the `WEB_SETTINGS_NAMESPACES` allowlist
  (DSH ≤ 0.2.3).

## Checklist

- [x] Plugin repo exists: https://github.com/qingmomo233/dsh-thinking-language
- [x] `package.json` has a valid `dsh` declaration (`dsh.bundle.patch` + `dsh.client`)
- [x] No npm package / release tarball yet → pure GitHub install route (same as
      1243 other entries)
- [ ] (Optional, follow-up) publish an npm package so installs go through the
      npm tarball route (faster); then add `npm:` to the YAML entry
