/**
 * workbuddy — 把本机 WorkBuddy/CodeBuddy 反代注册成 pi 的 provider。
 *
 * 注册两个 provider，对应两个互相独立的反代实例：
 *   workbuddy         国内版，http://127.0.0.1:8787/v1
 *   workbuddy-global  国际版，http://127.0.0.1:8788/v1
 *
 * 与 pi-provider-qoder 的做法一致：provider 由扩展在启动时注册，模型目录尽量贴近
 * 账号的真实目录，认证不写死在扩展里（走 pi 的 /login 或 ~/.pi/agent/auth.json）。
 * 两个反代都不校验客户端传来的 key，所以 auth.json 里的 key 只需是个占位值。
 *
 * 模型来源（两个 provider 同一机制，各读各的目录，多份时取 mtime 最新）：
 *   国内版  ~/.workbuddy/cache/acc-product-config-v*.json（WorkBuddy 桌面端落盘）
 *   国际版  ~/.workbuddy-ai/cache/acc-product-config-v*.json（国际版客户端 WorkBuddy AI 落盘）
 *   读不到时回退到各自的内置静态表。
 *
 * 不要用反代自带的 models_config.domestic/global.json 当模型目录：那是包作者按
 * 公开资料猜的，与服务端真实可服务的 id 对不上——国际版那张表里的 claude-4.0、
 * gpt-5、gemini-2.5-pro 在客户端目录里根本不存在，请求一律返回
 * `{"code":11102,"msg":"model [xxx] service info not found"}`。
 * 以客户端落盘的目录为准，2026-10-12 实测 27 个对话模型里 26 个可用。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "workbuddy";
const BASE_URL = "http://127.0.0.1:8787/v1";
const GLOBAL_PROVIDER_ID = "workbuddy-global";
const GLOBAL_BASE_URL = "http://127.0.0.1:8788/v1";

/** 国内版模型目录的落盘位置：缓存根目录与它的历史快照子目录。 */
const CATALOG_DIRS = [
  path.join(os.homedir(), ".workbuddy", "cache"),
  path.join(os.homedir(), ".workbuddy", "cache", "conversation-product-spill"),
];

/** 国际版模型目录的落盘位置（国际版客户端 WorkBuddy AI 的数据目录）。 */
const GLOBAL_CATALOG_DIRS = [path.join(os.homedir(), ".workbuddy-ai", "cache")];

/**
 * 国内版目录里有、但上游当前无法服务的 id：请求会返回
 * `{"code":11102,"msg":"model [xxx] service info not found"}`。
 * 这份名单是 2026-09-10 逐个实测得到的；上游哪天补齐了 service info，
 * 把对应 id 从这里删掉即可恢复。
 */
const UNSERVABLE_MODEL_IDS = new Set([
  "completion-gf",
  "deepseek-v3-1",
  "deepseek-v3-1-volc",
  "default-1.1", // Claude-3.7-Sonnet
  "default-1.2", // Claude-4.0-Sonnet
  "glm-4.6",
  "glm-4.6v",
  "hy4-preview-x",
  "kimi-k2-instruct-taiji",
  "kimi-k2-thinking",
  "minimax-m2.5",
]);

/** 国际版实测无法服务的 id（2026-10-12）。 */
const GLOBAL_UNSERVABLE_MODEL_IDS = new Set(["deep-model"]);

/** 账号目录读不到时的兜底列表，字段与账号目录一一对应。 */
type ModelSeed = [
  id: string,
  name: string,
  contextWindow: number,
  maxTokens: number,
  images: 0 | 1,
  reasoning: 0 | 1,
];

const STATIC_MODELS: ModelSeed[] = [
  ["fast-model", "快速", 300000, 48000, 1, 1],
  ["balanced-model", "均衡", 300000, 48000, 1, 1],
  ["deep-model", "极致", 300000, 48000, 1, 1],
  ["hy3", "Hy3", 192000, 64000, 1, 1],
  ["hy3-x", "Hy3", 192000, 64000, 1, 1],
  ["hy4-preview", "Hy4 preview", 1000000, 64000, 1, 1],
  ["hy4-preview-dev", "Hy4 preview", 1000000, 64000, 1, 1],
  ["glm-5v-turbo", "GLM-5v-Turbo", 200000, 64000, 1, 1],
  ["glm-5.3", "GLM-5.3", 1000000, 48000, 1, 1],
  ["glm-5.3-flash", "GLM-5.3-Flash", 1000000, 32000, 1, 1],
  ["glm-5.2", "GLM-5.2", 1000000, 48000, 1, 1],
  ["glm-5.1", "GLM-5.1", 200000, 48000, 1, 1],
  ["glm-5.0-turbo", "GLM-5.0-Turbo", 200000, 48000, 1, 1],
  ["kimi-k3-1", "Kimi-K3", 1000000, 32000, 1, 1],
  ["kimi-k2.7", "Kimi-K2.7-Code", 256000, 32000, 1, 1],
  ["kimi-k2.6", "Kimi-K2.6", 256000, 32000, 1, 1],
  ["kimi-k2.5", "Kimi-K2.5", 256000, 32000, 1, 1],
  ["minimax-m3", "MiniMax-M3", 512000, 128000, 1, 1],
  ["minimax-m2.7", "MiniMax-M2.7", 200000, 48000, 1, 1],
  ["deepseek-v4-flash", "Deepseek-V4-Flash", 1000000, 50000, 1, 1],
  ["deepseek-v4.1-flash", "Deepseek-V4.1-Flash", 1000000, 128000, 1, 1],
  ["deepseek-v4-pro", "Deepseek-V4-Pro", 1000000, 50000, 1, 1],
  ["deepseek-v3-2-volc", "DeepSeek-V3.2", 96000, 32000, 1, 1],
  ["deepseek-v3-1-lkeap", "DeepSeek-V3-1", 96000, 32000, 1, 0],
  ["deepseek-v3-0324-lkeap", "DeepSeek-V3-0324", 112000, 16000, 1, 0],
  ["deepseek-r1-0528-lkeap", "DeepSeek-R1-0528", 96000, 16000, 1, 0],
  ["hunyuan-2.0-instruct", "Hunyuan-2.0-Instruct", 128000, 16000, 1, 1],
  ["hunyuan-chat", "Hunyuan-Turbos", 128000, 8192, 1, 0],
];

/**
 * 国际版兜底表：与国际版客户端目录里的字段一致，全部为 2026-10-12 实测可用
 * （当时用 `max_tokens: 512` 逐个验证；注意这些模型多数要求较大的 max_tokens，
 * 太小的值会被上游以 `integer_below_min_value` 拒绝）。
 */
const GLOBAL_STATIC_MODELS: ModelSeed[] = [
  ["default-model", "Auto", 176000, 24000, 1, 1],
  ["fast-model", "Fast", 200000, 32000, 1, 1],
  ["balanced-model", "Balanced", 256000, 32000, 1, 1],
  ["primary-model", "Primary", 272000, 72000, 1, 1],
  ["deepseek-v4.1-flash", "Deepseek-V4.1-Flash", 1000000, 128000, 1, 1],
  ["deepseek-v4.1-flash-sg", "Deepseek-V4.1-Flash", 1000000, 128000, 1, 1],
  ["hy4-preview", "Hy4 preview", 1000000, 64000, 1, 1],
  ["hy3", "Hy3", 192000, 64000, 1, 1],
  ["kimi-k2.8-preview", "Kimi-K2.8-Preview", 1000000, 32000, 1, 1],
  ["kimi-k3", "Kimi-K3", 1000000, 32000, 1, 1],
  ["kimi-k2.6", "Kimi-K2.6", 256000, 32000, 1, 1],
  ["gemini-3.5-flash", "Gemini-3.5-Flash", 1000000, 65536, 1, 1],
  ["glm-5.3", "GLM-5.3", 1000000, 48000, 1, 1],
  ["glm-5.3-flash", "GLM-5.3-Flash", 1000000, 32000, 1, 1],
  ["glm-5.2", "GLM-5.2", 1000000, 48000, 1, 1],
  ["grok-4.7", "Grok-4.7", 500000, 128000, 1, 1],
  ["gpt-6-astra", "GPT-6-Astra", 1000000, 128000, 1, 1],
  ["gpt-6.1-sol", "GPT-6.1-Sol", 1000000, 128000, 1, 1],
  ["gpt-6-sol", "GPT-6-Sol", 1000000, 128000, 1, 1],
  ["gpt-6-luna", "GPT-6-Luna", 1000000, 128000, 1, 1],
  ["gpt-5.6-sol", "GPT-5.6-Sol", 1000000, 128000, 1, 1],
  ["gpt-5.6-terra", "GPT-5.6-Terra", 1000000, 128000, 1, 1],
  ["gpt-5.6-luna", "GPT-5.6-Luna", 1000000, 128000, 1, 1],
  ["gpt-5.5", "GPT-5.5", 1000000, 128000, 1, 1],
  ["gpt-5.4", "GPT-5.4", 272000, 72000, 1, 1],
  ["step-5-preview", "Step-5-Preview", 1000000, 64000, 1, 1],
];

/**
 * 代理是 OpenAI 兼容端点，不接受 `developer` 角色，也不支持 reasoning_effort：
 * 思考档位由上游模型自身决定，pi 不发送该参数（与改造前 models.json 的行为一致）。
 */
const COMPAT = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
};

interface CatalogModel {
  id: string;
  name?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  supportsImages?: boolean;
  supportsReasoning?: boolean;
  supportsToolCall?: boolean;
}

interface LoadedModels {
  models: ProviderModelConfig[];
  /** 目录来源；`null` 表示走了内置静态表。 */
  sourcePath: string | null;
  /** sourcePath 为 null 时说明回退原因。 */
  fallbackReason: string;
}

/** 一个 provider 的模型目录从哪读、怎么过滤。 */
interface CatalogSource {
  dirs: string[];
  unservable: Set<string>;
  staticModels: ModelSeed[];
  /** 模型名后缀，在 pi 的模型列表里区分两个 provider。 */
  brand: string;
  /** 目录读不到时提示语里用的名字。 */
  label: string;
}

const DOMESTIC_SOURCE: CatalogSource = {
  dirs: CATALOG_DIRS,
  unservable: UNSERVABLE_MODEL_IDS,
  staticModels: STATIC_MODELS,
  brand: "WorkBuddy",
  label: "WorkBuddy",
};

const GLOBAL_SOURCE: CatalogSource = {
  dirs: GLOBAL_CATALOG_DIRS,
  unservable: GLOBAL_UNSERVABLE_MODEL_IDS,
  staticModels: GLOBAL_STATIC_MODELS,
  brand: "WorkBuddy Global",
  label: "WorkBuddy AI（国际版客户端）",
};

function findLatestCatalogFile(dirs: string[]): string | null {
  let latest: { file: string; mtimeMs: number } | null = null;

  for (const dir of dirs) {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue; // 目录不存在属于正常情况（客户端未安装或未登录过）
    }

    for (const name of names) {
      if (!/^acc-product-config-v\d+.*\.json$/.test(name)) continue;

      const file = path.join(dir, name);
      try {
        const { mtimeMs } = fs.statSync(file);
        if (!latest || mtimeMs > latest.mtimeMs) latest = { file, mtimeMs };
      } catch {
        continue; // 文件在扫描期间被替换，跳过即可
      }
    }
  }

  return latest?.file ?? null;
}

function isCatalogModel(value: unknown): value is CatalogModel {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

/** 目录里的条目 → 统一种子格式；只保留能对话（支持 tool call）且上游可服务的模型。 */
function seedFromCatalog(entry: CatalogModel): ModelSeed {
  return [
    entry.id,
    entry.name?.trim() || entry.id,
    entry.maxInputTokens ?? 128000,
    entry.maxOutputTokens ?? 16384,
    entry.supportsImages ? 1 : 0,
    entry.supportsReasoning ? 1 : 0,
  ];
}

function toModelConfig(seed: ModelSeed, brand: string): ProviderModelConfig {
  const [id, name, contextWindow, maxTokens, images, reasoning] = seed;
  return {
    id,
    name: `${name} (${brand})`,
    reasoning: reasoning === 1,
    input: images === 1 ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
    compat: COMPAT,
  };
}

function fromStaticTable(source: CatalogSource, reason: string): LoadedModels {
  return {
    models: source.staticModels.map((seed) => toModelConfig(seed, source.brand)),
    sourcePath: null,
    fallbackReason: reason,
  };
}

function loadModels(source: CatalogSource): LoadedModels {
  const file = findLatestCatalogFile(source.dirs);
  if (!file) return fromStaticTable(source, `未找到 ${source.label} 的模型目录`);

  let parsed: { models?: unknown };
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { models?: unknown };
  } catch (error) {
    return fromStaticTable(source, `读取 ${file} 失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const entries = Array.isArray(parsed.models) ? parsed.models.filter(isCatalogModel) : [];
  const seeds = entries
    .filter((entry) => entry.supportsToolCall === true && !source.unservable.has(entry.id))
    .map(seedFromCatalog);

  if (seeds.length === 0) {
    return fromStaticTable(source, `${file} 里没有可用的对话模型`);
  }

  return {
    models: seeds.map((seed) => toModelConfig(seed, source.brand)),
    sourcePath: file,
    fallbackReason: "",
  };
}

const PROVIDERS = [
  {
    providerId: PROVIDER_ID,
    name: "WorkBuddy",
    baseUrl: BASE_URL,
    source: DOMESTIC_SOURCE,
  },
  {
    providerId: GLOBAL_PROVIDER_ID,
    name: "WorkBuddy Global",
    baseUrl: GLOBAL_BASE_URL,
    source: GLOBAL_SOURCE,
  },
];

export default function workbuddy(pi: ExtensionAPI) {
  const loaded = new Map<string, LoadedModels>();

  for (const { providerId, name, baseUrl, source } of PROVIDERS) {
    const initial = loadModels(source);
    loaded.set(providerId, initial);
    pi.registerProvider(providerId, {
      name,
      baseUrl,
      api: "openai-completions",
      models: initial.models,
      async refreshModels() {
        const fresh = loadModels(source);
        loaded.set(providerId, fresh);
        return fresh.models;
      },
    });
  }

  // 回退到内置静态表是"降级"而不是正常路径，启动时说清楚，避免模型悄悄变少。
  pi.on("session_start", (_event, ctx) => {
    for (const [providerId, m] of loaded) {
      if (m.sourcePath) continue;
      ctx.ui.notify(
        `${providerId} 未读到模型目录，已使用内置列表（${m.fallbackReason}），共 ${m.models.length} 个模型`,
        "warn",
      );
    }
  });
}
