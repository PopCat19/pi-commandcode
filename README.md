# pi-commandcode

Pi extension — dynamic model discovery with thinking-level support for [CommandCode](https://commandcode.ai) provider API.

Fetches the live model catalog from `https://api.commandcode.ai/provider/v1/models` at startup and registers all available models via `pi.registerProvider()`. Falls back to `models.json` when the API is unreachable.

## Features

- **Dynamic model list** — no manual `models.json` upkeep; models auto-discovered from CommandCode catalog
- **Dual provider registration** — Claude models registered under `commandcode-claude` (Anthropic Messages API), all others under `commandcode` (OpenAI Chat Completions API)
- **Thinking-level support** — maps Pi thinking levels (off→xhigh) to provider `reasoning_effort` (none/low/medium/high)
- **Vision detection** — models supporting image input get `input: ["text", "image"]`
- **Context windows** — per-model context sizes from the live API response
- **Graceful fallback** — keeps whatever `models.json` provides when `/v1/models` is down

## Thinking-level mapping

| Pi level | `reasoning_effort` |
|----------|-------------------|
| off | `none` |
| minimal | `low` |
| low | `low` |
| medium | `medium` |
| high | `high` |
| xhigh | `high` |

Cycle levels with `Shift+Tab` or via `/settings`.

## Install

```bash
pi install git:github.com/PopCat19/pi-commandcode
```

Requires `CMD_API_KEY` environment variable set to a [CommandCode API key](https://commandcode.ai/settings/keys).

## Prerequisites

- [CommandCode](https://commandcode.ai) account on Provider plan or higher
- API key from https://commandcode.ai/settings/keys
- Pi ≥ 0.74.0

## License

MIT
