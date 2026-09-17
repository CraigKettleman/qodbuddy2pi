/**
 * workbuddy — 把本机 WorkBuddy/CodeBuddy 反代注册成 pi 的 provider。
 *
 * 与 pi-provider-qoder 的做法一致：provider 由扩展在启动时注册，模型目录尽量贴近
 * 账号的真实目录，认证不写死在扩展里（走 pi 的 /login 或 ~/.pi/agent/auth.json）。
 *
 * 模型来源，按优先级：
 *   1. WorkBuddy 桌面端落盘的账号模型目录
 *      ~/.workbuddy/cache 及其子目录下的 acc-product-config-v*.json（多份时取 mtime 最新）
 *   2. 上面读不到时，回退到本文件内置的静态表 STATIC_MODELS
 *
 * 代理地址 http://127.0.0.1:8787/v1 由本仓库 workbuddy2pi/install-workbuddy2pi.sh 注册的常驻
 * 服务提供，它自己持有上游登录态，不校验客户端传来的 key，所以 auth.json 里的 key 只需是个占位值。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "workbuddy";
const BASE_URL = "http://127.0.0.1:8787/v1";

/** 模型目录可能的落盘位置：缓存根目录与它的历史快照子目录。 */
const CATALOG_DIRS = [
  path.join(os.homedir(), ".workbuddy", "cache"),
  path.join(os.homedir(), ".workbuddy", "cache", "conversation-product-spill"),
];

/**
 * 账号目录里有、但上游当前无法服务的 id：请求会返回
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

function findLatestCatalogFile(): string | null {
  let latest: { file: string; mtimeMs: number } | null = null;

  for (const dir of CATALOG_DIRS) {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue; // 目录不存在属于正常情况（WorkBuddy 未安装或未登录过）
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

function toModelConfig(seed: ModelSeed): ProviderModelConfig {
  const [id, name, contextWindow, maxTokens, images, reasoning] = seed;
  return {
    id,
    name: `${name} (WorkBuddy)`,
    reasoning: reasoning === 1,
    input: images === 1 ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
    compat: COMPAT,
  };
}

function fromStaticTable(reason: string): LoadedModels {
  return {
    models: STATIC_MODELS.map(toModelConfig),
    sourcePath: null,
    fallbackReason: reason,
  };
}

function loadModels(): LoadedModels {
  const file = findLatestCatalogFile();
  if (!file) return fromStaticTable("未找到 WorkBuddy 账号模型目录");

  let parsed: { models?: unknown };
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { models?: unknown };
  } catch (error) {
    return fromStaticTable(`读取 ${file} 失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const entries = Array.isArray(parsed.models) ? parsed.models.filter(isCatalogModel) : [];
  const seeds = entries
    .filter((entry) => entry.supportsToolCall === true && !UNSERVABLE_MODEL_IDS.has(entry.id))
    .map(seedFromCatalog);

  if (seeds.length === 0) {
    return fromStaticTable(`${file} 里没有可用的对话模型`);
  }

  return { models: seeds.map(toModelConfig), sourcePath: file, fallbackReason: "" };
}

export default function workbuddy(pi: ExtensionAPI) {
  const initial = loadModels();
  let lastLoaded = initial;

  pi.registerProvider(PROVIDER_ID, {
    name: "WorkBuddy",
    baseUrl: BASE_URL,
    api: "openai-completions",
    models: initial.models,
    async refreshModels() {
      lastLoaded = loadModels();
      return lastLoaded.models;
    },
  });

  // 回退到内置静态表是"降级"而不是正常路径，启动时说清楚，避免模型悄悄变少。
  pi.on("session_start", (_event, ctx) => {
    if (lastLoaded.sourcePath) return;
    ctx.ui.notify(
      `workbuddy 未读到账号模型目录，已使用内置列表（${lastLoaded.fallbackReason}），共 ${lastLoaded.models.length} 个模型`,
      "warn",
    );
  });
}
