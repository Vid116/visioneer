#!/usr/bin/env tsx

/**
 * Answer Question CLI
 *
 * Lists open questions and allows answering them.
 * Detects pivot signals in answers and triggers orientation rewrite.
 *
 * Usage:
 *   npx tsx src/cli/answer.ts              # List open questions
 *   npx tsx src/cli/answer.ts <id> "answer" # Answer a specific question
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import { listProjects, getQuestions, answerQuestion, getTask } from "../db/queries.js";
import { handlePivot } from "../agent/orientation-rewrite.js";

async function main() {
  initializeSchema();

  // Get project
  let projectId = process.env.VISIONEER_PROJECT_ID;

  if (!projectId) {
    const projects = listProjects();
    if (projects.length === 0) {
      console.log("No projects found.");
      closeDatabase();
      process.exit(1);
    }
    projectId = projects[0].id;
  }

  const args = process.argv.slice(2);

  // If no args, list open questions
  if (args.length === 0) {
    listOpenQuestions(projectId);
    closeDatabase();
    return;
  }

  // If one arg that looks like an ID, show that question
  if (args.length === 1 && args[0].length > 8) {
    showQuestion(projectId, args[0]);
    closeDatabase();
    return;
  }

  // If two args, answer the question
  if (args.length >= 2) {
    const questionId = args[0];
    const answer = args.slice(1).join(" ");
    await answerQuestionCLI(projectId, questionId, answer);
    closeDatabase();
    return;
  }

  console.log("Usage:");
  console.log("  npm run answer                    # List open questions");
  console.log("  npm run answer <id>               # Show question details");
  console.log('  npm run answer <id> "Your answer" # Answer a question');
  closeDatabase();
}

function listOpenQuestions(projectId: string) {
  const questions = getQuestions(projectId, "open");

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║              OPEN QUESTIONS                                ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  if (questions.length === 0) {
    console.log("  No open questions. Agent can proceed freely.");
    console.log();
    return;
  }

  for (const q of questions) {
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log(`  ID: ${q.id.slice(0, 8)}...`);
    console.log(`  ❓ ${q.question}`);

    if (q.context) {
      console.log();
      console.log(`  Context: ${q.context}`);
    }

    if (q.blocks_tasks.length > 0) {
      console.log();
      console.log(`  Blocking ${q.blocks_tasks.length} task(s):`);
      for (const taskId of q.blocks_tasks) {
        const task = getTask(taskId);
        if (task) {
          console.log(`    • ${task.title}`);
        }
      }
    }

    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log();
  }

  console.log("To answer a question:");
  console.log(`  npm run answer ${questions[0].id.slice(0, 8)} "Your answer here"`);
  console.log();
  console.log("(You can use the first 8 characters of the ID)");
}

function showQuestion(projectId: string, partialId: string) {
  const questions = getQuestions(projectId);
  const question = questions.find((q) => q.id.startsWith(partialId));

  if (!question) {
    console.log(`Question not found: ${partialId}`);
    return;
  }

  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`  ID: ${question.id}`);
  console.log(`  Status: ${question.status}`);
  console.log(`  Asked: ${question.asked_at}`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`  ❓ ${question.question}`);

  if (question.context) {
    console.log();
    console.log(`  Context:`);
    console.log(`  ${question.context}`);
  }

  if (question.answer) {
    console.log();
    console.log(`  ✅ Answer:`);
    console.log(`  ${question.answer}`);
  }

  if (question.blocks_tasks.length > 0) {
    console.log();
    console.log(`  Blocking tasks:`);
    for (const taskId of question.blocks_tasks) {
      const task = getTask(taskId);
      if (task) {
        console.log(`    • [${task.status}] ${task.title}`);
      }
    }
  }

  console.log("└─────────────────────────────────────────────────────────────┘");
}

async function answerQuestionCLI(projectId: string, partialId: string, answer: string) {
  const questions = getQuestions(projectId);
  const question = questions.find((q) => q.id.startsWith(partialId));

  if (!question) {
    console.log(`Question not found: ${partialId}`);
    return;
  }

  if (question.status === "answered") {
    console.log("This question has already been answered:");
    console.log(`  ${question.answer}`);
    return;
  }

  console.log("Answering question...");
  console.log(`  ❓ ${question.question}`);
  console.log(`  ✅ ${answer}`);
  console.log();

  const result = answerQuestion(question.id, answer);

  console.log(`Question answered.`);

  if (result.unblockedTasks.length > 0) {
    console.log();
    console.log(`Unblocked ${result.unblockedTasks.length} task(s):`);
    for (const task of result.unblockedTasks) {
      console.log(`  • ${task.title} → ready`);
    }
  }

  // Handle pivot if detected
  if (result.pivotDetected) {
    console.log();
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│  🔄 PIVOT DETECTED                                          │");
    console.log("├─────────────────────────────────────────────────────────────┤");
    console.log(`  Signals: ${result.pivotSignals.join(", ")}`);
    console.log();
    console.log("  Processing direction change...");
    console.log();

    const pivotResult = await handlePivot(projectId, answer, result.pivotSignals);

    if (pivotResult.success) {
      console.log(`  ✅ Cancelled ${pivotResult.tasksCancelled} task(s)`);
      console.log(`  ✅ Orientation updated (v${pivotResult.newOrientation?.version})`);
      console.log();
      console.log("  The agent will plan new tasks based on your feedback");
      console.log("  on the next cycle run.");
    } else {
      console.log(`  ❌ Pivot handling failed: ${pivotResult.error}`);
    }
    console.log("└─────────────────────────────────────────────────────────────┘");
  }

  console.log();
  console.log("Run 'npm run agent:cycle' to continue.");
}

main().catch((error) => {
  console.error("Error:", error);
  closeDatabase();
  process.exit(1);
});
