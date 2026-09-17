// src/auth/oauth.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname3, join as join3 } from "node:path";
import * as PiCodingAgent from "@earendil-works/pi-coding-agent";

// src/catalog.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";

// src/cosy.ts
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
var qoderRSAPublicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;
var QODER_GATEWAY_COSY_VERSION = "1.1.38";
var QODER_OPENAPI_COSY_VERSION = "1.0.1";
var QODER_CLIENT_TYPE = "5";
var QoderDataPolicy = "disagree";
var QoderLoginVersion = "v2";
var QoderMachineOS = process.platform === "win32" ? process.arch === "arm64" ? "aarch64_windows" : "x86_64_windows" : process.arch === "arm64" ? "aarch64_linux" : "x86_64_linux";
var QoderMachineTypeMagic = "5";
function rsaEncryptBase64(data) {
  const key = {
    key: qoderRSAPublicKey,
    padding: crypto.constants.RSA_PKCS1_PADDING
  };
  const encrypted = crypto.publicEncrypt(key, typeof data === "string" ? Buffer.from(data) : data);
  return encrypted.toString("base64");
}
function aesEncryptCBCBase64(plaintext, keyStr) {
  const cipher = crypto.createCipheriv("aes-128-cbc", Buffer.from(keyStr), Buffer.from(keyStr));
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}
function computeSigPath(urlStr) {
  const parsed = new URL(urlStr);
  let sigPath = parsed.pathname;
  if (sigPath.startsWith("/algo")) {
    sigPath = sigPath.substring("/algo".length);
  }
  return sigPath;
}
function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}
function getMachineId() {
  const home = getHomeDir();
  const paths = [join(home, ".qoder", ".auth", "machine_id"), join(home, ".pi", "agent", "qoder-machine-id")];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const val = readFileSync(p, "utf8").trim();
        if (val) return val;
      } catch {
      }
    }
  }
  const newId = crypto.randomUUID();
  try {
    const savePath = paths[1];
    mkdirSync(dirname(savePath), { recursive: true });
    writeFileSync(savePath, newId, "utf8");
  } catch {
  }
  return newId;
}
function buildAuthHeaders(body, requestURL, creds) {
  if (!creds.userID) {
    throw new Error("cosy: user id is empty");
  }
  if (!creds.authToken) {
    throw new Error("cosy: auth token is empty");
  }
  const aesKey = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const userInfo = {
    uid: creds.userID,
    security_oauth_token: creds.authToken,
    name: creds.name || "",
    aid: "",
    email: creds.email || ""
  };
  const infoB64 = aesEncryptCBCBase64(JSON.stringify(userInfo), aesKey);
  const cosyKey = rsaEncryptBase64(aesKey);
  const timestamp = Math.floor(Date.now() / 1e3).toString();
  const requestId = crypto.randomUUID();
  const cosyPayload = {
    version: "v1",
    requestId,
    info: infoB64,
    cosyVersion: QODER_GATEWAY_COSY_VERSION,
    ideVersion: ""
  };
  const payloadB64 = Buffer.from(JSON.stringify(cosyPayload)).toString("base64");
  const sigPath = computeSigPath(requestURL);
  const bodyBytes = body ? Buffer.isBuffer(body) ? body : Buffer.from(body) : Buffer.alloc(0);
  const sig = crypto.createHash("md5").update(payloadB64).update("\n").update(cosyKey).update("\n").update(timestamp).update("\n").update(bodyBytes).update("\n").update(sigPath).digest("hex");
  const bodyHash = crypto.createHash("md5").update(bodyBytes).digest("hex");
  const bodyLen = bodyBytes.length.toString();
  const machineID = creds.machineID || getMachineId();
  return {
    Authorization: `Bearer COSY.${payloadB64}.${sig}`,
    "Cosy-Key": cosyKey,
    "Cosy-User": creds.userID,
    "Cosy-Date": timestamp,
    "Cosy-Version": QODER_GATEWAY_COSY_VERSION,
    "Cosy-Machineid": machineID,
    "Cosy-Machinetoken": machineID,
    "Cosy-Machinetype": QoderMachineTypeMagic,
    "Cosy-Machineos": QoderMachineOS,
    "Cosy-Clienttype": QODER_CLIENT_TYPE,
    "Cosy-Clientip": "127.0.0.1",
    "Cosy-Bodyhash": bodyHash,
    "Cosy-Bodylength": bodyLen,
    "Cosy-Sigpath": sigPath,
    "Cosy-Data-Policy": QoderDataPolicy,
    "Cosy-Organization-Id": "",
    "Cosy-Organization-Tags": "",
    "Login-Version": QoderLoginVersion,
    "X-Request-Id": crypto.randomUUID()
  };
}

// src/region.ts
var QODER_REGIONS = {
  global: {
    mode: "global",
    providerID: "qoder",
    baseUrl: "https://api3.qoder.sh/",
    openApiUrl: "https://openapi.qoder.sh",
    centerUrl: "https://center.qoder.sh",
    manageUrl: "https://qoder.com",
    patManageUrl: "https://qoder.com/account/integrations",
    deviceLoginUrl: "https://qoder.com/device/selectAccounts",
    modelCacheFile: "qoder-models-cache.json",
    patEnvNames: ["QODER_API_KEY", "QODER_PERSONAL_ACCESS_TOKEN", "QODER_PAT"],
    loginName: "Qoder (Browser OAuth / PAT)",
    userNameFallback: "Qoder User",
    userEmailFallback: "user@qoder.com",
    usageTitle: "Qoder AI Plan",
    supportsBrowserLogin: true
  },
  cn: {
    mode: "cn",
    providerID: "qoder-cn",
    baseUrl: "https://gateway.qoder.com.cn/",
    openApiUrl: "https://openapi.qoder.com.cn",
    centerUrl: "https://gateway.qoder.com.cn",
    manageUrl: "https://qoder.com.cn",
    patManageUrl: "https://qoder.com.cn/account/integrations",
    modelCacheFile: "qoder-cn-models-cache.json",
    patEnvNames: ["QODERCN_API_KEY", "QODERCN_PERSONAL_ACCESS_TOKEN", "QODERCN_PAT"],
    loginName: "Qoder CN (PAT)",
    userNameFallback: "Qoder CN User",
    userEmailFallback: "user@qoder.com.cn",
    usageTitle: "Qoder CN Plan",
    supportsBrowserLogin: false
  }
};
var QODER_MODES = ["global", "cn"];
function getQoderRegionConfig(mode) {
  return QODER_REGIONS[mode];
}
function getQoderBaseUrl(mode) {
  return getQoderRegionConfig(mode).baseUrl;
}
function getQoderModelListURL(mode) {
  return `${getQoderBaseUrl(mode)}algo/api/v2/model/list?Encode=1`;
}
function getQoderChatURL(mode) {
  return `${getQoderBaseUrl(mode)}algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1`;
}
function getQoderExchangeURL(mode) {
  return `${getQoderRegionConfig(mode).openApiUrl}/api/v1/jobToken/exchange`;
}
function getQoderUserInfoURL(mode) {
  return `${getQoderRegionConfig(mode).openApiUrl}/api/v1/userinfo`;
}
function getQoderUsageURL(mode) {
  return `${getQoderRegionConfig(mode).openApiUrl}/api/v2/quota/usage`;
}
function getQoderRefreshURL(mode) {
  return `${getQoderRegionConfig(mode).centerUrl}/algo/api/v3/user/refresh_token`;
}
function getQoderDeviceLoginURL(codeChallenge, machineID, nonce) {
  const baseUrl = getQoderRegionConfig("global").deviceLoginUrl;
  if (!baseUrl) throw new Error("Qoder browser login URL is not configured");
  return `${baseUrl}?challenge=${codeChallenge}&challenge_method=S256&machine_id=${machineID}&nonce=${nonce}`;
}
function getQoderDevicePollURL(nonce, codeVerifier) {
  const baseUrl = getQoderRegionConfig("global").openApiUrl;
  return `${baseUrl}/api/v1/deviceToken/poll?nonce=${encodeURIComponent(nonce)}&verifier=${encodeURIComponent(codeVerifier)}&challenge_method=S256`;
}

// src/catalog.ts
var ZERO_COST = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
var MAX_OUTPUT_TOKENS = 131072;
var DEFAULT_CONTEXT_WINDOW = 1e6;
function getHomeDir2() {
  return process.env.HOME || process.env.USERPROFILE || homedir2();
}
function getQoderCachePath(mode) {
  return join2(getHomeDir2(), ".pi", "agent", getQoderRegionConfig(mode).modelCacheFile);
}
var modelCacheMem = /* @__PURE__ */ new Map();
function readParsedModelCache(mode) {
  const cachePath = getQoderCachePath(mode);
  if (modelCacheMem.has(cachePath)) {
    return modelCacheMem.get(cachePath) ?? null;
  }
  if (!existsSync2(cachePath)) {
    modelCacheMem.set(cachePath, null);
    return null;
  }
  try {
    const data = JSON.parse(readFileSync2(cachePath, "utf8"));
    modelCacheMem.set(cachePath, data);
    return data;
  } catch {
    modelCacheMem.set(cachePath, null);
    return null;
  }
}
function writeParsedModelCache(mode, data) {
  const cachePath = getQoderCachePath(mode);
  mkdirSync2(dirname2(cachePath), { recursive: true });
  writeFileSync2(cachePath, JSON.stringify(data, null, 2), "utf-8");
  modelCacheMem.set(cachePath, data);
}
function toQoderModelId(displayName) {
  return (displayName || "QoderModel").replace(/\s+/g, "");
}
var staticModels = [
  {
    id: "Auto",
    upstreamKey: "auto",
    name: "Auto",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Ultimate",
    upstreamKey: "ultimate",
    name: "Ultimate",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Performance",
    upstreamKey: "performance",
    name: "Performance",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Efficient",
    upstreamKey: "efficient",
    name: "Efficient",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Lite",
    upstreamKey: "lite",
    name: "Lite",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Qwen3.7Plus",
    upstreamKey: "qmodel",
    name: "Qwen3.7 Plus",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Cantus",
    upstreamKey: "cmodel",
    name: "Cantus",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Qwen3.8-Max",
    upstreamKey: "qmodel_preview",
    name: "Qwen3.8-Max",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Qwen3.7-Max",
    upstreamKey: "qmodel_latest",
    name: "Qwen3.7-Max",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "DeepSeek-V4-Pro",
    upstreamKey: "dmodel",
    name: "DeepSeek-V4-Pro",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "DeepSeek-V4-Flash",
    upstreamKey: "dfmodel",
    name: "DeepSeek-V4-Flash",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "GLM-5.2",
    upstreamKey: "gm51model",
    name: "GLM-5.2",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: true,
    supportsEffort: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Kimi-K2.7-Code",
    upstreamKey: "kmodel",
    name: "Kimi-K2.7-Code",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    // Catalog advertises 256K; not included in the 1M live test in issue #13.
    contextWindow: 256e3,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "Kimi-K3",
    upstreamKey: "kmodel_latest",
    name: "Kimi-K3",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  },
  {
    id: "MiniMax-M3",
    upstreamKey: "mmodel",
    name: "MiniMax-M3",
    api: "qoder-api",
    provider: "qoder",
    baseUrl: getQoderBaseUrl("global"),
    reasoning: false,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS
  }
];
var staticCnModels = [
  {
    id: "Auto",
    upstreamKey: "auto",
    name: "Auto",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    // CN Auto has not been live-tested at 1M; keep the conservative 200K
    // fallback until the CN catalog advertises a larger option.
    contextWindow: 2e5,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN smart routing; fallback context window of 200K."
  },
  {
    id: "Qwen3.7-Max",
    upstreamKey: "qmodel_latest",
    name: "Qwen3.7-Max",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN qmodel_latest; context options 200K/400K/1M."
  },
  {
    id: "Qwen3.7-Plus",
    upstreamKey: "qmodel",
    name: "Qwen3.7-Plus",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN qmodel; context options 200K/400K/1M."
  },
  {
    id: "Qwen3.6-Flash",
    upstreamKey: "q36fmodel",
    name: "Qwen3.6-Flash",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN q36fmodel; context options 200K/400K/1M."
  },
  {
    id: "DeepSeek-V4-Pro",
    upstreamKey: "dmodel",
    name: "DeepSeek-V4-Pro",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN dmodel; context options 200K/400K/1M."
  },
  {
    id: "DeepSeek-V4-Flash",
    upstreamKey: "dfmodel",
    name: "DeepSeek-V4-Flash",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN dfmodel; context options 200K/400K/1M."
  },
  {
    id: "GLM-5.2",
    upstreamKey: "gm51model",
    name: "GLM-5.2",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    // Live CN catalog currently displays 200K; do not copy global gm51model's 1M.
    contextWindow: 2e5,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN gm51model; live catalog currently displays GLM-5.2 with 200K context."
  },
  {
    id: "Kimi-K2.7-Code",
    upstreamKey: "kmodel",
    name: "Kimi-K2.7-Code",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: true,
    supportsEffort: false,
    input: ["text", "image"],
    cost: ZERO_COST,
    // Catalog advertises 256K; same as global kmodel.
    contextWindow: 256e3,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN kmodel; context option 256K."
  },
  {
    id: "MiniMax-M2.7",
    upstreamKey: "mmodel",
    name: "MiniMax-M2.7",
    api: "qoder-api",
    provider: "qoder-cn",
    baseUrl: getQoderBaseUrl("cn"),
    reasoning: false,
    supportsEffort: false,
    input: ["text"],
    cost: ZERO_COST,
    // Live CN catalog reports 200K; not confirmed at 1M.
    contextWindow: 2e5,
    maxTokens: MAX_OUTPUT_TOKENS,
    description: "Qoder CN mmodel; live catalog reports 200K context."
  }
];
var PI_THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"];
function buildThinkingLevelMap(entry) {
  const tc = entry.thinking_config;
  if (!tc) return void 0;
  const efforts = tc.enabled?.efforts;
  if (efforts && typeof efforts === "object") {
    const supported = new Set(Object.keys(efforts));
    const map = { off: tc.disabled ? "disabled" : null };
    for (const level of PI_THINKING_LEVELS) {
      map[level] = supported.has(level) ? level : null;
    }
    return map;
  }
  if (tc.enabled) {
    const map = { off: tc.disabled ? "disabled" : null };
    for (const level of PI_THINKING_LEVELS) {
      map[level] = "enabled";
    }
    return map;
  }
  return void 0;
}
function getCachedModels(mode) {
  const data = readParsedModelCache(mode);
  if (data && Array.isArray(data.models)) {
    const models = data.models.map((model) => {
      const config = data.configs?.[model.id];
      const display = config?.display_name;
      const staticModel = (mode === "cn" ? staticCnModels : staticModels).find((seed) => seed.upstreamKey === model.id);
      if (display) return { ...model, id: toQoderModelId(display), name: display };
      if (staticModel) return { ...model, id: staticModel.id, name: staticModel.name };
      return model.name ? { ...model, id: toQoderModelId(model.name) } : model;
    });
    if (data.configs && typeof data.configs === "object" && !data.configs.auto) {
      return models.filter((model) => model.id.toLowerCase() !== "auto");
    }
    return models;
  }
  return mode === "cn" ? staticCnModels : staticModels;
}
function getCachedModelConfig(modelId, mode) {
  const data = readParsedModelCache(mode);
  if (data) {
    const direct = data.configs?.[modelId];
    if (direct && toQoderModelId(direct.display_name) === modelId) {
      return withMaxContextAsDefault(direct);
    }
    const legacyEntry = Object.values(data.configs || {}).find(
      (entry) => entry && typeof entry === "object" && toQoderModelId(entry.display_name) === modelId
    );
    if (legacyEntry) {
      return withMaxContextAsDefault(legacyEntry);
    }
  }
  const staticModel = (mode === "cn" ? staticCnModels : staticModels).find((model) => model.id === modelId);
  if (staticModel) {
    return {
      key: staticModel.upstreamKey || modelId,
      is_reasoning: staticModel.reasoning,
      source: "system"
    };
  }
  return null;
}
function contextWindowFromCatalog(entry) {
  const contextConfig = entry.context_config;
  if (contextConfig && typeof contextConfig === "object") {
    let advertised = 0;
    for (const configVal of Object.values(contextConfig)) {
      if (configVal && typeof configVal === "object" && typeof configVal.token_count === "number") {
        if (configVal.token_count > advertised) advertised = configVal.token_count;
      }
    }
    if (advertised > 0) return advertised;
  }
  return DEFAULT_CONTEXT_WINDOW;
}
function withMaxContextAsDefault(entry) {
  const contextConfig = entry.context_config;
  if (!contextConfig || typeof contextConfig !== "object") return entry;
  const maxTokenCount = Math.max(
    ...Object.values(contextConfig).map((config) => typeof config?.token_count === "number" ? config.token_count : 0)
  );
  if (maxTokenCount <= 0) return entry;
  return {
    ...entry,
    context_config: Object.fromEntries(
      Object.entries(contextConfig).map(([name, config]) => [
        name,
        { ...config, is_default: config.token_count === maxTokenCount }
      ])
    )
  };
}
function isCacheStale(mode) {
  const data = readParsedModelCache(mode);
  if (!data || typeof data.updatedAt !== "number") return true;
  return Date.now() - data.updatedAt > 36e5;
}
async function updateQoderModelsCache(authToken, userID, name, email, mode) {
  const modelListURL = getQoderModelListURL(mode);
  try {
    const headers = buildAuthHeaders(null, modelListURL, {
      userID,
      authToken,
      name,
      email
    });
    const response = await fetch(modelListURL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headers
      }
    });
    if (!response.ok) {
      return;
    }
    const resData = await response.json();
    const chatModels = resData.chat || [];
    if (chatModels.length === 0) return;
    const newModels = [];
    const configs = {};
    for (const entry of chatModels) {
      const key = entry.key;
      if (!key || !entry.enable || !entry.display_name) continue;
      const display = entry.display_name;
      const ctxLen = contextWindowFromCatalog(entry);
      const isVL = !!entry.is_vl;
      const isReasoning = !!entry.is_reasoning || !!entry.thinking_config;
      const supportsEffort = !!entry.thinking_config?.enabled?.efforts;
      const thinkingLevelMap = buildThinkingLevelMap(entry);
      const modelInfo = { id: toQoderModelId(display), name: display };
      configs[modelInfo.id] = entry;
      newModels.push({
        id: modelInfo.id,
        name: modelInfo.name,
        api: "qoder-api",
        provider: getQoderRegionConfig(mode).providerID,
        baseUrl: getQoderBaseUrl(mode),
        reasoning: isReasoning,
        supportsEffort,
        thinkingLevelMap,
        input: isVL ? ["text", "image"] : ["text"],
        cost: ZERO_COST,
        contextWindow: ctxLen,
        maxTokens: MAX_OUTPUT_TOKENS
      });
    }
    if (newModels.length === 0) return;
    const cacheData = {
      updatedAt: Date.now(),
      models: newModels,
      configs
    };
    writeParsedModelCache(mode, cacheData);
  } catch {
  }
}

// src/auth/login.ts
import crypto2 from "node:crypto";

// src/auth/pat.ts
var UA = "pi-provider-qoder";
var PAT_REFRESH_PREFIX = "pat";
function isPatRefresh(refresh) {
  return refresh.startsWith(`${PAT_REFRESH_PREFIX}|`);
}
function encodePatRefresh(pat, jobRefreshToken, userID, machineID) {
  return [PAT_REFRESH_PREFIX, pat, jobRefreshToken, userID, machineID].join("|");
}
function decodePatRefresh(refresh) {
  const parts = refresh.split("|");
  return {
    pat: parts[1] || "",
    jobRefreshToken: parts[2] || "",
    userID: parts[3] || "",
    machineID: parts[4] || ""
  };
}
async function exchangeJobToken(pat, mode) {
  const res = await fetch(getQoderExchangeURL(mode), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": UA,
      "Cosy-Version": QODER_OPENAPI_COSY_VERSION,
      "Cosy-ClientType": QODER_CLIENT_TYPE
    },
    body: JSON.stringify({ personal_token: pat })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Qoder PAT exchange failed: ${res.status} ${res.statusText}. ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.token) {
    throw new Error("Qoder PAT exchange returned no job token");
  }
  let expiresAt = Date.now() + 24 * 60 * 60 * 1e3;
  if (data.expires_at) {
    const parsed = Date.parse(data.expires_at);
    if (!Number.isNaN(parsed)) expiresAt = parsed;
  } else if (data.expires_in) {
    expiresAt = Date.now() + data.expires_in;
  }
  return {
    jobToken: data.token,
    jobRefreshToken: data.refresh_token || "",
    expiresAt
  };
}
async function fetchUserInfo(jobToken, mode) {
  let userID = "";
  let email = "";
  let name = "";
  try {
    const res = await fetch(getQoderUserInfoURL(mode), {
      headers: {
        Authorization: `Bearer ${jobToken}`,
        Accept: "application/json",
        "User-Agent": UA,
        "Cosy-Version": QODER_OPENAPI_COSY_VERSION,
        "Cosy-ClientType": QODER_CLIENT_TYPE
      }
    });
    if (res.ok) {
      const info = await res.json();
      userID = info.id || "";
      email = info.email || "";
      name = info.name || info.username || "";
    }
  } catch {
  }
  return { userID, email, name };
}
async function credentialsFromPat(pat, mode) {
  const region = getQoderRegionConfig(mode);
  const { jobToken, jobRefreshToken, expiresAt } = await exchangeJobToken(pat, mode);
  const { userID, email, name } = await fetchUserInfo(jobToken, mode);
  const machineID = getMachineId();
  return {
    refresh: encodePatRefresh(pat, jobRefreshToken, userID, machineID),
    access: jobToken,
    expires: expiresAt - 5 * 60 * 1e3,
    // 5 min buffer
    userID,
    email: email || region.userEmailFallback,
    name: name || region.userNameFallback,
    machineID
  };
}

// src/auth/login.ts
function getPrompt(callbacks) {
  return callbacks.onPrompt;
}
function getProgress(callbacks) {
  return callbacks.onProgress;
}
function getSignal(callbacks) {
  return callbacks.signal;
}
function generatePKCE() {
  const codeVerifier = crypto2.randomBytes(32).toString("base64url");
  const codeChallenge = crypto2.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}
function parseExpiresAt(s, expiresInSeconds) {
  if (s) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
    const ms = Number.parseInt(s, 10);
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  if (expiresInSeconds && expiresInSeconds > 0) {
    return Date.now() + expiresInSeconds * 1e3;
  }
  return Date.now() + 30 * 24 * 60 * 60 * 1e3;
}
async function interactiveLogin(callbacks, mode) {
  const region = getQoderRegionConfig(mode);
  const prompt = getPrompt(callbacks);
  const pat = await prompt({
    message: !region.supportsBrowserLogin ? "Paste a Qoder CN Personal Access Token, or leave empty to cancel" : "Paste a Qoder Personal Access Token (pt-...), or leave empty for browser login",
    placeholder: "pt-...",
    allowEmpty: true
  });
  if (getSignal(callbacks)?.aborted) throw new Error("Login cancelled");
  if (pat?.trim()) {
    return patLogin(callbacks, pat.trim(), mode);
  }
  if (!region.supportsBrowserLogin) {
    throw new Error(
      `Qoder CN browser login is not supported here. Paste a Qoder CN PAT from ${region.patManageUrl} or set QODERCN_PERSONAL_ACCESS_TOKEN.`
    );
  }
  if (getSignal(callbacks)?.aborted) throw new Error("Login cancelled");
  return runDeviceFlow(callbacks);
}
async function patLogin(callbacks, providedPat, mode) {
  const region = getQoderRegionConfig(mode);
  let pat = providedPat;
  if (!pat) {
    const prompt = getPrompt(callbacks);
    const entered = await prompt({
      message: !region.supportsBrowserLogin ? "Paste your Qoder CN Personal Access Token" : "Paste your Qoder Personal Access Token (pt-...)",
      placeholder: "pt-...",
      allowEmpty: false
    });
    if (getSignal(callbacks)?.aborted) throw new Error("Login cancelled");
    pat = entered?.trim();
  }
  if (!pat) {
    throw new Error("No Personal Access Token provided");
  }
  getProgress(callbacks)?.("Exchanging access token...");
  const creds = await credentialsFromPat(pat, mode);
  getProgress(callbacks)?.("Login successful!");
  return creds;
}
function abortableDelay(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error("Login cancelled"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || new Error("Login cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
async function runDeviceFlow(callbacks) {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const nonce = crypto2.randomUUID();
  const machineID = getMachineId();
  const verificationURI = getQoderDeviceLoginURL(codeChallenge, machineID, nonce);
  getProgress(callbacks)?.("Please complete login in your browser...");
  callbacks.onAuth({
    url: verificationURI,
    instructions: "Click to sign in with your Qoder account in the browser."
  });
  const pollURL = getQoderDevicePollURL(nonce, codeVerifier);
  const pollInterval = 2e3;
  const maxAttempts = 90;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (getSignal(callbacks)?.aborted) throw new Error("Login cancelled");
    await abortableDelay(pollInterval, getSignal(callbacks));
    try {
      const response = await fetch(pollURL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "pi-provider-qoder"
        },
        signal: getSignal(callbacks)
      });
      if (response.status === 202 || response.status === 404) {
        continue;
      }
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Device token poll failed: ${response.status} ${response.statusText}. Response: ${errText}`);
      }
      const tokenData = await response.json();
      if (!tokenData.token) {
        throw new Error("Device token poll returned empty access token");
      }
      const expireMs = parseExpiresAt(tokenData.expires_at, tokenData.expires_in);
      getProgress(callbacks)?.("Fetching user profile...");
      let email = "";
      let name = "";
      try {
        const userinfoRes = await fetch(getQoderUserInfoURL("global"), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenData.token}`,
            Accept: "application/json",
            "User-Agent": "pi-provider-qoder"
          }
        });
        if (userinfoRes.ok) {
          const userinfo = await userinfoRes.json();
          email = userinfo.email || "";
          name = userinfo.name || userinfo.username || "";
        }
      } catch {
      }
      getProgress(callbacks)?.("Login successful!");
      return {
        refresh: `${tokenData.refresh_token}|${tokenData.user_id}|${machineID}`,
        access: tokenData.token,
        expires: expireMs - 5 * 60 * 1e3,
        // 5 min buffer
        userID: tokenData.user_id,
        email,
        name,
        machineID
      };
    } catch (e) {
      const err = e;
      if (err.name === "AbortError" || getSignal(callbacks)?.aborted) {
        throw new Error("Login cancelled");
      }
      throw e;
    }
  }
  throw new Error("Authorization timed out");
}

// src/auth/oauth.ts
var AuthStorage2 = PiCodingAgent.AuthStorage;
var identityCache = /* @__PURE__ */ new Map();
function getHomeDir3() {
  return process.env.HOME || process.env.USERPROFILE || homedir3();
}
function getAuthFilePath() {
  return join3(getHomeDir3(), ".pi", "agent", "auth.json");
}
var authFileMem;
function readAuthFileCached() {
  const authPath = getAuthFilePath();
  if (authFileMem !== void 0) {
    if (authFileMem === null) return null;
    if (authFileMem.path === authPath) return authFileMem.data;
  }
  if (!existsSync3(authPath)) {
    authFileMem = null;
    return null;
  }
  try {
    const data = JSON.parse(readFileSync3(authPath, "utf-8"));
    authFileMem = { path: authPath, data };
    return data;
  } catch {
    authFileMem = null;
    return null;
  }
}
function getQoderPatForMode(mode) {
  for (const envName of getQoderRegionConfig(mode).patEnvNames) {
    const value = process.env[envName];
    if (value) return value;
  }
  return "";
}
function saveCredentialsToAuthFile(providerID, credentials) {
  try {
    const authPath = getAuthFilePath();
    const dir = dirname3(authPath);
    if (!existsSync3(dir)) {
      mkdirSync3(dir, { recursive: true, mode: 448 });
    }
    const existing = readAuthFileCached();
    const auth = existing ? { ...existing } : {};
    auth[providerID] = { type: "oauth", ...credentials };
    writeFileSync3(authPath, JSON.stringify(auth, null, 2), { encoding: "utf-8", mode: 384 });
    authFileMem = { path: authPath, data: auth };
    const q = credentials;
    if (q.access && q.userID) {
      identityCache.set(`${providerID}:${q.access}`, q);
    }
  } catch (err) {
    console.error(`[pi-provider-qoder] Failed to write auth storage for ${providerID}:`, err);
  }
}
async function autoLoginQoderFromEnvironment(providerID, mode) {
  const pat = getQoderPatForMode(mode);
  if (!pat) return;
  const credentials = await credentialsFromPat(pat, mode);
  if (typeof AuthStorage2?.create === "function") {
    try {
      const authStorage = AuthStorage2.create();
      authStorage.set(providerID, { type: "oauth", ...credentials });
    } catch {
      saveCredentialsToAuthFile(providerID, credentials);
    }
  } else {
    saveCredentialsToAuthFile(providerID, credentials);
  }
  const qCreds = credentials;
  await updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode);
}
function getCachedCredentials(_accessToken, providerID = "qoder") {
  const auth = readAuthFileCached();
  if (!auth) return null;
  const creds = auth[providerID] || (providerID === "qoder" ? auth.qoder : null);
  if (creds?.userID || creds?.access) {
    if (creds.access && creds.userID) {
      identityCache.set(`${providerID}:${creds.access}`, creds);
    }
    return creds;
  }
  return null;
}
async function resolveQoderIdentity(accessToken, providerID, mode) {
  const region = getQoderRegionConfig(mode);
  const cacheKey = `${providerID}:${accessToken}`;
  const mem = identityCache.get(cacheKey);
  if (mem?.userID) return mem;
  const cached = getCachedCredentials(accessToken, providerID);
  if (cached?.userID) {
    identityCache.set(cacheKey, cached);
    return cached;
  }
  const info = await fetchUserInfo(accessToken, mode);
  const machineID = getMachineId();
  const creds = {
    access: accessToken,
    userID: info.userID || "qoder-user",
    email: info.email || region.userEmailFallback,
    name: info.name || region.userNameFallback,
    machineID,
    refresh: "",
    expires: 0
  };
  identityCache.set(cacheKey, creds);
  saveCredentialsToAuthFile(providerID, creds);
  return creds;
}
async function loginQoderForMode(callbacks, mode) {
  const providerID = getQoderRegionConfig(mode).providerID;
  const pat = getQoderPatForMode(mode);
  if (pat) {
    try {
      const creds2 = await credentialsFromPat(pat, mode);
      const qCreds = creds2;
      updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {
      });
      saveCredentialsToAuthFile(providerID, creds2);
      return creds2;
    } catch {
    }
  }
  const creds = await interactiveLogin(callbacks, mode);
  try {
    const qCreds = creds;
    updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {
    });
  } catch {
  }
  saveCredentialsToAuthFile(providerID, creds);
  return creds;
}
async function refreshQoderTokenForMode(credentials, mode) {
  if (isPatRefresh(credentials.refresh)) {
    const { pat } = decodePatRefresh(credentials.refresh);
    if (pat) {
      try {
        const refreshed = await credentialsFromPat(pat, mode);
        const qCreds = refreshed;
        updateQoderModelsCache(qCreds.access, qCreds.userID, qCreds.name, qCreds.email, mode).catch(() => {
        });
        return refreshed;
      } catch {
      }
    }
    return {
      ...credentials,
      expires: Date.now() + 60 * 60 * 1e3
      // extend 1 hour to retry later
    };
  }
  const parts = credentials.refresh.split("|");
  const refreshToken = parts[0] || "";
  const userID = parts[1] || "";
  const machineID = parts[2] || getMachineId();
  const prev = credentials;
  const prevName = prev.name || "";
  const prevEmail = prev.email || "";
  const refreshURL = getQoderRefreshURL(mode);
  try {
    const response = await fetch(refreshURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.access}`,
        Accept: "application/json",
        "User-Agent": "pi-provider-qoder"
      },
      body: JSON.stringify({ refreshToken })
    });
    if (response.ok) {
      const data = await response.json();
      const newAccess = data.token;
      const newRefresh = data.refresh_token || refreshToken;
      let expireMs = Date.now() + 30 * 24 * 60 * 60 * 1e3;
      if (data.expires_at) {
        const parsed = Date.parse(data.expires_at);
        if (!Number.isNaN(parsed)) expireMs = parsed;
      } else if (data.expires_in) {
        expireMs = Date.now() + data.expires_in * 1e3;
      }
      const refreshed = {
        ...credentials,
        refresh: `${newRefresh}|${userID}|${machineID}`,
        access: newAccess,
        expires: expireMs - 5 * 60 * 1e3,
        userID,
        email: prevEmail,
        name: prevName,
        machineID
      };
      updateQoderModelsCache(newAccess, userID, prevName, prevEmail, mode).catch(() => {
      });
      return refreshed;
    }
  } catch {
  }
  const refreshedFallback = {
    ...credentials,
    expires: Date.now() + 60 * 60 * 1e3
    // extend for 1 hour
  };
  return refreshedFallback;
}

// src/auth/usage.ts
async function fetchQoderUsageForMode(credentials, mode) {
  const region = getQoderRegionConfig(mode);
  const response = await fetch(getQoderUsageURL(mode), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${credentials.access}`,
      Accept: "application/json",
      "User-Agent": "pi-provider-qoder"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Qoder usage: ${response.status} ${response.statusText}`);
  }
  const raw = await response.json();
  const usageBuckets = [];
  if (raw.userQuota) {
    usageBuckets.push({
      id: "user-quota",
      label: "User Quota",
      usedDisplay: raw.userQuota.used.toFixed(2),
      limitDisplay: raw.userQuota.total.toFixed(2),
      unit: raw.userQuota.unit,
      resetAt: raw.expiresAt ? new Date(raw.expiresAt).toISOString() : void 0
    });
  }
  if (raw.orgResourcePackage && raw.orgResourcePackage.total > 0) {
    usageBuckets.push({
      id: "org-resource-package",
      label: "Org Resource Package",
      usedDisplay: raw.orgResourcePackage.used.toFixed(2),
      limitDisplay: raw.orgResourcePackage.total.toFixed(2),
      unit: raw.orgResourcePackage.unit,
      resetAt: raw.expiresAt ? new Date(raw.expiresAt).toISOString() : void 0
    });
  }
  const remainingText = raw.userQuota ? `${raw.userQuota.remaining.toFixed(2)} ${raw.userQuota.unit} remaining` : "";
  return {
    summary: remainingText,
    subscriptionTitle: region.usageTitle,
    resetAt: raw.expiresAt ? new Date(raw.expiresAt).toISOString() : void 0,
    manageUrl: region.manageUrl,
    usageBuckets,
    raw
  };
}

// src/protocol/stream.ts
import crypto3 from "node:crypto";
import * as PiAi from "@earendil-works/pi-ai";
import {
  clampThinkingLevel
} from "@earendil-works/pi-ai";

// src/protocol/encoding.ts
var qoderCustomAlphabet = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
var qoderStdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var encodeTable = new Uint8Array(256);
for (let i = 0; i < encodeTable.length; i++) {
  encodeTable[i] = i;
}
for (let i = 0; i < qoderStdAlphabet.length; i++) {
  encodeTable[qoderStdAlphabet.charCodeAt(i)] = qoderCustomAlphabet.charCodeAt(i);
}
encodeTable["=".charCodeAt(0)] = "$".charCodeAt(0);
function qoderEncodeBody(plaintext) {
  const std = Buffer.isBuffer(plaintext) ? plaintext.toString("base64") : Buffer.from(plaintext).toString("base64");
  const n = std.length;
  const a = Math.floor(n / 3);
  const out = Buffer.allocUnsafe(n);
  let dst = 0;
  for (let i = n - a; i < n; i++) {
    out[dst++] = encodeTable[std.charCodeAt(i)];
  }
  for (let i = a; i < n - a; i++) {
    out[dst++] = encodeTable[std.charCodeAt(i)];
  }
  for (let i = 0; i < a; i++) {
    out[dst++] = encodeTable[std.charCodeAt(i)];
  }
  return out;
}

// src/protocol/thinking.ts
var THINKING_TAG_VARIANTS = [
  { open: "<thinking>", close: "</thinking>" },
  { open: "<think>", close: "</think>" },
  { open: "<reasoning>", close: "</reasoning>" },
  { open: "<thought>", close: "</thought>" }
];
var ALL_THINKING_TAGS = THINKING_TAG_VARIANTS.flatMap((variant) => [variant.open, variant.close]);
function getTrailingPossibleTagPrefixLength(text, tag) {
  const maxPrefixLength = Math.min(text.length, tag.length - 1);
  for (let len = maxPrefixLength; len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}
function getMaxTrailingPossibleTagPrefixLength(text, tags) {
  let maxLength = 0;
  for (const tag of tags) {
    maxLength = Math.max(maxLength, getTrailingPossibleTagPrefixLength(text, tag));
  }
  return maxLength;
}
function stripThinkingTags(text) {
  let out = text;
  for (const { open, close } of THINKING_TAG_VARIANTS) {
    if (open.length > 0 && out.includes(open)) out = out.split(open).join("");
    if (close.length > 0 && out.includes(close)) out = out.split(close).join("");
  }
  return out;
}
var ThinkingTagParser = class {
  constructor(output, stream) {
    this.output = output;
    this.stream = stream;
  }
  output;
  stream;
  textBuffer = "";
  inThinking = false;
  thinkingExtracted = false;
  thinkingBlockIndex = null;
  textBlockIndex = null;
  lastTextBlockIndex = null;
  activeEndTag = THINKING_TAG_VARIANTS[0].close;
  processChunk(chunk) {
    this.textBuffer += chunk;
    while (this.textBuffer.length > 0) {
      const prevLength = this.textBuffer.length;
      if (!this.inThinking && !this.thinkingExtracted) {
        this.processBeforeThinking();
        if (this.textBuffer.length === 0) break;
      }
      if (this.inThinking) {
        this.processInsideThinking();
        if (this.textBuffer.length === 0) break;
      }
      if (this.thinkingExtracted) {
        this.processAfterThinking();
        break;
      }
      if (this.textBuffer.length >= prevLength) break;
    }
  }
  finalize() {
    if (this.textBuffer.length === 0) return;
    if (this.inThinking && this.thinkingBlockIndex !== null) {
      const block = this.output.content[this.thinkingBlockIndex];
      block.thinking += this.textBuffer;
      this.stream.push({
        type: "thinking_delta",
        contentIndex: this.thinkingBlockIndex,
        delta: this.textBuffer,
        partial: this.output
      });
      this.stream.push({
        type: "thinking_end",
        contentIndex: this.thinkingBlockIndex,
        content: block.thinking,
        partial: this.output
      });
    } else {
      this.emitText(this.textBuffer);
    }
    this.textBuffer = "";
  }
  getTextBlockIndex() {
    return this.textBlockIndex ?? this.lastTextBlockIndex;
  }
  processBeforeThinking() {
    let bestOpenPos = -1;
    let bestOpenVariant = null;
    let bestClosePos = -1;
    let bestCloseVariant = null;
    for (const variant of THINKING_TAG_VARIANTS) {
      const openPos = this.textBuffer.indexOf(variant.open);
      if (openPos !== -1 && (bestOpenPos === -1 || openPos < bestOpenPos)) {
        bestOpenPos = openPos;
        bestOpenVariant = variant;
      }
      const closePos = this.textBuffer.indexOf(variant.close);
      if (closePos !== -1 && (bestClosePos === -1 || closePos < bestClosePos)) {
        bestClosePos = closePos;
        bestCloseVariant = variant;
      }
    }
    if (bestOpenVariant !== null && (bestCloseVariant === null || bestOpenPos < bestClosePos)) {
      if (bestOpenPos > 0) this.emitText(this.textBuffer.slice(0, bestOpenPos));
      this.textBuffer = this.textBuffer.slice(bestOpenPos + bestOpenVariant.open.length);
      this.activeEndTag = bestOpenVariant.close;
      this.inThinking = true;
      return;
    }
    if (bestCloseVariant !== null) {
      if (bestClosePos > 0) this.emitText(this.textBuffer.slice(0, bestClosePos));
      this.textBuffer = this.textBuffer.slice(bestClosePos + bestCloseVariant.close.length);
      if (this.textBuffer.startsWith("\n\n")) this.textBuffer = this.textBuffer.slice(2);
      else if (this.textBuffer.startsWith("\n")) this.textBuffer = this.textBuffer.slice(1);
      return;
    }
    const trailingPrefixLength = getMaxTrailingPossibleTagPrefixLength(this.textBuffer, ALL_THINKING_TAGS);
    const safeLen = this.textBuffer.length - trailingPrefixLength;
    if (safeLen > 0) {
      this.emitText(this.textBuffer.slice(0, safeLen));
      this.textBuffer = this.textBuffer.slice(safeLen);
    }
  }
  processInsideThinking() {
    const endPos = this.textBuffer.indexOf(this.activeEndTag);
    if (endPos !== -1) {
      if (endPos > 0) this.emitThinking(this.textBuffer.slice(0, endPos));
      if (this.thinkingBlockIndex !== null) {
        const block = this.output.content[this.thinkingBlockIndex];
        this.stream.push({
          type: "thinking_end",
          contentIndex: this.thinkingBlockIndex,
          content: block.thinking,
          partial: this.output
        });
      }
      this.textBuffer = this.textBuffer.slice(endPos + this.activeEndTag.length);
      this.inThinking = false;
      this.thinkingExtracted = true;
      this.lastTextBlockIndex = this.textBlockIndex;
      this.textBlockIndex = null;
      if (this.textBuffer.startsWith("\n\n")) this.textBuffer = this.textBuffer.slice(2);
      return;
    }
    const trailingPrefixLength = getTrailingPossibleTagPrefixLength(this.textBuffer, this.activeEndTag);
    const safeLen = this.textBuffer.length - trailingPrefixLength;
    if (safeLen > 0) {
      this.emitThinking(this.textBuffer.slice(0, safeLen));
      this.textBuffer = this.textBuffer.slice(safeLen);
    }
  }
  processAfterThinking() {
    this.emitText(this.textBuffer);
    this.textBuffer = "";
  }
  emitText(text) {
    if (!text) return;
    if (this.textBlockIndex === null) {
      this.textBlockIndex = this.output.content.length;
      this.output.content.push({ type: "text", text: "" });
      this.stream.push({ type: "text_start", contentIndex: this.textBlockIndex, partial: this.output });
    }
    const block = this.output.content[this.textBlockIndex];
    block.text += text;
    this.stream.push({ type: "text_delta", contentIndex: this.textBlockIndex, delta: text, partial: this.output });
  }
  emitThinking(thinking) {
    if (!thinking) return;
    if (this.thinkingBlockIndex === null) {
      if (this.textBlockIndex !== null) {
        this.thinkingBlockIndex = this.textBlockIndex;
        this.output.content.splice(this.thinkingBlockIndex, 0, { type: "thinking", thinking: "" });
        this.textBlockIndex = this.textBlockIndex + 1;
      } else {
        this.thinkingBlockIndex = this.output.content.length;
        this.output.content.push({ type: "thinking", thinking: "" });
      }
      this.stream.push({ type: "thinking_start", contentIndex: this.thinkingBlockIndex, partial: this.output });
    }
    const block = this.output.content[this.thinkingBlockIndex];
    block.thinking += thinking;
    this.stream.push({
      type: "thinking_delta",
      contentIndex: this.thinkingBlockIndex,
      delta: thinking,
      partial: this.output
    });
  }
};

// src/protocol/transform.ts
function getContentText(msg) {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.map((c) => {
      if (c.type === "text") return c.text;
      if (c.type === "thinking") return c.thinking;
      return "";
    }).join("");
  }
  return "";
}
function getContentImages(msg) {
  if (!Array.isArray(msg.content)) return [];
  return msg.content.filter((c) => c.type === "image");
}
function transformTools(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}
function transformMessagesForQoder(messages) {
  const normalizedMessages = [];
  const droppedToolCallIds = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    if (msg.role === "assistant" && (msg.stopReason === "error" || msg.stopReason === "aborted")) {
      const am = msg;
      if (Array.isArray(am.content)) {
        for (const block of am.content) {
          if (block.type === "toolCall") {
            const id = block.id;
            if (id) droppedToolCallIds.add(id);
          }
        }
      }
      continue;
    }
    if (msg.role === "toolResult" && droppedToolCallIds.has(msg.toolCallId)) {
      continue;
    }
    if (msg.role === "user") {
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const hasImage = msg.content.some((c) => c.type === "image");
        if (hasImage) {
          content = msg.content.map((c) => {
            if (c.type === "text") {
              return { type: "text", text: c.text };
            }
            if (c.type === "image") {
              const img = c;
              return {
                type: "image_url",
                image_url: {
                  url: `data:${img.mimeType};base64,${img.data}`
                }
              };
            }
            return null;
          }).filter((p) => p !== null);
        } else {
          content = getContentText(msg);
        }
      }
      normalizedMessages.push({
        role: "user",
        content
      });
    } else if (msg.role === "assistant") {
      const am = msg;
      let content = "";
      const toolCalls = [];
      if (Array.isArray(am.content)) {
        for (const block of am.content) {
          if (block.type === "text") {
            content += block.text;
          } else if (block.type === "thinking") {
            content += `<thinking>${block.thinking}</thinking>

`;
          } else if (block.type === "toolCall") {
            const tc = block;
            toolCalls.push({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments)
              }
            });
          }
        }
      } else {
        content = am.content || "";
      }
      const mapped = {
        role: "assistant",
        content: content || (toolCalls.length > 0 ? " " : null)
      };
      if (toolCalls.length > 0) {
        mapped.tool_calls = toolCalls;
      }
      normalizedMessages.push(mapped);
    } else if (msg.role === "toolResult") {
      const tr = msg;
      normalizedMessages.push({
        role: "tool",
        tool_call_id: tr.toolCallId,
        content: getContentText(tr)
      });
      const images = getContentImages(tr);
      if (images.length > 0) {
        normalizedMessages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `[${images.length} image${images.length === 1 ? "" : "s"} returned by the previous tool call]`
            },
            ...images.map(
              (img) => ({
                type: "image_url",
                image_url: { url: `data:${img.mimeType};base64,${img.data}` }
              })
            )
          ]
        });
      }
    }
  }
  return normalizedMessages;
}

// src/protocol/stream.ts
function stableHash(prefix, ...inputs) {
  const hash = crypto3.createHash("sha256");
  hash.update(prefix);
  for (const input of inputs) {
    hash.update("\0");
    hash.update(input);
  }
  return hash.digest("hex").slice(0, 16);
}
function stableChatRecordID(model, messages, tools, maxTokens) {
  const hash = crypto3.createHash("sha256");
  hash.update("qoder-record");
  hash.update("\0");
  hash.update(model);
  for (const msg of messages) {
    if (msg?.role) {
      hash.update("\0");
      hash.update(msg.role);
    }
    if (msg?.content) {
      hash.update("\0");
      hash.update(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    }
  }
  if (tools) {
    hash.update("\0");
    hash.update(JSON.stringify(tools));
  }
  hash.update("\0");
  hash.update(`mt=${maxTokens}`);
  return hash.digest("hex").slice(0, 16);
}
function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return part.text;
      return "";
    }).join("\n");
  }
  return "";
}
function streamQoder(model, context, options) {
  const StreamCtor = PiAi.AssistantMessageEventStream;
  const stream = new StreamCtor();
  const output = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: "stop",
    timestamp: Date.now()
  };
  (async () => {
    try {
      const providerMode = model.provider === "qoder-cn" ? "cn" : "global";
      const region = getQoderRegionConfig(providerMode);
      const accessToken = options?.apiKey;
      if (!accessToken) {
        throw new Error(
          providerMode === "cn" ? "Qoder CN credentials not set. Run /login qoder-cn or set QODERCN_PERSONAL_ACCESS_TOKEN." : "Qoder credentials not set. Run /login qoder or set QODER_PERSONAL_ACCESS_TOKEN."
        );
      }
      const ident = await resolveQoderIdentity(accessToken, model.provider, providerMode);
      const userID = ident.userID || "qoder-user";
      const name = ident.name || region.userNameFallback;
      const email = ident.email || region.userEmailFallback;
      const machineID = ident.machineID || getMachineId();
      const modelConfig = getCachedModelConfig(model.id, providerMode);
      if (!modelConfig?.key) {
        throw new Error(`Unknown Qoder model id: ${model.id}`);
      }
      const qoderModel = modelConfig.key;
      const isReasoning = !!modelConfig.is_reasoning;
      const normalizedMessages = transformMessagesForQoder(context.messages);
      const systemText = contentToText(context.systemPrompt || "");
      let lastUserText = "";
      for (let i = normalizedMessages.length - 1; i >= 0; i--) {
        if (normalizedMessages[i].role === "user") {
          const content = normalizedMessages[i].content;
          lastUserText = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => "text" in c ? c.text : "").join("") : "";
          break;
        }
      }
      const stablePart = stableHash("qoder-session", userID, qoderModel);
      const sessionID = options?.sessionId ? `${stablePart}-${options.sessionId}` : `${stablePart}-${crypto3.randomUUID()}`;
      let maxTokens = MAX_OUTPUT_TOKENS;
      if (options?.maxTokens && options.maxTokens < maxTokens) {
        maxTokens = options.maxTokens;
      }
      const toolsRaw = context.tools && context.tools.length > 0 ? transformTools(context.tools) : void 0;
      const recordID = stableChatRecordID(qoderModel, normalizedMessages, toolsRaw, maxTokens);
      const requestedLevel = options?.reasoning;
      const clamped = requestedLevel ? clampThinkingLevel(model, requestedLevel) : void 0;
      const reasoningLevel = clamped === "off" ? void 0 : clamped;
      const parameters = { max_tokens: maxTokens };
      if (reasoningLevel) {
        parameters.enable_thinking = true;
        const mapped = model.thinkingLevelMap?.[reasoningLevel];
        const effort = mapped && mapped !== "enabled" && mapped !== "disabled" ? mapped : reasoningLevel;
        if (modelConfig?.thinking_config?.enabled?.efforts && typeof effort === "string") {
          parameters.reasoning_effort = effort;
        }
      } else {
        parameters.enable_thinking = false;
      }
      const reqBody = {
        request_id: crypto3.randomUUID(),
        request_set_id: recordID,
        chat_record_id: recordID,
        session_id: sessionID,
        stream: true,
        chat_task: "FREE_INPUT",
        is_reply: true,
        is_retry: false,
        source: 1,
        version: "3",
        session_type: "qodercli",
        agent_id: "agent_common",
        task_id: "common",
        code_language: "",
        chat_prompt: "",
        image_urls: null,
        aliyun_user_type: "",
        // Qoder's server ignores the top-level `system` field (verified: the
        // model never sees it). Inject the system prompt as a leading
        // role:system message instead, which the server does honor.
        system: "",
        messages: systemText ? [{ role: "system", content: systemText }, ...normalizedMessages] : normalizedMessages,
        tools: toolsRaw || [],
        parameters,
        chat_context: {
          chatPrompt: "",
          imageUrls: null,
          extra: {
            context: [],
            modelConfig: {
              key: qoderModel,
              is_reasoning: isReasoning
            },
            originalContent: lastUserText
          },
          features: [],
          text: lastUserText
        },
        model_config: modelConfig,
        business: {
          product: "cli",
          version: "1.0.0",
          type: "agent",
          stage: "start",
          id: crypto3.randomUUID(),
          name: lastUserText.substring(0, 30),
          begin_at: Date.now()
        }
      };
      const bodyBytes = Buffer.from(JSON.stringify(reqBody));
      const encodedBytes = qoderEncodeBody(bodyBytes);
      const chatURL = getQoderChatURL(providerMode);
      const headers = buildAuthHeaders(encodedBytes, chatURL, {
        userID,
        authToken: accessToken,
        name,
        email,
        machineID
      });
      const modelSource = modelConfig.source || "system";
      const response = await fetch(chatURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          "Accept-Encoding": "identity",
          "X-Model-Key": qoderModel,
          "X-Model-Source": modelSource,
          ...headers
        },
        body: encodedBytes,
        signal: options?.signal
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Qoder API request failed: ${response.status} ${response.statusText}. Response: ${errText}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let bufferStart = 0;
      let contentBlockIndex = -1;
      let thinkingBlockIndex = -1;
      const toolCallsState = [];
      const thinkingEnabled = options?.reasoning !== false && options?.reasoning !== "off";
      const thinkingParser = thinkingEnabled ? new ThinkingTagParser(output, stream) : null;
      stream.push({ type: "start", partial: output });
      let sawDone = false;
      while (!sawDone) {
        const { done, value } = await reader.read();
        if (done) break;
        if (bufferStart > 0) {
          buffer = buffer.substring(bufferStart);
          bufferStart = 0;
        }
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          const lineEnd = buffer.indexOf("\n", bufferStart);
          if (lineEnd === -1) break;
          const line = buffer.substring(bufferStart, lineEnd).trim();
          bufferStart = lineEnd + 1;
          if (!line.startsWith("data:")) continue;
          const dataStr = line.substring(5).trim();
          if (dataStr === "[DONE]") {
            sawDone = true;
            break;
          }
          try {
            const envelope = JSON.parse(dataStr);
            if (envelope.statusCodeValue && envelope.statusCodeValue !== 200) {
              throw new Error(`Upstream status ${envelope.statusCodeValue}: ${envelope.body}`);
            }
            const innerStr = envelope.body;
            if (innerStr === "[DONE]") {
              sawDone = true;
              break;
            }
            if (!innerStr) continue;
            const inner = JSON.parse(innerStr);
            if (inner.id) output.responseId = inner.id;
            if (inner.model) output.responseModel = inner.model;
            if (inner.usage) {
              const u = inner.usage;
              const promptTokens = u.prompt_tokens ?? 0;
              const cacheReadTokens = u.prompt_tokens_details?.cached_tokens ?? 0;
              const cacheWriteTokens = u.prompt_tokens_details?.cache_write_tokens ?? 0;
              output.usage.input = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
              output.usage.output = u.completion_tokens ?? 0;
              output.usage.totalTokens = u.total_tokens ?? 0;
              output.usage.cacheRead = cacheReadTokens;
              output.usage.cacheWrite = cacheWriteTokens;
            }
            if (inner.choices && inner.choices.length > 0) {
              const choice = inner.choices[0];
              const delta = choice.delta;
              if (delta) {
                if (delta.reasoning_content) {
                  const reasoningChunk = stripThinkingTags(delta.reasoning_content);
                  if (reasoningChunk) {
                    if (thinkingBlockIndex === -1) {
                      thinkingBlockIndex = output.content.length;
                      output.content.push({ type: "thinking", thinking: "" });
                      stream.push({ type: "thinking_start", contentIndex: thinkingBlockIndex, partial: output });
                    }
                    const block = output.content[thinkingBlockIndex];
                    block.thinking += reasoningChunk;
                    stream.push({
                      type: "thinking_delta",
                      contentIndex: thinkingBlockIndex,
                      delta: reasoningChunk,
                      partial: output
                    });
                  }
                }
                if (delta.content) {
                  if (thinkingBlockIndex !== -1) {
                    const block = output.content[thinkingBlockIndex];
                    stream.push({
                      type: "thinking_end",
                      contentIndex: thinkingBlockIndex,
                      content: block.thinking,
                      partial: output
                    });
                    thinkingBlockIndex = -1;
                  }
                  if (thinkingParser) {
                    thinkingParser.processChunk(delta.content);
                  } else {
                    if (contentBlockIndex === -1) {
                      contentBlockIndex = output.content.length;
                      output.content.push({ type: "text", text: "" });
                      stream.push({ type: "text_start", contentIndex: contentBlockIndex, partial: output });
                    }
                    const block = output.content[contentBlockIndex];
                    block.text += delta.content;
                    stream.push({
                      type: "text_delta",
                      contentIndex: contentBlockIndex,
                      delta: delta.content,
                      partial: output
                    });
                  }
                }
                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCallsState[idx]) {
                      toolCallsState[idx] = { arguments: "", id: "", name: "", contentIndex: 0 };
                    }
                    const state = toolCallsState[idx];
                    if (tc.id) state.id = tc.id;
                    if (tc.function?.name) state.name = tc.function.name;
                    if (state.emittedStart === void 0 && (state.id || state.name)) {
                      state.emittedStart = true;
                      state.contentIndex = output.content.length;
                      output.content.push({
                        type: "toolCall",
                        id: state.id,
                        name: state.name,
                        arguments: {}
                      });
                      stream.push({ type: "toolcall_start", contentIndex: state.contentIndex, partial: output });
                    }
                    if (state.emittedStart) {
                      const block = output.content[state.contentIndex];
                      block.id = state.id;
                      block.name = state.name;
                    }
                    if (tc.function?.arguments) {
                      const argDelta = tc.function.arguments;
                      state.arguments += argDelta;
                      stream.push({
                        type: "toolcall_delta",
                        contentIndex: state.contentIndex,
                        delta: argDelta,
                        partial: output
                      });
                    }
                  }
                }
              }
              if (choice.finish_reason) {
                output.stopReason = choice.finish_reason;
              }
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              if (process.env.QODER_DEBUG) {
                console.error("[pi-provider-qoder] skipping malformed SSE line:", dataStr.slice(0, 200));
              }
              continue;
            }
            throw e;
          }
        }
      }
      await reader.cancel().catch(() => {
      });
      if (thinkingParser) {
        thinkingParser.finalize();
      }
      if (thinkingBlockIndex !== -1) {
        const block = output.content[thinkingBlockIndex];
        stream.push({
          type: "thinking_end",
          contentIndex: thinkingBlockIndex,
          content: block.thinking,
          partial: output
        });
      }
      for (const state of toolCallsState) {
        if (state?.emittedStart && !state.emittedEnd) {
          state.emittedEnd = true;
          let args = {};
          try {
            args = JSON.parse(state.arguments || "{}");
          } catch {
          }
          const block = output.content[state.contentIndex];
          block.arguments = args;
          stream.push({
            type: "toolcall_end",
            contentIndex: state.contentIndex,
            toolCall: {
              type: "toolCall",
              id: state.id,
              name: state.name,
              arguments: args
            },
            partial: output
          });
        }
      }
      if (toolCallsState.some((state) => state?.emittedStart)) {
        output.stopReason = "toolUse";
      }
      stream.push({
        type: "done",
        reason: output.stopReason,
        message: output
      });
      stream.end();
    } catch (e) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = e instanceof Error ? e.message : String(e);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      try {
        stream.end();
      } catch {
      }
    }
  })();
  return stream;
}

// src/index.ts
var QODER_API = "qoder-api";
async function registerQoderApi() {
  try {
    const compat = await import("@earendil-works/pi-ai/compat");
    const register = compat.registerApiProvider;
    if (typeof register !== "function") return;
    register(
      { api: QODER_API, stream: streamQoder, streamSimple: streamQoder },
      "provider:qoder"
    );
  } catch {
  }
}
function modelsForProvider(mode, providerID) {
  const cached = getCachedModels(mode);
  const modelsToUse = cached.length > 0 ? cached : mode === "cn" ? staticCnModels : staticModels;
  return modelsToUse.map((m) => ({
    ...m,
    provider: providerID,
    baseUrl: getQoderBaseUrl(mode)
  }));
}
function createQoderOAuth(mode) {
  const region = getQoderRegionConfig(mode);
  return {
    name: region.loginName,
    login: (callbacks) => loginQoderForMode(callbacks, mode),
    refreshToken: (credentials) => refreshQoderTokenForMode(credentials, mode),
    getApiKey: (cred) => cred.access,
    // NOTE: no `modifyModels` hook on purpose. OMP (Bun) does a whole-catalog
    // structuredClone before invoking it, and its bundled catalog contains a
    // model with a non-cloneable property -> "The object can not be cloned."
    // removes qoder from `omp models`. Models are supplied at registration
    // via `modelsForProvider` and refreshed by the startup/session cache hooks.
    fetchUsage: (credentials) => fetchQoderUsageForMode(credentials, mode)
  };
}
function registerQoderProvider(pi, mode) {
  const providerID = getQoderRegionConfig(mode).providerID;
  const oauth = createQoderOAuth(mode);
  pi.registerProvider(providerID, {
    baseUrl: getQoderBaseUrl(mode),
    api: QODER_API,
    models: modelsForProvider(mode, providerID),
    oauth,
    // pi-coding-agent resolves its own nested @earendil-works/pi-ai copy, so the
    // structurally identical Model/Context types are nominally distinct here.
    streamSimple: streamQoder
  });
}
async function refreshModelsAtStartup(mode) {
  const providerID = getQoderRegionConfig(mode).providerID;
  if (!isCacheStale(mode)) return;
  const credentials = getCachedCredentials("", providerID);
  if (!credentials?.access) return;
  const region = getQoderRegionConfig(mode);
  await updateQoderModelsCache(
    credentials.access,
    credentials.userID || "qoder-user",
    credentials.name || region.userNameFallback,
    credentials.email || region.userEmailFallback,
    mode
  );
}
async function index_default(pi) {
  await registerQoderApi();
  for (const mode of QODER_MODES) {
    const providerID = getQoderRegionConfig(mode).providerID;
    try {
      await autoLoginQoderFromEnvironment(providerID, mode);
      await refreshModelsAtStartup(mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[pi-provider-qoder] Automatic login failed for ${providerID}: ${message}`);
    }
  }
  pi.on("session_start", async (_event, ctx) => {
    for (const mode of QODER_MODES) {
      try {
        const region = getQoderRegionConfig(mode);
        const providerID = region.providerID;
        const accessToken = await ctx.modelRegistry.getApiKeyForProvider(providerID);
        if (!accessToken || !isCacheStale(mode)) continue;
        const creds = getCachedCredentials(accessToken, providerID);
        const userID = creds?.userID || "qoder-user";
        const name = creds?.name || region.userNameFallback;
        const email = creds?.email || region.userEmailFallback;
        await updateQoderModelsCache(accessToken, userID, name, email, mode);
      } catch {
      }
    }
  });
  for (const mode of QODER_MODES) registerQoderProvider(pi, mode);
}
export {
  index_default as default
};
