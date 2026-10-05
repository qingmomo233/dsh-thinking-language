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
  en: 'Switch the language of the agent''s thinking/reasoning process (chain-of-thought): 简体中文, 繁體中文, English, Русский, Français, Deutsch, Español, العربية, Português, 日本語, or auto-follow the system locale. Adds a dedicated Settings → Thinking language page and a system-prompt instruction (per-prompt assembly, applies to new sessions).'
  zh: 切换智能体思考过程（推理/链式思考）的语言：支持简体中文、繁體中文、英文、俄语、法语、德语、西班牙语、阿拉伯语、葡萄牙语、日语，或跟随系统界面语言（自动）。新增独立的「设置 → 思考语言」页面与系统提示词注入（每次组装提示词时求值，新会话生效）。
```

## Checklist

- [x] Plugin repo exists: https://github.com/qingmomo233/dsh-thinking-language
- [x] `package.json` has a valid `dsh` declaration (`dsh.bundle.patch` + `dsh.client`)
- [x] No npm package / release tarball yet → pure GitHub install route (same as
      1243 other entries)
- [ ] (Optional, follow-up) publish an npm package so installs go through the
      npm tarball route (faster); then add `npm:` to the YAML entry
