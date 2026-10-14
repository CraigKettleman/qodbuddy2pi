# 账号与凭证

只有 WorkBuddy 有「账号」这个概念——它在本机起反代，需要一份凭证代表你。Qoder 的凭证
直接落在 pi 的 `auth.json`，没有账号切换这回事。

## 凭证放在哪

| | Qoder | WorkBuddy 国内版 | WorkBuddy 国际版 |
|---|---|---|---|
| 位置 | `~/.pi/agent/auth.json` 的 `qoder-cn` / `qoder` 项 | `~/.codebuddy-session.json` | `~/.codebuddy-global-session.json` |
| 形态 | pi 的 provider 凭据 | 明文 JWT | 加密对象 |
| 添加账号方式 | 浏览器登录 | 浏览器登录 |
| 谁负责刷新 | pi 扩展 | 反代 | 反代 |

## 增删账号

```bash
workbuddy2pi account add            # 浏览器登录建档
workbuddy2pi global account add     # 国际版：浏览器登录
workbuddy2pi account remove b       # 删除账号 b
```

`account add` 两个区域都走浏览器登录。同一账号重复添加会更新它已有的 slot，不会新建
一个重复项。

`account remove` 不真删文件，而是改名成 `<key>-removed-<日期>.json` 留档（不在账号列表里
显示），删错了改回名字即可恢复；确认不需要再自己删掉。当前生效的账号不能直接删，
先 `account <其他key>` 切走再删。

## 凭证有效期怎么读

账号后面那句「剩 N 天（至 某日某分）」说的是 **access_token** 的有效期，不是登录时间：

- 国际版签发的 token 有效期正好是 365 天，所以到期时间看起来像「登录时间加一年」——
  那是服务端就这么签的，不是把登录时间标成了到期；
- access_token 到期前反代会自动用 refresh_token 续期（每次请求前检查，剩 60 秒内就刷），
  所以「剩 N 天」归零不代表账号失效；真正需要重新登录的时刻是 refresh_token 也到期的时候，
  纯文本 `status` 里两项都列了出来；
- 国内版两项相差几天，国际版两项相同。

这个「剩 N 天」能不能算准，取决于 session 里有没有绝对的 `expiresAt`：反代只认它，缺了
就会把凭证当成永不过期、从此不再刷新。所以不管是导入还是浏览器登录，写盘前都会补算。
详见 [排错](troubleshooting.md)。

## 国际版能用哪些模型

**不要用反代自带的国际版模型表。** 它的 `models_config.global.json` 列了
Claude-3.7/4.0、GPT-5、o4-mini、Gemini-2.5，但这些 id 在服务端根本不存在，请求一律返回
`{"code":11102,"msg":"model [x] service info not found"}`。这不是账号权限问题——是那张表
本身就不对。

真实清单在国际版客户端自己落盘的产品配置里：
`~/.workbuddy-ai/cache/acc-product-config-v3.json`（与国内版 `~/.workbuddy/cache/`
同一机制）。`workbuddy.ts` 直接读它，客户端里有什么模型，pi 里就有什么，客户端更新模型
也不需要改代码。

两个实测结论：

- 27 个对话模型里 26 个可用（含 `grok-4.7`、GPT-5.4/5.5/5.6/6.x、`gemini-3.5-flash`），
  只有 `deep-model` 返回 11102，已放进 `GLOBAL_UNSERVABLE_MODEL_IDS` 排除；
- 多数模型对 `max_tokens` 有下限，太小的值会被上游以 `integer_below_min_value` 拒绝。
  pi 按模型配置发送正常大小，日常使用不受影响；手工 curl 测试时别用 8 这种极小值。

工具调用在 GPT 与 Grok 上都实测正常。
