# WeChat Codex Bridge

通过个人微信远程使用 OpenAI Codex CLI 的本地桥接工具。仓库名称沿用 `wechat-claude-code`，当前代码已切换为 Codex 实现。

## 功能

- 微信扫码绑定个人账号
- 在微信中持续使用 Codex 任务
- 支持文字、图片和本地文件发送
- 支持切换工作目录、模型和持久提示词
- 后台服务的启动、停止、状态与日志管理
- 自动发现 Codex skills 和已安装插件

## 环境要求

- Node.js 18 或更高版本
- 已完成 Codex 登录

项目依赖中已包含官方 `@openai/codex` CLI。

## 安装

```bash
git clone https://github.com/Agony888/wechat-claude-code.git
cd wechat-claude-code
npm install
npm run setup
npm run daemon -- start
```

Windows PowerShell 如果执行策略阻止 `npm.ps1`，请使用 `npm.cmd`。

## 服务管理

```bash
npm run daemon -- status
npm run daemon -- logs
npm run daemon -- restart
npm run daemon -- stop
```

## 微信命令

- `/help`：查看帮助
- `/status`：查看工作目录、模型、任务 ID 和状态
- `/clear`：清除当前 Codex 任务和本地会话
- `/stop`：取消当前运行和排队消息
- `/cwd <path>`：切换工作目录
- `/model <model>`：切换模型
- `/prompt <text>`：设置持久提示词
- `/skills [full]`：列出可用 skills
- `/<skill-name> <request>`：调用 skill
- `/send <path>`：向微信发送本地文件
- `/compact`：保留本地记录并开启新 Codex 任务

## 数据与安全

账号凭据、会话、日志和二维码默认保存在 `~/.wechat-codex`，不应提交到 Git。仓库不会读取或上传 `~/.codex/auth.json` 的内容。

## 开发

```bash
npm run build
npm test
```

## License

MIT
