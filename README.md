<div align="center">

🌐 **简体中文** | [English](README.en.md)

</div>

# dsh-thinking-language

一个 DeepSeek Harness 插件，用于切换智能体**思考过程（推理 / 链式思考）的语言**。
支持中文、英文、俄语、法语、德语、西班牙语、日语、韩语等主流语言，也可选择
「跟随系统（自动）」——让思考语言跟随系统界面语言。

## 功能

- **设置项** — 设置 → 通用 中新增「思考语言」选择行，采用与内置「语言」「权限预设」行相同的
  Setting-Cell 布局：左侧标题与说明，右侧选择列表（选择 pill + 下拉菜单）。
- **系统提示词注入** — 选择语言后，插件会向系统提示词注入一条指令，要求模型用该语言
  书写内部推理过程。选择「跟随系统（自动）」时，指令使用系统界面语言
  （设置 → 通用 → 语言，缺省中文）。指令在每次组装提示词时求值，因此对**新建会话**
  生效；已有会话继续使用其已组装的提示词。
- **`/thinking-language` 命令** — 直接在聊天中查看或切换语言，例如 `/thinking-language ru`
  或 `/thinking-language auto`。

设置存储于标准用户设置文档的 `thinking-language` 命名空间，重启后仍保留，
设置行与命令共享同一份配置。

> 注意：该设置只影响模型的内部思考/链式思考，**不会改变**给用户的最终回答语言。

## 支持的语言

`auto`（跟随系统） · `zh-CN` 简体中文 · `zh-TW` 繁體中文 · `en` English ·
`ru` Русский · `fr` Français · `de` Deutsch · `es` Español · `pt` Português ·
`it` Italiano · `ja` 日本語 · `ko` 한국어 · `ar` العربية · `hi` हिन्दी ·
`tr` Türkçe · `vi` Tiếng Việt · `th` ไทย · `pl` Polski · `uk` Українська ·
`nl` Nederlands · `sv` Svenska · `id` Bahasa Indonesia · `cs` Čeština

## 安装

在命令行执行（若使用其他配置文件，请把 `web` 换成对应名称，如 `desktop`）：

```bash
dsh plugin --profile web add C:\ZiYong\ds-hs-work\dsh-plugin-thinking-language
```

该命令会把插件安装到配置目录，并因其声明了 `dsh.bundle.patch` 而自动追加到
配置文件的 bundle 层。

### 一次性补丁（设置暴露）

DeepSeek Harness 在 `dsh-host-apiproxy` 中维护了一个硬编码的设置命名空间白名单
（`WEB_SETTINGS_NAMESPACES`），只有白名单内的命名空间允许浏览器读写。因此插件注册的
命名空间在服务端注册后，仍需加入该列表，否则浏览器会收到 `settings-not-exposed`。
本次安装已对已安装的 `dsh-host-apiproxy` 应用了这一行补丁（配置目录副本与 CLI
安装副本为同一文件）。若重装后需要重新应用，可运行：

```bash
node scripts\patch-apiproxy.mjs
```

然后**重启 GUI**（`dsh web` 或桌面应用）——bundle 层、客户端模块扫描与补丁后的
白名单都在启动时读取，仅刷新页面不够。

## 使用方法

1. 打开**设置**（齿轮图标）→ **通用**。
2. 在「思考语言」行选择语言（选择「跟随系统（自动）」即使用系统界面语言）。
3. 开启**新会话**——其思考过程将使用所选语言书写。

或直接在聊天中输入：

```
/thinking-language              → 查看当前值及用法
/thinking-language ru           → 设为俄语
/thinking-language auto         → 恢复自动
/thinking-language 日本語       → 支持 id、英文名、母语名
```

## 实现结构

| 部分 | 文件 | 作用 |
| --- | --- | --- |
| 服务端入口 | `lib/index.js` | 注册 `thinking-language` 设置命名空间、`app:thinking-language` 系统提示词小节（顺序 85）及 `/thinking-language` 命令 |
| 浏览器端 | `lib/client.js` | 向 `settings.general.item` 槽注册选择行；通过客户端设置作用域读写同一命名空间 |
| Bundle 补丁 | `cordis.patch.yml` | 把插件行插入组合后的配置树 |

两端共享 `thinking-language` 命名空间，任一处修改都会同步到另一处。
