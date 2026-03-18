#!/usr/bin/env npx tsx
/**
 * grok-search.ts — Web search via Grok-compatible API endpoint.
 *
 * Environment variables (required):
 *   GROK_SEARCH_ENDPOINT — API base URL (e.g. https://api.x.ai)
 *   GROK_SEARCH_KEY      — API key
 *   GROK_SEARCH_MODEL    — Model name (e.g. grok-2-latest)
 *
 * Usage:
 *   npx tsx grok-search.ts --query "What is new in React 19?"
 *   npx tsx grok-search.ts --query "..." --timeout 120 --extra-body '{"temperature":0.5}'
 */

import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    query: { type: "string", short: "q" },
    timeout: { type: "string", short: "t", default: "60" },
    "extra-body": { type: "string", default: "" },
  },
  strict: true,
});

const query = values.query;
if (!query) {
  process.stderr.write("Error: --query is required\n");
  process.exit(2);
}

const timeoutSeconds = Number(values.timeout) || 60;

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

const baseUrl = (process.env.GROK_SEARCH_ENDPOINT ?? "").trim().replace(/\/+$/, "");
const apiKey = (process.env.GROK_SEARCH_KEY ?? "").trim();
const model = (process.env.GROK_SEARCH_MODEL ?? "").trim() || "grok-2-latest";

if (!baseUrl) {
  process.stderr.write(
    "Error: GROK_SEARCH_ENDPOINT environment variable is not set.\n" +
    "Configure it in Settings > Environment Variables.\n"
  );
  process.exit(2);
}

if (!apiKey) {
  process.stderr.write(
    "Error: GROK_SEARCH_KEY environment variable is not set.\n" +
    "Configure it in Settings > Environment Variables.\n"
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/v1") ? url.slice(0, -3) : url;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]}>\"']+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let url of matches) {
    url = url.replace(/[.,;:!?'"]+$/, "");
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

interface SearchSource {
  url: string;
  title: string;
  snippet: string;
}

function coerceJsonObject(text: string): Record<string, unknown> | null {
  text = text.trim();
  if (!text) return null;

  // Direct parse
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const v = JSON.parse(text);
      if (typeof v === "object" && v !== null && !Array.isArray(v)) return v;
    } catch {}
  }

  // Extract from markdown code block
  const mdMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (mdMatch) {
    try {
      const v = JSON.parse(mdMatch[1]);
      if (typeof v === "object" && v !== null && !Array.isArray(v)) return v;
    } catch {}
  }

  // Find {"content": ...} pattern with brace matching
  const idx = text.indexOf('{"content":');
  if (idx >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = idx; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"' && !esc) { inStr = !inStr; continue; }
      if (!inStr) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            try {
              const v = JSON.parse(text.slice(idx, i + 1));
              if (typeof v === "object" && v !== null && !Array.isArray(v)) return v;
            } catch {}
            break;
          }
        }
      }
    }
  }

  return null;
}

/** Parse SSE stream response, merge all delta.content */
function parseSseResponse(raw: string): { content: string; model: string } {
  const lines = raw.split("\n");
  const parts: string[] = [];
  let modelName = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "data: [DONE]") continue;
    if (!trimmed.startsWith("data: ")) continue;

    try {
      const chunk = JSON.parse(trimmed.slice(6));
      if (!modelName && chunk.model) modelName = chunk.model;
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) parts.push(delta.content);
    } catch {}
  }

  return { content: parts.join(""), model: modelName };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/chat/completions`;
  const systemPrompt =
    "You are a web research assistant. Use live web search/browsing when answering. " +
    "Return ONLY a single JSON object with keys: " +
    "content (string), sources (array of objects with url/title/snippet when possible). " +
    "Keep content concise and evidence-backed.";

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    temperature: 0.2,
    stream: false,
  };

  // Merge extra body
  const extraBodyRaw = values["extra-body"]?.trim();
  if (extraBodyRaw) {
    try {
      const extra = JSON.parse(extraBodyRaw);
      if (typeof extra === "object" && extra !== null) {
        Object.assign(body, extra);
      }
    } catch (e) {
      process.stderr.write(`Error: --extra-body is not valid JSON: ${e}\n`);
      return 2;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  const started = Date.now();

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const rawText = await resp.text();

    if (!resp.ok) {
      const out = {
        ok: false,
        error: `HTTP ${resp.status}`,
        detail: rawText.slice(0, 2000),
        base_url: baseUrl,
        model,
        elapsed_ms: Date.now() - started,
      };
      process.stdout.write(JSON.stringify(out));
      return 1;
    }

    // Parse response — may be SSE or plain JSON
    let message = "";
    let respModel = model;

    if (rawText.trim().startsWith("data:")) {
      const sse = parseSseResponse(rawText);
      message = sse.content;
      if (sse.model) respModel = sse.model;
    } else {
      try {
        const json = JSON.parse(rawText);
        message = json.choices?.[0]?.message?.content ?? "";
        if (json.model) respModel = json.model;
      } catch {
        message = rawText;
      }
    }

    // Parse structured output
    const parsed = coerceJsonObject(message);
    let content = "";
    let sources: SearchSource[] = [];
    let raw = "";

    if (parsed) {
      content = String(parsed.content ?? "");
      const src = parsed.sources;
      if (Array.isArray(src)) {
        for (const item of src) {
          if (typeof item === "object" && item !== null && (item as Record<string, unknown>).url) {
            sources.push({
              url: String((item as Record<string, unknown>).url),
              title: String((item as Record<string, unknown>).title ?? ""),
              snippet: String((item as Record<string, unknown>).snippet ?? ""),
            });
          }
        }
      }
      if (sources.length === 0) {
        sources = extractUrls(content).map((u) => ({ url: u, title: "", snippet: "" }));
      }
    } else {
      raw = message;
      sources = extractUrls(message).map((u) => ({ url: u, title: "", snippet: "" }));
    }

    const out = {
      ok: true,
      query,
      model: respModel,
      content,
      sources,
      raw,
      elapsed_ms: Date.now() - started,
    };
    process.stdout.write(JSON.stringify(out));
    return 0;
  } catch (err: unknown) {
    clearTimeout(timer);
    const detail = err instanceof Error ? err.message : String(err);
    const out = {
      ok: false,
      error: "request_failed",
      detail,
      base_url: baseUrl,
      model,
      elapsed_ms: Date.now() - started,
    };
    process.stdout.write(JSON.stringify(out));
    return 1;
  }
}

main().then((code) => process.exit(code));
