/**
 * Tool Executor
 *
 * Executes tool calls from Claude and returns results.
 * Handles all tool implementations:
 * - web_search: Uses Serper API
 * - web_fetch: Fetches and extracts text from URLs
 * - write_artifact: Writes files to artifacts directory
 * - read_artifact: Reads files from artifacts directory
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { dbLogger } from "../../utils/logger.js";
import { getToolsConfig } from "../../utils/config.js";
import {
  WebSearchInput,
  WebSearchResult,
  WebFetchInput,
  WebFetchResult,
  WriteArtifactInput,
  WriteArtifactResult,
  ReadArtifactInput,
  ReadArtifactResult,
  ReadArtifactError,
  ToolResult,
} from "./index.js";

// =============================================================================
// Web Search (Serper API)
// =============================================================================

async function executeWebSearch(input: WebSearchInput): Promise<WebSearchResult[] | { error: string }> {
  const config = getToolsConfig();
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    dbLogger.error("SERPER_API_KEY not configured");
    return { error: "Web search not configured: missing SERPER_API_KEY" };
  }

  const maxResults = Math.min(
    input.max_results || config.web_search.max_results,
    10
  );

  try {
    dbLogger.debug("Executing web search", { query: input.query, maxResults });

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: input.query,
        num: maxResults,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      dbLogger.error("Serper API error", { status: response.status, error: errorText });
      return { error: `Search failed: ${response.status} ${response.statusText}` };
    }

    const data = await response.json() as {
      organic?: Array<{
        title: string;
        link: string;
        snippet: string;
      }>;
    };

    const results: WebSearchResult[] = (data.organic || []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));

    dbLogger.debug("Web search complete", { resultCount: results.length });
    return results;
  } catch (error) {
    dbLogger.error("Web search failed", { error: String(error) });
    return { error: `Search failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// =============================================================================
// Web Fetch (HTML to Text)
// =============================================================================

/**
 * Basic HTML to text extraction.
 * Removes scripts, styles, and HTML tags, then cleans up whitespace.
 */
function extractTextFromHtml(html: string): { title: string; content: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "Untitled";

  // Remove script and style elements
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // Remove HTML tags but keep text content
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Clean up whitespace
  text = text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();

  return { title, content: text };
}

async function executeWebFetch(input: WebFetchInput): Promise<WebFetchResult | { error: string }> {
  const config = getToolsConfig();
  const maxLength = config.web_fetch.max_content_length;

  try {
    dbLogger.debug("Fetching URL", { url: input.url });

    const response = await fetch(input.url, {
      headers: {
        "User-Agent": "Visioneer/1.0 (Autonomous Learning Agent)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      dbLogger.error("Fetch failed", { url: input.url, status: response.status });
      return { error: `Fetch failed: ${response.status} ${response.statusText}` };
    }

    const html = await response.text();
    const { title, content } = extractTextFromHtml(html);

    // Truncate if too long
    const truncatedContent = content.length > maxLength
      ? content.slice(0, maxLength) + "\n\n[Content truncated...]"
      : content;

    dbLogger.debug("Web fetch complete", {
      url: input.url,
      title,
      contentLength: truncatedContent.length,
    });

    return { title, content: truncatedContent };
  } catch (error) {
    dbLogger.error("Web fetch failed", { url: input.url, error: String(error) });
    return { error: `Fetch failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// =============================================================================
// Artifact Operations
// =============================================================================

function getArtifactsDir(projectId: string): string {
  const config = getToolsConfig();
  const baseDir = config.artifacts.directory;
  return join(baseDir, projectId);
}

function ensureArtifactsDir(projectId: string): string {
  const dir = getArtifactsDir(projectId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    dbLogger.debug("Created artifacts directory", { dir });
  }
  return dir;
}

async function executeWriteArtifact(
  input: WriteArtifactInput,
  projectId: string
): Promise<WriteArtifactResult | { error: string }> {
  try {
    // Validate required fields
    if (!input.filename) {
      return { error: "Cannot write artifact: filename is required" };
    }

    if (input.content === undefined || input.content === null) {
      return { error: "Cannot write artifact: content is undefined or null" };
    }

    // Ensure content is a string
    const content = typeof input.content === "string"
      ? input.content
      : JSON.stringify(input.content);

    const dir = ensureArtifactsDir(projectId);

    // Sanitize filename (remove path traversal attempts)
    const safeFilename = input.filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
    const filepath = join(dir, safeFilename);

    writeFileSync(filepath, content, "utf-8");
    const size = Buffer.byteLength(content, "utf-8");

    dbLogger.debug("Wrote artifact", {
      filename: safeFilename,
      type: input.type,
      size,
      projectId,
    });

    return { path: filepath, size };
  } catch (error) {
    dbLogger.error("Write artifact failed", {
      filename: input.filename,
      error: String(error),
    });
    return { error: `Write failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function executeReadArtifact(
  input: ReadArtifactInput,
  projectId: string
): Promise<ReadArtifactResult | ReadArtifactError | { error: string }> {
  try {
    const dir = getArtifactsDir(projectId);

    // Sanitize filename
    const safeFilename = input.filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
    const filepath = join(dir, safeFilename);

    if (!existsSync(filepath)) {
      dbLogger.debug("Artifact not found", { filename: safeFilename, projectId });
      return { error: "not found" as const };
    }

    const content = readFileSync(filepath, "utf-8");

    dbLogger.debug("Read artifact", {
      filename: safeFilename,
      contentLength: content.length,
      projectId,
    });

    return { content };
  } catch (error) {
    dbLogger.error("Read artifact failed", {
      filename: input.filename,
      error: String(error),
    });
    return { error: `Read failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// =============================================================================
// Main Tool Executor
// =============================================================================

/**
 * Execute a tool call from Claude.
 *
 * @param tool - The tool name to execute
 * @param input - The tool input parameters
 * @param projectId - The current project ID (for artifact operations)
 * @returns The tool execution result
 */
export async function executeTool(
  tool: string,
  input: Record<string, unknown>,
  projectId: string
): Promise<ToolResult> {
  dbLogger.info("Executing tool", { tool, projectId });

  switch (tool) {
    case "web_search":
      return executeWebSearch(input as unknown as WebSearchInput);

    case "web_fetch":
      return executeWebFetch(input as unknown as WebFetchInput);

    case "write_artifact":
      return executeWriteArtifact(input as unknown as WriteArtifactInput, projectId);

    case "read_artifact":
      return executeReadArtifact(input as unknown as ReadArtifactInput, projectId);

    default:
      dbLogger.error("Unknown tool", { tool });
      return { error: `Unknown tool: ${tool}` };
  }
}
