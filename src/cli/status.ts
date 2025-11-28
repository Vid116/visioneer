#!/usr/bin/env tsx

/**
 * Status CLI
 *
 * Dumps current project status:
 * - Project name and phase
 * - Progress snapshot
 * - Active priorities
 * - Task counts by status
 * - Open questions
 * - Last 5 activities
 *
 * Usage: npx tsx src/cli/status.ts [projectId]
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

function printStatus() {
  // Initialize database
  initializeSchema();

  // Get project ID from args or find active project
  let projectId = process.argv[2];

  if (!projectId) {
    const projects = listProjects();
    if (projects.length === 0) {
      console.log("❌ No projects found. Create a project first.");
      closeDatabase();
      process.exit(1);
    }

    // Use most recent project
    projectId = projects[0].id;
  }

  const project = getProject(projectId);
  if (!project) {
    console.log(`❌ Project not found: ${projectId}`);
    closeDatabase();
    process.exit(1);
  }

  const orientation = getOrientation(projectId);
  const tasks = getTasks(projectId);
  const questions = getQuestions(projectId);
  const activities = getRecentActivity(projectId, 5);
  const activeGoal = getActiveGoal(projectId);
  const warnings = getUnresolvedWarnings(projectId);

  // =========================================================================
  // Header
  // =========================================================================
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║              VISIONEER PROJECT STATUS                      ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // =========================================================================
  // Project Info
  // =========================================================================
  console.log("┌─ Project ───────────────────────────────────────────────────┐");
  console.log(`  ID: ${projectId.slice(0, 8)}...`);
  console.log(`  Created: ${project.created_at}`);

  if (orientation) {
    console.log();
    console.log(`  📋 Vision: ${orientation.vision_summary}`);
    console.log(`  📍 Phase: ${orientation.current_phase}`);
    console.log(`  📅 Version: ${orientation.version}`);
  } else {
    console.log();
    console.log("  ⚠️  No orientation set");
  }

  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log();

  // =========================================================================
  // Current Goal
  // =========================================================================
  if (activeGoal) {
    console.log("┌─ Current Goal ──────────────────────────────────────────────┐");
    console.log(`  "${activeGoal.goal}"`);
    console.log(`  Set: ${formatTime(activeGoal.created_at)}`);
    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  // =========================================================================
  // Progress Snapshot
  // =========================================================================
  if (orientation?.progress_snapshot && orientation.progress_snapshot.length > 0) {
    console.log("┌─ Progress ──────────────────────────────────────────────────┐");

    for (const progress of orientation.progress_snapshot) {
      const bar = buildProgressBar(progress.percent);
      console.log(`  ${progress.area}: ${bar} ${progress.percent}% (${progress.status})`);
      if (progress.blockers.length > 0) {
        console.log(`    ⚠️  Blockers: ${progress.blockers.join(", ")}`);
      }
    }

    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  // =========================================================================
  // Active Priorities
  // =========================================================================
  if (orientation?.active_priorities && orientation.active_priorities.length > 0) {
    console.log("┌─ Active Priorities ─────────────────────────────────────────┐");

    for (let i = 0; i < orientation.active_priorities.length; i++) {
      console.log(`  ${i + 1}. ${orientation.active_priorities[i]}`);
    }

    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  // =========================================================================
  // Task Counts
  // =========================================================================
  console.log("┌─ Tasks ──────────────────────────────────────────────────────┐");

  const tasksByStatus = {
    ready: tasks.filter((t) => t.status === "ready"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    blocked: tasks.filter((t) => t.status === "blocked"),
    done: tasks.filter((t) => t.status === "done"),
  };

  console.log(`  📗 Ready:       ${tasksByStatus.ready.length}`);
  console.log(`  📘 In Progress: ${tasksByStatus.in_progress.length}`);
  console.log(`  📕 Blocked:     ${tasksByStatus.blocked.length}`);
  console.log(`  ✅ Done:        ${tasksByStatus.done.length}`);
  console.log(`  ───────────────────`);
  console.log(`  📚 Total:       ${tasks.length}`);

  // Show next ready tasks
  if (tasksByStatus.ready.length > 0) {
    console.log();
    console.log("  Next ready tasks:");
    for (const task of tasksByStatus.ready.slice(0, 3)) {
      console.log(`    • ${task.title} (${task.skill_area})`);
    }
  }

  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log();

  // =========================================================================
  // Open Questions
  // =========================================================================
  const openQuestions = questions.filter((q) => q.status === "open");

  if (openQuestions.length > 0) {
    console.log("┌─ Open Questions ────────────────────────────────────────────┐");

    for (const q of openQuestions) {
      console.log(`  ❓ ${q.question}`);
      if (q.context) {
        console.log(`     ${q.context.slice(0, 60)}...`);
      }
      console.log(`     Blocks: ${q.blocking_task_ids.length} task(s)`);
      console.log();
    }

    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  // =========================================================================
  // Recent Activity
  // =========================================================================
  if (activities.length > 0) {
    console.log("┌─ Recent Activity ───────────────────────────────────────────┐");

    for (const activity of activities) {
      const time = formatTime(activity.timestamp);
      console.log(`  [${time}] ${activity.action}`);
    }

    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  // =========================================================================
  // Coherence Warnings
  // =========================================================================
  if (warnings.length > 0) {
    console.log("┌─ Coherence Warnings ────────────────────────────────────────┐");
    console.log(`  ${warnings.length} task(s) flagged as potentially off-track`);
    console.log();
    console.log("  Run 'npm run warnings' to review and resolve");
    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  // =========================================================================
  // Quick Actions
  // =========================================================================
  console.log("┌─ Quick Actions ──────────────────────────────────────────────┐");
  console.log("  npm run agent:cycle    Run one agent cycle");
  console.log("  npm run status         Show this status (refresh)");
  console.log("  npm run goal \"...\"     Set project goal");
  if (warnings.length > 0) {
    console.log("  npm run warnings       Review flagged tasks");
  }
  console.log("└─────────────────────────────────────────────────────────────┘");

  closeDatabase();
}

// =============================================================================
// Helpers
// =============================================================================

function buildProgressBar(percent: number): string {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMins > 0) {
    return `${diffMins}m ago`;
  } else {
    return "just now";
  }
}

printStatus();
