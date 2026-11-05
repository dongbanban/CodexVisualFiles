# VisualFiles

在 Codex 独立面板中浏览本机项目、查看代码与 Git Diff，并把文件或选中代码添加到对话草稿。当前版本 **0.7.7**，支持 macOS（Apple Silicon / Intel）。

## 功能

- 文件树、文件名与全文搜索，自动同步文件变化。
- 只读代码高亮、文件内查找、Markdown 和图片预览。
- 文件右键菜单“Codex 原生查看”调用原生文件查看器，需要客户端支持；打开当前磁盘文件。
- 已有文件的改动自动显示 HEAD 与当前磁盘内容的左右对比；新增文件只显示当前全文。
- 新建空文件/目录、复制、剪切、移动、重命名；删除进入系统废纸篓。
- 将文件、目录或选中代码添加到当前或新对话草稿，不自动发送。
- 拖动左右分隔线调整宽度，按项目记住布局与阅读位置。

仅打开 Codex 已登记的本机项目及其受管理 worktree。单文件预览上限 12 MB；定义跳转仅支持 JS/TS 的同文件声明，文件内容不支持编辑保存。

## 安装

采用 GitHub 自定义 marketplace 方式。它是仓库分发源，安装后出现在本机插件列表中；官方公开目录上架是另一条流程。[Codex marketplace 官方说明](https://developers.openai.com/plugins/build/plugins)

### 1. 准备环境

需要：

- 支持本机执行的 Codex 桌面客户端，并已创建至少一个关联本机目录的项目。
- **Node.js 22 或更高版本**，可从 [Node.js 官网](https://nodejs.org/en/download) 安装；启动脚本支持 PATH、Homebrew 和默认 nvm 安装位置。
- Git，以及支持 `codex plugin` 命令的 Codex CLI。
- ripgrep（`rg`）用于搜索；可使用客户端自带版本，也可自行安装并加入 PATH。

在终端检查：

```bash
node --version
git --version
codex plugin --help
```

如果没有 Codex CLI，或 CLI 没有 `plugin` 子命令，在安装 Node.js 后执行：

```bash
npm install -g @openai/codex@latest
```

已有本地路径安装的用户，先按下方“从旧本地安装迁移”处理。

### 2. 添加市场并安装

在终端执行：

```bash
codex plugin marketplace add dongbanban/CodexVisualFiles
codex plugin add visualfiles@visualfiles-local
```

`visualfiles-local` 是市场的固定标识，`visualfiles` 是插件标识。仓库的 `release/` 已包含编译后的服务、界面和启动脚本；普通用户无需克隆仓库、运行 npm 构建或修改开发机路径。

### 3. 重启并打开

1. 重新启动 Codex 桌面客户端，打开或新建本机项目聊天。
2. 在项目聊天中输入“打开文件树”，或使用对话内的 VisualFiles 面板入口。插件不再向左侧「…」全局菜单注册手动入口。
3. 选择已登记项目，点击左侧文件即可查看。Markdown 文件可用标题栏的眼睛图标切换源码和预览。

可执行下列命令查看安装信息：

```bash
codex plugin list --marketplace visualfiles-local --json
```

安装过程不需要配置生命周期 hooks。已有聊天可能保留旧 MCP 连接，更新后建议使用新聊天验证。

## 更新

先刷新 GitHub 市场，再重装插件缓存：

```bash
codex plugin marketplace upgrade visualfiles-local
codex plugin remove visualfiles@visualfiles-local
codex plugin add visualfiles@visualfiles-local
```

完成后重启客户端并打开新聊天。重装不操作项目目录；直接修改插件缓存中的自定义配置会被新安装包覆盖。

### 清除旧的全局入口

0.7.4 已删除全局侧栏入口及快捷操作声明，保留聊天内打开文件树的能力。旧入口由已安装插件的 MCP 元数据注册；仅更新源码不会替换旧安装缓存。

GitHub 市场安装按上方更新流程重装。使用本地源码市场时，先确保已重新构建和打包，再执行：

```bash
codex plugin remove visualfiles@visualfiles-local
codex plugin add visualfiles@visualfiles-local
```

随后用 **⌘Q 完全退出客户端**，重新打开并使用新聊天，使客户端重新读取新版入口声明。无需手工删除 Codex 的配置文件或数据库。

### 从旧本地安装迁移

若之前用 `codex plugin marketplace add /本机路径/VisualFiles` 安装过，先移除旧安装与市场，再使用 GitHub 源：

```bash
codex plugin remove visualfiles@visualfiles-local
codex plugin marketplace remove visualfiles-local
codex plugin marketplace add dongbanban/CodexVisualFiles
codex plugin add visualfiles@visualfiles-local
```

如果命令仍选中源码目录内的同名市场，离开 VisualFiles 源码目录后重试。随后重启客户端。

## 卸载

```bash
codex plugin remove visualfiles@visualfiles-local
codex plugin marketplace remove visualfiles-local
```

这些命令移除插件和市场来源，不删除你的项目文件。

## 源码安装与自定义路径

适合修改代码，或需要指定非标准工具路径的用户。与 GitHub 安装二选一；切换前按迁移说明移除同名旧市场。

```bash
git clone https://github.com/dongbanban/CodexVisualFiles.git
cd CodexVisualFiles
npm ci
npm run check
npm run build
npm run package
```

默认发布配置使用 `/bin/sh` 运行 `scripts/start.sh`：Node 按 PATH、Homebrew、默认 nvm 位置查找；Codex 优先使用受支持的客户端内置程序，随后使用 PATH；rg 优先使用 PATH，找不到时尝试客户端内置程序。

通常无需修改配置。工具安装在其他位置时，在**打包后、安装前**编辑 `release/.mcp.json`，按需加入以下环境变量，值替换为本机实际绝对路径：

```json
{
  "mcpServers": {
    "visualfiles": {
      "command": "/bin/sh",
      "args": ["scripts/start.sh"],
      "cwd": ".",
      "env": {
        "VISUALFILES_NODE": "/absolute/path/to/node",
        "VISUALFILES_CODEX": "/absolute/path/to/codex",
        "VISUALFILES_RG": "/absolute/path/to/rg"
      }
    }
  }
}
```

`VISUALFILES_NODE` 必须指向 Node.js 22+；配置了无效的自定义路径时，应修正或删除该配置。只需填写需要覆盖的变量。`args` 和 `cwd` 相对插件目录，通常保持示例值，不依赖 `${PLUGIN_ROOT}` 展开。

根目录 `.mcp.json` 保留本机开发配置，打包时不会复制它。每次 `npm run package` 都会重新生成 `release/.mcp.json`；自定义路径仅作本机配置，不要提交到分发仓库。

最后，在源码根目录执行：

```bash
codex plugin marketplace add "$PWD"
codex plugin add visualfiles@visualfiles-local
```

重启客户端后使用。修改代码后的本地更新流程是重新构建、打包，再重装插件；保持本地市场时跳过 Git 市场的 `upgrade` 步骤。

## 常见问题

| 问题                                              | 处理方式                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `codex: command not found` 或没有 `plugin` 子命令 | 安装或更新 Codex CLI，重新打开终端并检查 `codex plugin --help`。                                                       |
| 提示缺少 Node.js                                  | 安装 Node.js 22+ 后重启客户端；特殊安装位置使用源码安装并配置 `VISUALFILES_NODE`。                                     |
| 项目列表为空或读取失败                            | 先在 Codex 创建项目并关联本机目录；更新客户端后刷新重试。项目列表使用实验性 `project/list`，客户端版本需要兼容该接口。 |
| 提示“工作目录绑定已失效”                         | 更新插件后重新选择一次项目；新版绑定可跨服务进程恢复。若仍失败，确认项目仍在 Codex 登记且原目录存在。                 |
| 搜索提示缺少 ripgrep                              | 安装 `rg` 并加入 PATH，或通过源码安装配置 `VISUALFILES_RG`；重新加载插件。                                             |
| 聊天无法打开面板、仍显示旧界面或旧错误            | 检查市场来源和安装版本，按更新流程重装，重启客户端并开启新聊天。                                                       |
| 左侧「…」仍显示 VisualFiles                       | 按“清除旧的全局入口”重装 0.7.4 或更新版本，完全退出并重启客户端。                                                      |
| 能查看文件，但添加引用不可用                      | 该能力需要客户端支持消息草稿接口；更新客户端后重试。                                                                   |

## 维护说明

`release/` 是供 GitHub marketplace 直接安装的生成产物，随源码一起提交。维护者修改运行代码、启动脚本或包内文档后，应运行检查、构建和打包，并一并提交更新后的 `release/`。仓库不保留测试文件；行为验收使用临时隔离环境，完成后清理。发布版本需同步 `package.json`、锁文件、插件清单和 `src/shared.ts`。

代码规范见 [AGENTS.md](AGENTS.md)，详细行为约定见 [PLAN.md](PLAN.md)，产品、交互与官方目录发布评审见 [REVIEW.md](docs/REVIEW.md)。
