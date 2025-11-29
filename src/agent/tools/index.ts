/**
 * Tool Definitions for Claude API
 *
 * Defines the tools available to Claude during task execution:
 * - web_search: Search the web for information
 * - web_fetch: Fetch and extract content from a URL
 * - write_artifact: Save files to the artifacts directory
 * - read_artifact: Read files from the artifacts directory
 */

import Anthropic from "@anthropic-ai/sdk";

// =============================================================================
// Tool Input Types
// =============================================================================

export interface WebSearchInput {
  query: string;
  max_results?: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebFetchInput {
  url: string;
}

export interface WebFetchResult {
  content: string;
  title: string;
}

export interface WriteArtifactInput {
  filename: string;
  content: string;
  type: "notes" | "code" | "summary";
}

export interface WriteArtifactResult {
  path: string;
  size: number;
}

export interface ReadArtifactInput {
  filename: string;
}

export interface ReadArtifactResult {
  content: string;
}

export interface ReadArtifactError {
  error: "not found";
}

// =============================================================================
// Tool Result Types
// =============================================================================

export type ToolInput =
  | WebSearchInput
  | WebFetchInput
  | WriteArtifactInput
  | ReadArtifactInput;

export type ToolResult =
  | WebSearchResult[]
  | WebFetchResult
  | WriteArtifactResult
  | ReadArtifactResult
  | ReadArtifactError
  | { error: string };

// =============================================================================
// Claude Tool Definitions
// =============================================================================

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Search the web for information. Use this to research topics, find current information, or discover resources. Returns a list of search results with titles, URLs, and snippets.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query to execute",
        },
        max_results: {
          type: "number",
          description:
            "Maximum number of results to return (default: 5, max: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch and extract the main text content from a URL. Use this to read articles, documentation, or web pages. Returns the extracted text content and page title.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch content from",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "write_artifact",
    description:
      "Save content to a file in the project artifacts directory. Use this to save notes, code snippets, summaries, or any other content you want to persist. Files are organized by type.",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description:
            "Name of the file to create (e.g., 'chess_openings.md', 'practice_routine.txt')",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
        type: {
          type: "string",
          enum: ["notes", "code", "summary"],
          description:
            "Type of artifact: 'notes' for research notes, 'code' for code snippets, 'summary' for summaries",
        },
      },
      required: ["filename", "content", "type"],
    },
  },
  {
    name: "read_artifact",
    description:
      "Read content from a previously saved artifact file. Use this to reference notes, code, or summaries you've saved earlier.",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description: "Name of the file to read",
        },
      },
      required: ["filename"],
    },
  },
];

/**
 * Get enabled tools based on config.
 * Filters the tool definitions based on what's enabled in the config.
 */
export function getEnabledTools(config: {
  web_search?: { enabled: boolean };
  web_fetch?: { enabled: boolean };
  artifacts?: { enabled: boolean };
}): Anthropic.Tool[] {
  const enabledTools: Anthropic.Tool[] = [];

  for (const tool of toolDefinitions) {
    switch (tool.name) {
      case "web_search":
        if (config.web_search?.enabled !== false) {
          enabledTools.push(tool);
        }
        break;
      case "web_fetch":
        if (config.web_fetch?.enabled !== false) {
          enabledTools.push(tool);
        }
        break;
      case "write_artifact":
      case "read_artifact":
        if (config.artifacts?.enabled !== false) {
          enabledTools.push(tool);
        }
        break;
    }
  }

  return enabledTools;
}
