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

**⚠️ 强制搜索原则 — 必须遵守**

- 对于任何**不确定、可能过时、需要外部验证**的信息，**必须先搜索再回答**
- 如果你对事实准确性有**任何犹豫**（哪怕只有一点点），**先搜索，后作答**
- 禁止基于模糊记忆或过时知识作答 — 搜索是验证不确定信息的**唯一方式**
- 当用户询问特定技术栈、框架、库的最新信息时，**必须搜索**（例如"React 19 新特性"、"Next.js 最新 API"）
- 当涉及错误诊断、版本兼容性、API 变更时，**必须搜索**

适用场景：API 文档、版本信息、错误消息、最新事件、发布说明、技术框架更新、版本兼容性检查。

## Error Handling

If environment variables are missing, the script exits with code 2 and a descriptive error message. If the API request fails, the output JSON has `"ok": false` with error details.
