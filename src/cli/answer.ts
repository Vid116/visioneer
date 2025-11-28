#!/usr/bin/env tsx

/**
 * Answer Question CLI
 *
 * Lists open questions and allows answering them.
 *
 * Usage:
 *   npx tsx src/cli/answer.ts              # List open questions
 *   npx tsx src/cli/answer.ts <id> "answer" # Answer a specific question
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import { listProjects, getQuestions, answerQuestion, getTask } from "../db/queries.js";

function main() {
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
    answerQuestionCLI(projectId, questionId, answer);
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

    if (q.blocking_task_ids.length > 0) {
      console.log();
      console.log(`  Blocking ${q.blocking_task_ids.length} task(s):`);
      for (const taskId of q.blocking_task_ids) {
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
  console.log(`  Created: ${question.created_at}`);
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

  if (question.blocking_task_ids.length > 0) {
    console.log();
    console.log(`  Blocking tasks:`);
    for (const taskId of question.blocking_task_ids) {
      const task = getTask(taskId);
      if (task) {
        console.log(`    • [${task.status}] ${task.title}`);
      }
    }
  }

  console.log("└─────────────────────────────────────────────────────────────┘");
}

function answerQuestionCLI(projectId: string, partialId: string, answer: string) {
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

  console.log();
  console.log("Run 'npm run agent:cycle' to continue.");
}

main();
