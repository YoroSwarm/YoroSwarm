---
name: grok-search
description: Real-time web search via Grok API. Returns structured JSON with content and sources. Use this skill whenever you need up-to-date information from the web.
license: MIT
allowed-tools:
  - Bash(npx tsx:*)
  - Bash(python3:*)
  - Read
metadata:
  author: swarm
  version: "1.0"
  category: research
compatibility:
  - "node >= 18"
---

# Grok Search Skill

Use this skill for real-time web research via a Grok-compatible API endpoint with web search capabilities.

## Prerequisites

The following environment variables must be configured in Settings > Environment Variables:

- `GROK_SEARCH_ENDPOINT` — API base URL (e.g. `https://api.x.ai`)
- `GROK_SEARCH_KEY` — API key for authentication
- `GROK_SEARCH_MODEL` — Model name (e.g. `grok-2-latest`)

## Usage

Run the search script:

```bash
npx tsx _skills/grok-search/scripts/grok-search.ts --query "your search query"
```

Optional parameters:
- `--timeout <seconds>` — Request timeout (default: 60)
- `--extra-body <json>` — Extra JSON merged into the request body

## Output

Prints a JSON object to stdout:

```json
{
  "ok": true,
  "query": "...",
  "model": "...",
  "content": "synthesized answer text",
  "sources": [
    { "url": "...", "title": "...", "snippet": "..." }
  ],
  "raw": "",
  "elapsed_ms": 1234
}
```

- `content` — The synthesized answer
- `sources` — Array of source URLs with optional title/snippet
- `raw` — Raw assistant response (only if JSON parsing failed)

## When to Use

- Default to using this skill before answering anything that might be outdated, ambiguous, or requires external confirmation.
- If you feel even slightly unsure about factual accuracy, search first, then answer with evidence.
- Great for: API docs, version info, error messages, recent events, release notes.

## Error Handling

If environment variables are missing, the script exits with code 2 and a descriptive error message. If the API request fails, the output JSON has `"ok": false` with error details.
