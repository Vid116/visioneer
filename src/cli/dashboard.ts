#!/usr/bin/env tsx

/**
 * Live Dashboard CLI
 *
 * Real-time terminal dashboard showing Visioneer project status.
 * Auto-refreshes every 2 seconds (configurable).
 *
 * Features:
 * - Progress bar based on tasks done / total
 * - Task/knowledge/question counts
 * - Recent activity with timestamps and icons
 * - Pending questions prominently displayed
 * - Keyboard controls: q (quit), r (refresh), a (answer questions)
 *
 * Usage: npx tsx src/cli/dashboard.ts [projectId] [--refresh=N]
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import {
  listProjects,
  getProject,
  getOrientation,
  getTasks,
  getQuestions,
  getRecentActivity,
  getActiveGoal,
  getUnresolvedWarnings,
} from "../db/queries.js";
import { getDatabase } from "../db/connection.js";
import * as readline from "readline";
import { spawn } from "child_process";

// =============================================================================
// Configuration
// =============================================================================

interface DashboardConfig {
  refreshInterval: number; // milliseconds
  activityLimit: number;
  projectId: string | null;
}

function parseArgs(): DashboardConfig {
  const config: DashboardConfig = {
    refreshInterval: 2000,
    activityLimit: 10,
    projectId: null,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--refresh=")) {
      const seconds = parseInt(arg.split("=")[1], 10);
      if (!isNaN(seconds) && seconds > 0) {
        config.refreshInterval = seconds * 1000;
      }
    } else if (!arg.startsWith("--")) {
      config.projectId = arg;
    }
  }

  return config;
}

// =============================================================================
// Data Fetching
// =============================================================================

interface DashboardData {
  projectId: string;
  goal: string | null;
  phase: string;
  vision: string;
  tasks: {
    done: number;
    inProgress: number;
    ready: number;
    blocked: number;
    total: number;
    currentTask: { title: string; skillArea: string } | null;
  };
  knowledge: {
    chunks: number;
    relationships: number;
  };
  questions: {
    pending: number;
    list: Array<{ id: string; question: string; blocksCount: number }>;
  };
  warnings: number;
  activities: Array<{
    timestamp: string;
    action: string;
    icon: string;
  }>;
}

function getActivityIcon(action: string): string {
  const lower = action.toLowerCase();

  if (lower.startsWith("tool:")) return "\u{1F527}"; // wrench
  if (lower.includes("completed") || lower.includes("complete")) return "\u2713"; // checkmark
  if (lower.includes("started") || lower.includes("start")) return "\u25B6"; // play
  if (lower.includes("blocked")) return "\u23F8"; // pause
  if (lower.includes("created") || lower.includes("create")) return "\u2795"; // plus
  if (lower.includes("learned") || lower.includes("stored")) return "\u{1F4DA}"; // books
  if (lower.includes("search")) return "\u{1F50D}"; // magnifying glass
  if (lower.includes("fetch")) return "\u{1F310}"; // globe
  if (lower.includes("error") || lower.includes("failed")) return "\u274C"; // X
  if (lower.includes("question")) return "\u2753"; // question mark
  if (lower.includes("goal")) return "\u{1F3AF}"; // target
  if (lower.includes("orientation") || lower.includes("rewrite")) return "\u{1F4DD}"; // memo

  return "\u2022"; // bullet
}

function fetchDashboardData(projectId: string, activityLimit: number): DashboardData {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const orientation = getOrientation(projectId);
  const tasks = getTasks(projectId);
  const questions = getQuestions(projectId, "open");
  const activities = getRecentActivity(projectId, activityLimit);
  const activeGoal = getActiveGoal(projectId);
  const warnings = getUnresolvedWarnings(projectId);

  // Count chunks
  const chunkCount = getDatabase()
    .prepare("SELECT COUNT(*) as count FROM chunks WHERE project_id = ?")
    .get(projectId) as { count: number };

  // Count relationships (via chunks)
  const relationshipCount = getDatabase()
    .prepare(`
      SELECT COUNT(*) as count FROM relationships r
      JOIN chunks c ON r.from_chunk_id = c.id
      WHERE c.project_id = ?
    `)
    .get(projectId) as { count: number };

  // Task counts
  const tasksByStatus = {
    done: tasks.filter((t) => t.status === "done").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    ready: tasks.filter((t) => t.status === "ready").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };

  const inProgressTask = tasks.find((t) => t.status === "in_progress");

  return {
    projectId,
    goal: activeGoal?.goal || null,
    phase: orientation?.current_phase || "unknown",
    vision: orientation?.vision_summary || "No vision set",
    tasks: {
      ...tasksByStatus,
      total: tasks.length,
      currentTask: inProgressTask
        ? { title: inProgressTask.title, skillArea: inProgressTask.skill_area }
        : null,
    },
    knowledge: {
      chunks: chunkCount.count,
      relationships: relationshipCount.count,
    },
    questions: {
      pending: questions.length,
      list: questions.map((q) => ({
        id: q.id,
        question: q.question,
        blocksCount: q.blocks_tasks.length,
      })),
    },
    warnings: warnings.length,
    activities: activities.map((a) => ({
      timestamp: a.timestamp,
      action: a.action,
      icon: getActivityIcon(a.action),
    })),
  };
}

// =============================================================================
// Rendering
// =============================================================================

const BOX_WIDTH = 70;

function hr(char: string = "\u2550"): string {
  return char.repeat(BOX_WIDTH - 2);
}

function pad(text: string, width: number): string {
  const visibleLength = stripAnsi(text).length;
  if (visibleLength >= width) return text;
  return text + " ".repeat(width - visibleLength);
}

function stripAnsi(str: string): string {
  // Simple ANSI escape code stripper
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function buildProgressBar(done: number, total: number, width: number = 40): string {
  if (total === 0) return "\u2591".repeat(width);
  const percent = Math.round((done / total) * 100);
  const filled = Math.round((done / total) * width);
  const empty = width - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty) + ` ${percent}%`;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function render(data: DashboardData): string {
  const lines: string[] = [];

  // Header
  lines.push("\u2554" + hr() + "\u2557");
  lines.push("\u2551  VISIONEER DASHBOARD" + " ".repeat(BOX_WIDTH - 24) + "\u2551");
  lines.push("\u2560" + hr() + "\u2563");

  // Goal
  lines.push("\u2551  " + pad("GOAL: " + truncate(data.goal || "(no goal set)", 58), BOX_WIDTH - 5) + " \u2551");
  lines.push("\u2551  " + pad("Phase: " + data.phase, BOX_WIDTH - 5) + " \u2551");
  lines.push("\u2551" + " ".repeat(BOX_WIDTH - 2) + "\u2551");

  // Progress bar
  const progressBar = buildProgressBar(data.tasks.done, data.tasks.total);
  lines.push("\u2551  " + pad(progressBar, BOX_WIDTH - 5) + " \u2551");
  lines.push("\u2551" + " ".repeat(BOX_WIDTH - 2) + "\u2551");

  // Stats line
  const statsLine = `Tasks: ${data.tasks.done} done \u2502 ${data.tasks.inProgress} in progress \u2502 ${data.tasks.ready} ready \u2502 ${data.tasks.blocked} blocked`;
  lines.push("\u2551  " + pad(statsLine, BOX_WIDTH - 5) + " \u2551");

  const knowledgeLine = `Knowledge: ${data.knowledge.chunks} chunks \u2502 ${data.knowledge.relationships} relationships`;
  lines.push("\u2551  " + pad(knowledgeLine, BOX_WIDTH - 5) + " \u2551");

  if (data.warnings > 0) {
    lines.push("\u2551  " + pad(`\u26A0 Warnings: ${data.warnings} coherence warning(s)`, BOX_WIDTH - 5) + " \u2551");
  }

  // Current task
  if (data.tasks.currentTask) {
    lines.push("\u2551" + " ".repeat(BOX_WIDTH - 2) + "\u2551");
    lines.push("\u2551  " + pad("\u25B6 CURRENT: " + truncate(data.tasks.currentTask.title, 52), BOX_WIDTH - 5) + " \u2551");
    lines.push("\u2551    " + pad("(" + data.tasks.currentTask.skillArea + ")", BOX_WIDTH - 7) + " \u2551");
  }

  // Recent Activity section
  lines.push("\u2560" + hr() + "\u2563");
  lines.push("\u2551  RECENT ACTIVITY" + " ".repeat(BOX_WIDTH - 20) + "\u2551");

  if (data.activities.length === 0) {
    lines.push("\u2551  " + pad("(no activity yet)", BOX_WIDTH - 5) + " \u2551");
  } else {
    for (const activity of data.activities.slice(0, 8)) {
      const time = formatTimestamp(activity.timestamp);
      const actionText = truncate(activity.action, 48);
      const line = `[${time}] ${activity.icon} ${actionText}`;
      lines.push("\u2551  " + pad(line, BOX_WIDTH - 5) + " \u2551");
    }
  }

  // Questions section
  lines.push("\u2560" + hr() + "\u2563");
  lines.push("\u2551  PENDING QUESTIONS (" + data.questions.pending + ")" + " ".repeat(BOX_WIDTH - 27 - String(data.questions.pending).length) + "\u2551");

  if (data.questions.pending === 0) {
    lines.push("\u2551  " + pad("(none)", BOX_WIDTH - 5) + " \u2551");
  } else {
    for (const q of data.questions.list.slice(0, 3)) {
      const qText = truncate(q.question, 54);
      lines.push("\u2551  " + pad(`\u2753 ${qText}`, BOX_WIDTH - 5) + " \u2551");
      lines.push("\u2551    " + pad(`ID: ${q.id.slice(0, 8)}... (blocks ${q.blocksCount} task(s))`, BOX_WIDTH - 7) + " \u2551");
    }
    if (data.questions.list.length > 3) {
      lines.push("\u2551  " + pad(`... and ${data.questions.list.length - 3} more`, BOX_WIDTH - 5) + " \u2551");
    }
  }

  // Footer with controls
  lines.push("\u2560" + hr() + "\u2563");
  const controlsLine = "q: quit  |  r: refresh  |  a: answer questions";
  lines.push("\u2551  " + pad(controlsLine, BOX_WIDTH - 5) + " \u2551");
  lines.push("\u255A" + hr() + "\u255D");

  return lines.join("\n");
}

// =============================================================================
// Main Dashboard Loop
// =============================================================================

class Dashboard {
  private config: DashboardConfig;
  private projectId: string;
  private running: boolean = false;
  private refreshTimer: NodeJS.Timeout | null = null;
  private rl: readline.Interface | null = null;

  constructor(config: DashboardConfig) {
    this.config = config;
    this.projectId = "";
  }

  async start(): Promise<void> {
    // Initialize database
    initializeSchema();

    // Get project ID
    if (this.config.projectId) {
      this.projectId = this.config.projectId;
    } else {
      const projects = listProjects();
      if (projects.length === 0) {
        console.log("No projects found. Create a project first with: npm run goal \"Your goal\"");
        closeDatabase();
        process.exit(1);
      }
      this.projectId = projects[0].id;
    }

    // Verify project exists
    const project = getProject(this.projectId);
    if (!project) {
      console.log(`Project not found: ${this.projectId}`);
      closeDatabase();
      process.exit(1);
    }

    // Setup keyboard input
    this.setupKeyboard();

    // Start refresh loop
    this.running = true;
    this.refresh();
    this.startRefreshTimer();
  }

  private setupKeyboard(): void {
    // Enable raw mode for single keypress detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (key: string) => {
      // Handle Ctrl+C
      if (key === "\u0003") {
        this.stop();
        return;
      }

      switch (key.toLowerCase()) {
        case "q":
          this.stop();
          break;
        case "r":
          this.refresh();
          break;
        case "a":
          this.openAnswerCli();
          break;
      }
    });
  }

  private startRefreshTimer(): void {
    this.refreshTimer = setInterval(() => {
      if (this.running) {
        this.refresh();
      }
    }, this.config.refreshInterval);
  }

  private refresh(): void {
    try {
      const data = fetchDashboardData(this.projectId, this.config.activityLimit);

      // Clear screen and move cursor to top
      process.stdout.write("\x1b[2J\x1b[H");

      // Render dashboard
      console.log(render(data));

      // Show refresh info
      const now = new Date().toLocaleTimeString();
      console.log(`\nLast refresh: ${now} (every ${this.config.refreshInterval / 1000}s)`);
    } catch (error) {
      console.error("Error refreshing dashboard:", error);
    }
  }

  private openAnswerCli(): void {
    // Pause the dashboard
    this.running = false;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Restore terminal settings
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    // Clear screen
    process.stdout.write("\x1b[2J\x1b[H");
    console.log("Opening question answering interface...\n");
    console.log("Run: npm run answer\n");
    console.log("Press Enter to return to dashboard.");

    // Wait for Enter to resume
    const tempRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    tempRl.question("", () => {
      tempRl.close();

      // Resume dashboard
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      this.running = true;
      this.refresh();
      this.startRefreshTimer();
    });
  }

  private stop(): void {
    this.running = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Restore terminal
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    // Clear screen and show goodbye
    process.stdout.write("\x1b[2J\x1b[H");
    console.log("Dashboard closed.\n");
    console.log("Quick commands:");
    console.log("  npm run status       Show project status");
    console.log("  npm run agent:cycle  Run one agent cycle");
    console.log("  npm run dashboard    Reopen this dashboard");

    closeDatabase();
    process.exit(0);
  }
}

// =============================================================================
// Entry Point
// =============================================================================

const config = parseArgs();
const dashboard = new Dashboard(config);

dashboard.start().catch((error) => {
  console.error("Dashboard error:", error);
  closeDatabase();
  process.exit(1);
});
