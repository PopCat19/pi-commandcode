#!/usr/bin/env node
//
// Purpose: Refetch commandcode /v1/models, regenerate models.json, commit & push if changed.
//
// Usage:   node .github/scripts/refresh-models.mjs
// Env:     none (models endpoint is public)

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const API = "https://api.commandcode.ai/provider/v1/models";
const MODELS_PATH = "extensions/commandcode/models.json";

// --- classification (mirrors index.ts) ------------------------------------

const THINKING_RE = /^(claude-|deepseek\/|moonshotai\/Kimi|zai-org\/GLM|Qwen\/Qwen3)/;
const VISION_RE = /^(claude-|google\/gemini|moonshotai\/Kimi|zai-org\/GLM|MiniMaxAI\/)/;

function classify(m) {
  const id = m.id;
  const hasThinking = THINKING_RE.test(id);
  const hasVision = VISION_RE.test(id);

  let maxTokens = 32768;
  const lower = `${id} ${m.name}`.toLowerCase();
  if (/pro|ultra|max/.test(lower)) maxTokens = 65536;
  if (/flash|mini|lite/.test(lower)) maxTokens = 16384;

  const entry = {
    id,
    name: m.name,
    reasoning: hasThinking,
    input: hasVision ? ["text", "image"] : ["text"],
    contextWindow: m.context_length,
    maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };

  if (hasThinking) {
    entry.thinkingLevelMap = {
      off: "none", minimal: "low", low: "low",
      medium: "medium", high: "high", xhigh: "high",
    };
  }

  return entry;
}

// --- main -----------------------------------------------------------------

const resp = await fetch(API);
if (!resp.ok) {
  console.error(`API returned ${resp.status} ${resp.statusText}`);
  process.exit(1);
}
const payload = await resp.json();
if (!payload.data?.length) {
  console.error("No models in API response");
  process.exit(1);
}

const all = payload.data.map(classify);
const claudeModels = all.filter(m => /^claude-/.test(m.id));
const openaiModels = all.filter(m => !/^claude-/.test(m.id));

const manifest = {
  commandcode: {
    baseUrl: "https://api.commandcode.ai/provider/v1",
    apiKey: "$CMD_API_KEY",
    api: "openai-completions",
    models: openaiModels,
  },
  "commandcode-claude": {
    baseUrl: "https://api.commandcode.ai/provider/v1",
    apiKey: "$CMD_API_KEY",
    api: "anthropic-messages",
    models: claudeModels,
  },
};

writeFileSync(MODELS_PATH, JSON.stringify(manifest) + "\n");
console.log(`Wrote ${all.length} models (${openaiModels.length} openai, ${claudeModels.length} claude)`);

// --- commit & push ---------------------------------------------------------

execSync("git add " + MODELS_PATH, { stdio: "inherit" });
try {
  execSync("git diff --cached --quiet", { stdio: "pipe" });
  console.log("No changes to models.json");
} catch {
  execSync('git commit -m "chore(commandcode): refresh models.json from API"', { stdio: "inherit" });
  execSync("git push", { stdio: "inherit" });
  console.log("Pushed updated models.json");
}
