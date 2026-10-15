<p align="right">
   <a href="./README.md">简</a> | <strong>EN</strong>
</p>

<div align="center">

# QodBuddy2Pi

</div>

<p align="center">
    <em>Bring your Qoder and WorkBuddy subscriptions into pi coding agent.</em>
</p>

<p align="center">
    <a href="https://github.com/CraigKettleman/qoder2pi/releases"><img src="https://img.shields.io/github/v/release/CraigKettleman/qoder2pi?style=flat-square&label=release&color=22c55e" alt="Latest release" /></a>
    <a href="https://www.npmjs.com/package/qodbuddy2pi"><img src="https://img.shields.io/npm/v/qodbuddy2pi?style=flat-square&label=npm&color=cb3837" alt="npm" /></a>
    <a href="https://github.com/CraigKettleman/qoder2pi/releases"><img src="https://img.shields.io/github/downloads/CraigKettleman/qoder2pi/total?style=flat-square&color=22c55e" alt="Total downloads" /></a>
    <img src="https://img.shields.io/badge/Windows-10%2B-0078D4?style=flat-square&logo=windows&logoColor=white" alt="Windows 10 or later" />
    <img src="https://img.shields.io/badge/macOS-12%2B-0A84FF?style=flat-square&logo=apple&logoColor=white" alt="macOS 12 or later" />
    <img src="https://img.shields.io/badge/Linux-x64-64748b?style=flat-square&logo=linux&logoColor=white" alt="Linux x64" />
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-A855F7?style=flat-square" alt="License: MIT" /></a>
</p>

<p align="center">
    <code>curl -fsSL https://raw.githubusercontent.com/CraigKettleman/qoder2pi/main/install.sh | sh</code>
</p>

<p align="center">
    <img src=".github/assets/console-qoder.png" alt="The qodbuddy2pi console" width="820" />
</p>

<p align="center">
    <sub>The console: banner on top, tab row, status and sections on the left, actions on the right, status bar at the bottom</sub>
</p>

## What is Qodbuddy2pi?

One command turns your Qoder and WorkBuddy subscriptions into pi providers. Afterwards
`qodbuddy2pi` is a single console with a page per provider.

## Supported providers

The four providers are independent; install only the ones you want:

|                  | provider           | endpoint           | credential                          | login   |
| ---------------- | ------------------ | ------------------ | ----------------------------------- | ------- |
| Qoder CN         | `qoder-cn`         | Qoder gateway      | pi's `auth.json`                    | PAT     |
| Qoder Global     | `qoder`            | Qoder gateway      | pi's `auth.json`                    | PAT     |
| WorkBuddy CN     | `workbuddy`        | `127.0.0.1:8787`   | `~/.codebuddy-session.json`         | browser |
| WorkBuddy Global | `workbuddy-global` | `127.0.0.1:8788`   | `~/.codebuddy-global-session.json`  | browser |

Once installed, pick a model in pi with `/model`, or name the provider outright:

```bash
pi --provider qoder-cn        --model Qwen3.7-Plus
pi --provider qoder           --model <model ID>
pi --provider workbuddy       --model deepseek-v4.1-flash
pi --provider workbuddy-global --model <model ID>
```

## Why choose us?

Qoder and WorkBuddy hand out daily free credits to free accounts, but only inside their
own clients — and those clients ship a fixed system prompt you cannot change, which
burns extra credits and drags the model down.

Putting that quota into pi means assembling the provider config, writing a start
command, and watching for token expiry yourself. When a token silently expires every
request 401s while the service still looks fine, and debugging that costs more than the
forwarding did.

This project finishes the job:

- one script that installs every dependency
- a compact TUI with status, accounts, login state and logs on one screen
- log in once, credentials refresh themselves long-term
- switch accounts with one command

## Installation

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/CraigKettleman/qoder2pi/main/install.sh | sh
```

**Windows**

```powershell
irm https://raw.githubusercontent.com/CraigKettleman/qoder2pi/main/install.ps1 | iex
```

**npm / pnpm / bun**

```bash
npm i -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
pnpm add -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
bun add -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
# or npx --yes qodbuddy2pi install
```

`--ignore-scripts` is deliberate: installing the package should never modify your pi
setup behind your back. Wiring up providers is the explicit `qodbuddy2pi install`, so
you see what it does.

**Release archive**

Grab `qodbuddy2pi.tar.gz` (Unix) or `qodbuddy2pi.zip` (Windows, unzips with the built-in
tool) from [Releases](https://github.com/CraigKettleman/qoder2pi/releases), then run`./start.sh` (Windows: `start.cmd`).  Each release ships `SHA256SUMS` if you want to verify it:

```bash
shasum -a 256 -c SHA256SUMS        # macOS / Linux
Get-FileHash qodbuddy2pi.zip       # Windows (compare against the file)
```

**From source**

```bash
git clone https://github.com/CraigKettleman/qoder2pi && cd qoder2pi
./install.sh                     # macOS / Linux
powershell -ExecutionPolicy Bypass -File install.ps1   # Windows
```

With no arguments it probes the machine (which region is logged in, which proxy is
running), lists what it found and asks you to confirm each item; Enter accepts the
default. Every entry point takes the same flags:

```bash
--all                 # install all four providers
--only qoder-cn       # install only these (comma-separated, or repeat --only)
--no-service          # wire up only, don't register the background service
--force-reinstall     # reinstall even if already wired up
--non-interactive     # no prompts, follow the probe results
--help
```

On Windows the flags are `-All`, `-Only`, `-NoService`, `-ForceReinstall`,
`-NonInteractive`.



### Login

Qoder needs a PAT, created here:

- CN: https://qoder.com.cn/account/integrations
- Global: https://qoder.com/account/integrations

Hand the `pt-` token to the installer, or run `qoder2pi login cn pt-xxxxxx` later. You
can also run `pi` and type `/login qoder-cn` (CN) or `/login qoder` (Global) to log in
by hand.

WorkBuddy uses browser login, waiting up to 5 minutes. Both regions take the same path:
credentials the desktop client writes to disk are not portable (the Global one is an
encrypted object; imported it 401s on every request) — see
[Troubleshooting](docs/troubleshooting.md).

## Features

### Console

One command opens the full-screen console, one page per provider, switched with number
keys or `←→`/`Tab`:

```
 1 Qoder · 2 WorkBuddy CN · 3 WorkBuddy Global
```

Keys: `↑↓`/`jk` to move, `Enter` to act, `r` to refresh, `q`/`Esc` to quit; the wheel
scrolls the selection or a text page. Logs and self-check output open in their own
scrollable text pages.

### How it works

workbuddy2pi：

```
pi (provider workbuddy,        baseUrl = http://127.0.0.1:8787/v1)
pi (provider workbuddy-global, baseUrl = http://127.0.0.1:8788/v1)
  ↓
two independent codebuddy_proxy instances (from the workbuddy2api PyPI package)
  ↓  protocol translation + automatic token refresh
copilot.tencent.com (CN) / www.workbuddy.ai (Global)
```

Qoder2pi： the `pi-provider-qoder` extension talks to the Qoder gateway
directly and its credential lands in pi's own `auth.json`. The two products are therefore
asymmetric — Qoder's page manages login state for two regions, while WorkBuddy brings
ports, a background service and multiple accounts.

The endpoint must be spelled `www.workbuddy.ai` explicitly: proxy 2.0.6 defaults the
Global endpoint to `www.codebuddy.ai`, while the account's own domain and login endpoints
live under `workbuddy.ai`. The two regions' session files are isolated by `backend`
metadata, so a CN file used to start a Global instance is rejected outright.

### Service & credentials

- **Background service** — the WorkBuddy proxy is launched by a service that starts at
  boot/login and restarts on crash: launchd on macOS, systemd --user on Linux, a
  scheduled task on Windows
- **Credential validity, read directly** — each account shows the remaining days and
  expiry of its access_token, and plain-text `status` lists both that and the
  refresh_token
- **Idempotent install** — re-running never damages existing credentials, replacing only
  files that differ from the repo version

### Regions & multiple accounts

Qoder's two regions coexist; there is no either/or. WorkBuddy Global is a fully
independent instance — its own port, credential, accounts and logs:

|                   | CN                                              | Global                                                    |
| ----------------- | ----------------------------------------------- | --------------------------------------------------------- |
| In the console    | page 2                                          | page 3                                                    |
| Endpoint          | `http://127.0.0.1:8787/v1`                      | `http://127.0.0.1:8788/v1`                                |
| Upstream          | `copilot.tencent.com`                           | `www.workbuddy.ai`                                        |
| Active credential | `~/.codebuddy-session.json`                     | `~/.codebuddy-global-session.json`                        |
| Account slots     | `~/.workbuddy2api/sessions/`                    | `~/.workbuddy2api/sessions-global/`                       |
| Logs              | `~/.workbuddy2api/`                             | `~/.workbuddy2api/global/`                                |
| Service           | `workbuddy2api`                                 | `workbuddy2api-global`                                    |

**Multiple accounts** exist only in WorkBuddy. Each account is its own session file under
the current region's slot directory. Switching first writes the newest credential from
the active file back into the slot it belongs to, then installs the target slot and
restarts the service — so switching back and forth never loses a token. Ownership comes
from `account.uid` inside the file rather than a marker, so an interrupted switch cannot
cross-write credentials. `account remove` renames the file into an archive instead of
deleting it; rename it back to recover.

Within one region the proxy serves one account at a time (it reads the session into
memory at startup and cannot hot-switch). Running several accounts at once would need
several instances; this repo only splits CN from Global.

### Command line

```bash
qodbuddy2pi              # console: 1/2/3 or Tab to switch provider
qodbuddy2pi --check      # environment check only (plain text, scriptable)
qodbuddy2pi probe        # report which providers are wired up, as JSON
qodbuddy2pi install      # wire up / reinstall providers (runs the packaged installer)
qodbuddy                 # console (first page)
qoder2pi                 # Qoder page
workbuddy2pi             # WorkBuddy CN page
```

`qoder2pi` and `workbuddy2pi` also carry their own subcommands, plain-text for scripting:

```bash
qoder2pi status                 # pi, extension and both regions' login state
qoder2pi login cn pt-xxxxxx     # log in to CN with a PAT
qoder2pi models                 # list the models each region exposes in pi
qoder2pi doctor                 # self-check

workbuddy2pi status             # service, endpoint, credential, accounts
workbuddy2pi account b          # switch to account b
workbuddy2pi account renew      # renew the active account's credential
workbuddy2pi logs 100           # tail the proxy log
workbuddy2pi restart            # restart the service
workbuddy2pi global <command>   # the same, against the Global instance
workbuddy2pi doctor             # self-check
```

The full command list and key bindings live in [Operations](docs/operations.md).

### What gets installed

| Component             | Location                    | Purpose                                                    |
| --------------------- | --------------------------- | ---------------------------------------------------------- |
| `assets/qodbuddy2pi`  | `~/.local/bin/`             | the console                                                |
| `assets/qoder2pi`     | `~/.local/bin/`             | Qoder ops command + the console's Qoder page                |
| `assets/workbuddy2pi` | `~/.local/bin/`             | WorkBuddy ops command + both WorkBuddy pages                |
| `assets/qodbuddy`     | `~/.local/bin/`             | alias                                                      |
| `assets/tui.js`       | `~/.local/bin/`             | the interface itself and shared helpers (all four commands) |
| `assets/workbuddy.ts` | `~/.pi/agent/extensions/`   | registers pi's `workbuddy` / `workbuddy-global` providers   |
| `pi-provider-qoder`   | this repo's `assets/vendor/`| registers pi's `qoder-cn` / `qoder` providers               |
| `workbuddy2api-*.whl` | `~/.workbuddy2api/vendor/`  | the proxy implementation the service loads                  |

Both providers' implementations and the vendored extension copies live inside this repo;
the installer never pulls from another repository (Node, pi, uv and the Python transitive
dependencies are host programs and general-purpose libraries that physically cannot be
vendored). Versions, official checksums, licences and update instructions are in
[assets/vendor/README.md](assets/vendor/README.md).

### Traps handled for you



- **The proxy stops refreshing after its own refresh** — the server returns only a
  relative `expiresIn`, so the proxy drops the absolute `expiresAt` and treats the
  credential as never expiring. Creation and renewal always compute the absolute time,
  and `account renew` writes it back into the slot
- **pi discards providers with no auth method** — each WorkBuddy provider needs a
  placeholder key in `auth.json`; `ensure-auth-key` adds both
- **No account created from desktop credentials** — the Global client writes an
  encrypted object the proxy cannot decrypt, so importing it 401s every request; both
  regions uniformly use browser login
- **The bundled Global model table** — its model ids don't exist server-side, so the code
  reads the client's own on-disk product config instead
- **launchd's `bootout` is asynchronous** — the ops commands wait for the label to
  actually disappear before registering, avoiding
  `Bootstrap failed: 5: Input/output error`

Details in [Troubleshooting](docs/troubleshooting.md).

## Documentation

|                                            |                                                            |
| ------------------------------------------ | ---------------------------------------------------------- |
| [Install & wiring](docs/install.md)        | the full flow, per-platform steps, where to get credentials |
| [Operations](docs/operations.md)           | every command, key bindings, how the regions differ, the service |
| [Accounts & credentials](docs/accounts.md) | how multiple accounts work, reading expiry, Global's usable models |
| [Troubleshooting](docs/troubleshooting.md) | common problems and the traps already avoided               |
| [CONTEXT.md](CONTEXT.md)                   | this project's glossary                                     |
| [docs/adr/](docs/adr/)                     | design decision records                                     |

## Development

```bash
./dev.sh          # dev entry: run the console straight from the repo, no install
npm test          # pure-function tests (node:test, zero dependencies)
```

`./dev.sh` shows your edits to `assets/tui.js` immediately. Tests cover pure functions,
render width, and consistency between the two install scripts; rendering behaviour is
verified in a real PTY by `python3 test/pty-render.py`.

Pushing a `v*` tag triggers `.github/workflows/release.yml`: tests, then the npm publish,
then `make-release.sh --all` to produce the platform-independent archives attached to the
GitHub Release along with `SHA256SUMS`. Archive contents come from `npm pack`, the same
file set published to npm.

Before changing anything, read [CONTEXT.md](CONTEXT.md) (glossary) and
[docs/adr/](docs/adr/) (decisions) — they explain why the code looks the way it does.

## Star History

<a href="https://star-history.com/#CraigKettleman/qoder2pi&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=CraigKettleman/qoder2pi&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=CraigKettleman/qoder2pi&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=CraigKettleman/qoder2pi&type=Date" width="600" />
 </picture>
</a>

## Contributing

Issues and PRs are welcome. Read [CONTEXT.md](CONTEXT.md) and [docs/adr/](docs/adr/)
first, and add a new design decision as `docs/adr/NNNN-<kebab-case-title>.md`.

## License

[MIT](LICENSE). The two third-party artifacts in the repo carry their own licences, listed
at the end of that file.
