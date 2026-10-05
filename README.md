<div align="center">

🌐 **简体中文** | [English](README.en.md)

</div>

# dsh-thinking-language

一个 DeepSeek Harness 插件，用于切换智能体**思考过程（推理 / 链式思考）的语言**。
支持中文（简/繁）、英文、俄语、法语、德语、西班牙语、阿拉伯语、葡萄牙语、日语，
也可选择「跟随系统（自动）」——让思考语言跟随系统界面语言。

## 功能

- **设置项** — 设置 → 通用 中新增「思考语言」选择行，采用与内置「语言」「权限预设」行相同的
  Setting-Cell 布局：左侧标题与说明，右侧选择列表（选择 pill + 下拉菜单）。
- **系统提示词注入** — 选择语言后，插件会向系统提示词注入一条指令，要求模型用该语言
  书写内部推理过程。选择「跟随系统（自动）」时，指令使用系统界面语言
  （设置 → 通用 → 语言，缺省中文）。指令在每次组装提示词时求值，因此对**新建会话**
  生效；已有会话继续使用其已组装的提示词。

设置存储于标准用户设置文档的 `thinking-language` 命名空间，重启后仍保留。

> 注意：该设置只影响模型的内部思考/链式思考，**不会改变**给用户的最终回答语言。

## 支持的语言

`auto`（跟随系统） · `zh-CN` 简体中文 · `zh-TW` 繁體中文 · `en` English ·
`ru` Русский · `fr` Français · `de` Deutsch · `es` Español · `ar` العربية ·
`pt` Português · `ja` 日本語

「自动」按系统语言标签逐级匹配：精确 id → 地区变体 → 语言代码。因此 `en-US` → 英文、
`ja` → 日语、`de-AT` → 德语；中文按**字体/地区**判定：`zh`、`zh-Hans`、`zh-CN` → 简体，
`zh-Hant`、`zh-TW`、`zh-HK`、`zh-MO` → 繁体。无法识别的语言回退到英文
（与界面语言插件的兜底一致）。

## 安装

插件要装进**你实际在用的那个 Harness 主目录**（用 `DSH_HOME` / `DSH_PROFILE` 确认）。

**命令行（从 GitHub 安装，推荐）：**

```bash
dsh plugin --profile web add github:qingmomo233/dsh-thinking-language
```

也可装本地源码目录：`dsh plugin --profile web add <插件目录>`（pnpm 在配置目录下解析，
请给出插件目录本身）。

**桌面版：** 用应用内的插件市场安装，只接受 `github:owner/repo[#sha]`。
桌面版主目录由应用自己管理，`dsh --profile …` 会被拒绝
（`profile "desktop" is managed exclusively by the Electron application`）。

装完**必须重启 Harness**（桌面版完全退出后重新打开）。客户端模块图是在渲染页面时
写进 `index.html` 的，只刷新页面不会把新插件送进已经打开的页面。

> **不显示时先看日志里有没有 `skipping profile bundle`：**
> 包名残留旧名（v1.1 起由 `dsh-plugin-thinking-language` 改为 `dsh-thinking-language`）
> 会被整包跳过，先 `dsh plugin --profile web remove dsh-plugin-thinking-language` 再装；
> `peerDependencies` 与 dsh 版本不匹配（`^0.1.0-rc.6` 这类**不匹配 0.2.x**）同样会
> 被跳过，日志会写 `is incompatible with dsh …`。

### 关于设置暴露补丁（仅极旧版本需要）

DSH 0.2.6 起，服务端会向浏览器暴露**全部**已注册的设置命名空间；0.2.9 起
`dsh-host-apiproxy` 已被移除。因此当前版本**无需任何补丁**。

只有在 DSH ≤ 0.2.3（`dsh-host-apiproxy@0.1.0-rc.5`）这类仍使用硬编码白名单
`WEB_SETTINGS_NAMESPACES` 的旧版本上，才需要把 `thinking-language` 加入白名单，
否则设置行能显示但无法保存（浏览器收到 `settings-not-exposed`）。脚本会先**检测**白名单是否存在：

```bash
node scripts/patch-apiproxy.mjs          # 预演：只检测并报告，不修改任何文件
node scripts/patch-apiproxy.mjs --write  # 确认需要后再写入（会先备份 .dsh-thinking-language.bak）
```

## 使用方法

1. 打开**设置**（齿轮图标）→ **通用**。
2. 在「思考语言」行选择语言（选择「跟随系统（自动）」即使用系统界面语言）。
3. 开启**新会话**——其思考过程将使用所选语言书写。

## 兼容性

插件在以下方向做过兼容性处理，缺少某个服务或依赖时**降级**而不是整体失效：

| 场景 | 行为 |
| --- | --- |
| Harness 没有 `systemPrompt` | 设置命名空间仍可用 |
| Harness 不支持该设置通道（`register()` 被拒绝 / 未声明 volatile 字段） | 记录一次警告，提示词功能照常 |
| Harness 无设置通道（`configForms` / `settingsScope`） | 跳过设置行并在启动后记录一次警告 |
| Harness 未提供 `locale` 服务 | 设置行使用内置文案（`lang.auto` 等）而非崩溃 |
| Harness 未提供平台 UI primitives 模块 | 回退到原生下拉，设置行照常显示 |
| `describe()` 不可用或 schema 结构不同 | 选择列表回退到内置语言表 |
| 设置文档被手工改坏（非对象、非字符串） | 视为 `auto`，不抛错，也不覆盖用户数据 |
| 系统语言标签无法识别 | 回退英文（与界面语言插件兜底一致） |

宿主端与浏览器端共享同一份语言目录：设置行的候选项由**宿主注册的 schema** 推导
（每个枚举值附带 `简体中文` 形式的母语名标签，与原来的显示一致），浏览器端只保留一份
兜底副本，`smoke-test.mjs` 会在两者不一致时失败。

## 实现结构

| 部分 | 文件 | 作用 |
| --- | --- | --- |
| 纯逻辑核心 | `lib/languages.js` | 语言目录、系统语言标签匹配、指令与提醒文案（无 cordis / 无浏览器依赖，可直接单测） |
| 服务端入口 | `lib/index.js` | 注册 `thinking-language` 设置命名空间与 `app:thinking-language` 系统提示词小节（顺序 85） |
| 浏览器端 | `lib/client.js` | 向 `settings.general.item` 槽注册选择行；通过客户端设置作用域读写同一命名空间 |
| Bundle 补丁 | `cordis.patch.yml` | 把插件行插入组合后的配置树 |
| 测试 | `smoke-test.mjs` | 宿主注册、语言匹配矩阵、读写句柄兼容、浏览器 bundle 漂移与降级路径、UI 文案锁定 |

```bash
pnpm install   # 安装测试依赖（@deepseek-ai/cordis、@deepseek-ai/schemastery）
npm test       # smoke-test.mjs + cordis-check.mjs
```

两端共享 `thinking-language` 命名空间，任一处修改都会同步到另一处。
