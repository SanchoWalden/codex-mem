# codex-mem

English | [中文](#中文说明)

`codex-mem` is a standalone MCP server that gives Codex durable memory across sessions.

It exposes three MCP tools: `remember`, `recall`, and `compact_session`.

This project is for users running Codex with MCP support.

## Install

Recommended: install the MCP server with `npx`.

```bash
npx @sanchowalden/codex-mem install
```

Preview the changes first:

```bash
npx @sanchowalden/codex-mem install --dry-run
```

The installer will:

- copy the runtime files into your local Codex directory
- write or update the `codexMem` entry in `config.toml`
- point Codex to the installed local worker path

Default install target:

- Windows: `%USERPROFILE%\\.codex\\mcp-servers\\codex-mem`
- macOS/Linux: `$HOME/.codex/mcp-servers/codex-mem`

Verify the installation:

```powershell
codex mcp get codexMem
```

## skills.sh

This is optional. The command below installs the skill workflow only; it is not required for the MCP server itself.

If you also want the optional skill from this repo:

```bash
npx skills add https://github.com/SanchoWalden/codex-mem --skill codex-mem
```

## Requirements

- Node.js 18+
- Python 3
- SQLite support in the Python standard library

## Storage

By default, memories are stored at:

- `%USERPROFILE%\\.codex\\memories\\memory.db`

Data stays local by default.

You can override the base path with `CODEX_HOME`.

## License

Apache-2.0. See [LICENSE](./LICENSE).

---

## 中文说明

`codex-mem` 是一个独立的 MCP Server，用来给 Codex 提供跨会话的持久记忆能力。

它提供 3 个 MCP 工具：`remember`、`recall`、`compact_session`。

这个项目面向启用了 MCP 能力的 Codex 用户。

## 安装

推荐直接用 `npx` 安装：

```bash
npx @sanchowalden/codex-mem install
```

如果想先预览改动：

```bash
npx @sanchowalden/codex-mem install --dry-run
```

安装器会自动：

- 把运行文件复制到本地 Codex 目录
- 写入或更新 `config.toml` 里的 `codexMem` 配置
- 让 Codex 指向安装后的本地 `worker.js`

默认安装目录：

- Windows：`%USERPROFILE%\\.codex\\mcp-servers\\codex-mem`
- macOS/Linux：`$HOME/.codex/mcp-servers/codex-mem`

安装后可执行：

```powershell
codex mcp get codexMem
```

## skills.sh

这是可选步骤。下面的命令只安装 skill 工作流，不是 MCP Server 的必需安装步骤。

如果你也想安装这个仓库里的可选 skill：

```bash
npx skills add https://github.com/SanchoWalden/codex-mem --skill codex-mem
```

## 运行要求

- Node.js 18+
- Python 3
- Python 标准库中可用的 SQLite 支持

## 数据存储

默认数据库位置：

- `%USERPROFILE%\\.codex\\memories\\memory.db`

数据默认保存在本地，不上传云端。

也可以通过 `CODEX_HOME` 覆盖根目录。

## 许可证

当前仓库使用 `Apache-2.0`，见 [LICENSE](./LICENSE)。
