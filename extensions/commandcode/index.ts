// index.ts
//
// Purpose: Discover CommandCode models at startup and register them with Pi
//
// This module:
// - Fetches the live catalog from https://api.commandcode.ai/provider/v1/models
// - Classifies each model (Claude vs OpenAI/OSS, thinking, vision)
// - Registers Claude models under "commandcode-claude" (anthropic-messages)
// - Registers other models under "commandcode" (openai-completions)
// - Falls back to models.json when the API is unreachable

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://api.commandcode.ai/provider/v1";
const MODELS_ENDPOINT = `${API_BASE}/models`;
const ENV_KEY = "CMD_API_KEY";

// ---------------------------------------------------------------------------
// Model classification patterns
// ---------------------------------------------------------------------------

/** Model IDs known to be Anthropic Claude (use anthropic-messages API). */
const CLAUDE_PATTERNS: RegExp[] = [/^claude-/];

/** Model IDs known to support thinking / reasoning. */
const THINKING_PATTERNS: RegExp[] = [
  /^claude-/,
  /^deepseek\//,
  /^moonshotai\/Kimi/,
  /^zai-org\/GLM/,
  /^Qwen\/Qwen3/,
];

/** Model IDs known to support vision / image input. */
const VISION_PATTERNS: RegExp[] = [
  /^claude-/,
  /^google\/gemini/,
  /^moonshotai\/Kimi/,
  /^zai-org\/GLM/,
  /^MiniMaxAI\//,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(id: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(id));
}

function isClaudeModel(id: string): boolean {
  return matchesAny(id, CLAUDE_PATTERNS);
}

/** Guess maxTokens from model name heuristics. */
function guessMaxTokens(id: string, name: string): number {
  const lower = `${id} ${name}`.toLowerCase();
  if (lower.includes("pro") || lower.includes("ultra") || lower.includes("max")) return 65_536;
  if (lower.includes("flash") || lower.includes("mini") || lower.includes("lite")) return 16_384;
  return 32_768;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface CommandCodeModelsResponse {
  object: string;
  data: CommandCodeModelEntry[];
}

interface CommandCodeModelEntry {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  name: string;
  context_length: number;
}

// ---------------------------------------------------------------------------
// Model builder
// ---------------------------------------------------------------------------

function buildModelConfig(entry: CommandCodeModelEntry): ProviderModelConfig {
  const id = entry.id;
  const name = entry.name;
  const hasThinking = matchesAny(id, THINKING_PATTERNS);
  const hasVision = matchesAny(id, VISION_PATTERNS);

  const cfg: ProviderModelConfig = {
    id,
    name,
    reasoning: hasThinking,
    input: hasVision ? ["text", "image"] : ["text"],
    contextWindow: entry.context_length,
    maxTokens: guessMaxTokens(id, name),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };

  if (hasThinking) {
    cfg.thinkingLevelMap = {
      off: "none",
      minimal: "low",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "high",
    };
  }

  return cfg;
}

// ---------------------------------------------------------------------------
// Main extension factory
// ---------------------------------------------------------------------------
export default async function (pi: ExtensionAPI) {
  const apiKey = process.env[ENV_KEY];
  if (!apiKey) {
    console.error(`[commandcode] ${ENV_KEY} not set -- skipping dynamic model fetch`);
    return;
  }

  let models: CommandCodeModelEntry[];

  try {
    const resp = await fetch(MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      console.error(
        `[commandcode] /v1/models returned ${resp.status} ${resp.statusText} -- falling back to models.json`
      );
      return;
    }

    const payload = (await resp.json()) as CommandCodeModelsResponse;
    if (!payload.data?.length) {
      console.error("[commandcode] /v1/models returned zero models -- falling back to models.json");
      return;
    }

    models = payload.data;
    console.error(`[commandcode] Discovered ${models.length} models from API`);
  } catch (err) {
    console.error(`[commandcode] Error fetching /v1/models: ${err} -- falling back to models.json`);
    return;
  }

  // Split into Claude (anthropic-messages) and OpenAI/OSS (openai-completions)
  const claudeModels: ProviderModelConfig[] = [];
  const openaiModels: ProviderModelConfig[] = [];

  for (const entry of models) {
    const cfg = buildModelConfig(entry);
    if (isClaudeModel(entry.id)) {
      claudeModels.push(cfg);
    } else {
      openaiModels.push(cfg);
    }
  }

  // Register OpenAI-compat provider (non-Claude models)
  if (openaiModels.length > 0) {
    pi.registerProvider("commandcode", {
      baseUrl: API_BASE,
      apiKey: "$CMD_API_KEY",
      api: "openai-completions",
      models: openaiModels,
    });
    console.error(`[commandcode] Registered ${openaiModels.length} models under "commandcode" (openai-completions)`);
  }

  // Register Anthropic-compat provider (Claude models)
  if (claudeModels.length > 0) {
    pi.registerProvider("commandcode-claude", {
      baseUrl: API_BASE,
      apiKey: "$CMD_API_KEY",
      api: "anthropic-messages",
      models: claudeModels,
    });
    console.error(`[commandcode] Registered ${claudeModels.length} models under "commandcode-claude" (anthropic-messages)`);
  }
}
