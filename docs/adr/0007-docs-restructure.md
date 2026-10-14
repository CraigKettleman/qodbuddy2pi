# 文档结构：README 总览，docs/ 按主题

旧结构把文档散在两处：`workbuddy2pi/README.md`（232 行）与 `qoder2pi/README.md`（85 行），
根 `README.md` 186 行做总览。子目录里的两份文档承载了大量独有细节——WorkBuddy 的
「国际版能用哪些模型」「凭证有效期怎么读」「已知坑」、Qoder 的 PAT 获取与「登录未生效怎么办」——
这些细节在第一次重排时最容易丢。

因此决定：`README.md` 只留总览与快速开始，采用 token-monitor 那种写法（居中标题 + 斜体一句话 +
badges；provider 差异用表格；平台差异与服务机制收进 `<details>`；`- **粗体标签** — 说明` 的短列表）。
细节拆进主题文档：`docs/install.md`、`docs/operations.md`、`docs/accounts.md`、
`docs/troubleshooting.md`。`workbuddy2pi/` 与 `qoder2pi/` 两个目录删除。

## Consequences

- 主题划分意味着现有内容要被重新编排，而不是照搬位置。搬迁时的参照是「两种组织方式的对照」
  那一节，按它逐条确认没有遗漏。
- `docs/adr/` 与本主题文档并列在 `docs/` 下：前者记录决策，后者面向使用者。
- README 里每处深水区都就地链接（「遇到 X 看 [排错](docs/troubleshooting.md)」），不留一串裸文件名。

## 两种组织方式的对照

搬迁时按这张表核对，右列是内容的去处。

| 现有内容 | 去处 |
|---|---|
| 原理（反代如何用 uv 拉起、端口与端点） | README 的「工作原理」段 + `docs/operations.md` |
| 一键安装、脚本运行 | `docs/install.md` |
| 交互界面（页签、按键） | `docs/operations.md` |
| 国际版差异、国际版能用哪些模型 | `docs/operations.md`（模型集合进 README 的 provider 表格） |
| 日常使用（start/stop/logs/doctor） | `docs/operations.md` |
| 多账号、增删账号、凭证有效期怎么读 | `docs/accounts.md` |
| 已知坑、常见问题、登录未生效怎么办 | `docs/troubleshooting.md` |
| Qoder 获取 PAT、脚本会做什么、启动使用 | `docs/install.md` 与 `docs/operations.md` |
| provider 对照（四个 provider 的模型集合与登录方式） | README 表格 |
| macOS / Windows 的服务机制差异 | README 的 `<details>` |
