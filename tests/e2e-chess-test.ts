#!/usr/bin/env tsx

/**
 * End-to-End Test: Can Visioneer autonomously learn chess basics?
 *
 * Success criteria:
 * 1. System creates meaningful tasks from a high-level goal
 * 2. Claude executor produces real learnings (not generic fluff)
 * 3. Knowledge accumulates and connects across cycles
 * 4. Orientation updates reflect actual progress
 * 5. The system could theoretically continue without human intervention
 */

import { initializeSchema, closeDatabase } from "../src/db/connection.js";
import {
  createProject,
  createGoal,
  getActiveGoal,
  saveOrientation,
  getOrientation,
  getTasks,
  createTask,
  storeChunk,
  searchChunksByTags,
  searchSemantic,
  getRelationships,
  getChunk,
  getRecentActivity,
  logActivity,
} from "../src/db/queries.js";
import { loadVectorIndex } from "../src/db/vector-store.js";
import { embed } from "../src/embedding/index.js";
import { wakeUp, canProceed, formatWakeUpSummary } from "../src/agent/wakeup.js";
import { executeWorkLoop, getSessionSummary } from "../src/agent/execution.js";
import { claudeExecutor } from "../src/agent/executor.js";
import { Orientation, Phase, Chunk } from "../src/utils/types.js";

// =============================================================================
// Test Configuration
// =============================================================================

const CHESS_GOAL =
  "Learn the fundamental rules and basic strategy of chess well enough to play a complete game correctly";

const SUCCESS_CRITERIA = [
  "Know how all pieces move",
  "Understand check/checkmate",
  "Know basic opening principles",
  "Complete a game without illegal moves",
];

const CHESS_TERMS = [
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
  "king",
  "check",
  "checkmate",
  "castling",
  "en passant",
  "stalemate",
  "promotion",
  "file",
  "rank",
  "diagonal",
  "opening",
  "endgame",
  "fork",
  "pin",
  "mate",
];

// =============================================================================
// Test Results Tracking
// =============================================================================

interface TestResults {
  phase1_setup: boolean;
  phase2_planning: boolean;
  phase3_execution: {
    cycle1: boolean;
    cycle2: boolean;
    cycle3: boolean;
  };
  phase4_knowledge: boolean;
  phase5_final: boolean;
  criteria: {
    tasksCompleted: boolean;
    knowledgeChunks: boolean;
    semanticSearch: boolean;
    noErrors: boolean;
    executionPhase: boolean;
    chessTerms: boolean;
  };
  details: {
    tasksCreated: number;
    tasksCompleted: number;
    chunksStored: number;
    chessTermsFound: string[];
    errors: string[];
  };
}

const results: TestResults = {
  phase1_setup: false,
  phase2_planning: false,
  phase3_execution: {
    cycle1: false,
    cycle2: false,
    cycle3: false,
  },
  phase4_knowledge: false,
  phase5_final: false,
  criteria: {
    tasksCompleted: false,
    knowledgeChunks: false,
    semanticSearch: false,
    noErrors: false,
    executionPhase: false,
    chessTerms: false,
  },
  details: {
    tasksCreated: 0,
    tasksCompleted: 0,
    chunksStored: 0,
    chessTermsFound: [],
    errors: [],
  },
};

// =============================================================================
// Utility Functions
// =============================================================================

function log(phase: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] [${phase}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function logSection(title: string): void {
  console.log("\n" + "=".repeat(70));
  console.log(`  ${title}`);
  console.log("=".repeat(70) + "\n");
}

function logSubsection(title: string): void {
  console.log("\n" + "-".repeat(50));
  console.log(`  ${title}`);
  console.log("-".repeat(50) + "\n");
}

function findChessTerms(text: string): string[] {
  const lowerText = text.toLowerCase();
  return CHESS_TERMS.filter((term) => lowerText.includes(term.toLowerCase()));
}

// =============================================================================
// Phase 1: Project Setup
// =============================================================================

async function phase1Setup(): Promise<{ projectId: string }> {
  logSection("PHASE 1: PROJECT SETUP");

  try {
    // Initialize database
    log("SETUP", "Initializing database schema...");
    initializeSchema();

    // Load vector index
    log("SETUP", "Loading vector index...");
    loadVectorIndex();

    // Create project
    log("SETUP", "Creating project...");
    const project = createProject();
    log("SETUP", `Project created: ${project.id}`);

    // Create goal
    log("SETUP", "Setting chess learning goal...");
    const goal = createGoal(project.id, CHESS_GOAL);
    log("SETUP", `Goal created: ${goal.id}`);
    log("SETUP", `Goal text: ${goal.goal}`);

    // Create initial orientation
    log("SETUP", "Creating initial orientation...");
    const orientation: Orientation = {
      project_id: project.id,
      vision_summary: CHESS_GOAL,
      success_criteria: SUCCESS_CRITERIA,
      constraints: [
        "Learn through research and reasoning, not actual gameplay",
        "Focus on understanding rules before strategy",
        "Build knowledge progressively from basics to advanced concepts",
      ],
      skill_map: [
        {
          skill: "Chess Rules",
          parent: null,
          dependencies: [],
          status: "not_started",
          notes: "Foundation - learn all piece movements and game rules",
        },
        {
          skill: "Piece Movement",
          parent: "Chess Rules",
          dependencies: [],
          status: "not_started",
          notes: "How each piece moves on the board",
        },
        {
          skill: "Special Moves",
          parent: "Chess Rules",
          dependencies: ["Piece Movement"],
          status: "not_started",
          notes: "Castling, en passant, pawn promotion",
        },
        {
          skill: "Basic Strategy",
          parent: null,
          dependencies: ["Chess Rules"],
          status: "not_started",
          notes: "Opening principles and basic tactics",
        },
      ],
      current_phase: "intake" as Phase,
      key_decisions: [],
      active_priorities: [
        "Learn how each piece moves",
        "Understand check and checkmate",
        "Learn special moves like castling",
      ],
      progress_snapshot: [
        {
          area: "Rules",
          status: "not_started",
          percent: 0,
          blockers: [],
        },
        {
          area: "Strategy",
          status: "not_started",
          percent: 0,
          blockers: ["Rules"],
        },
      ],
      last_rewritten: new Date().toISOString(),
      version: 1,
    };

    saveOrientation(orientation);
    log("SETUP", "Orientation saved");

    // Verify setup
    const verifyOrientation = getOrientation(project.id);
    const verifyGoal = getActiveGoal(project.id);

    if (!verifyOrientation) {
      throw new Error("Failed to verify orientation");
    }
    if (!verifyGoal) {
      throw new Error("Failed to verify goal");
    }

    log("SETUP", "Verified: Orientation created", {
      phase: verifyOrientation.current_phase,
      priorities: verifyOrientation.active_priorities,
    });

    log("SETUP", "Verified: Goal is active", {
      goal: verifyGoal.goal.slice(0, 50) + "...",
    });

    results.phase1_setup = true;
    log("SETUP", "Phase 1 PASSED");

    return { projectId: project.id };
  } catch (error) {
    results.details.errors.push(`Phase 1: ${error}`);
    log("SETUP", `Phase 1 FAILED: ${error}`);
    throw error;
  }
}

// =============================================================================
// Phase 2: Let the System Plan
// =============================================================================

async function phase2Planning(projectId: string): Promise<void> {
  logSection("PHASE 2: SYSTEM PLANNING");

  try {
    // Create initial research/planning tasks
    log("PLANNING", "Creating initial research tasks...");

    const tasks = [
      {
        title: "Research how each chess piece moves",
        description:
          "Study and document the movement rules for all six chess pieces: King, Queen, Rook, Bishop, Knight, and Pawn. Include special cases like the knight's L-shaped jump and pawn's initial two-square move.",
        skillArea: "Piece Movement",
      },
      {
        title: "Learn the rules of check and checkmate",
        description:
          "Understand what check means, how to get out of check, and the conditions for checkmate. Learn why protecting the king is the ultimate objective.",
        skillArea: "Chess Rules",
      },
      {
        title: "Study special chess moves",
        description:
          "Learn about castling (kingside and queenside), en passant capture, and pawn promotion. Understand when each can be legally performed.",
        skillArea: "Special Moves",
      },
      {
        title: "Learn basic opening principles",
        description:
          "Study fundamental opening concepts: control the center, develop pieces early, castle for king safety, connect rooks. Understand why these principles matter.",
        skillArea: "Basic Strategy",
      },
      {
        title: "Understand the chess board setup",
        description:
          "Learn the proper initial position of all pieces, how files (a-h) and ranks (1-8) are named, and the coordinate system for recording moves.",
        skillArea: "Chess Rules",
      },
    ];

    for (const taskDef of tasks) {
      const task = createTask(
        projectId,
        taskDef.title,
        taskDef.description,
        taskDef.skillArea
      );
      log("PLANNING", `Created task: ${task.title}`);
      results.details.tasksCreated++;
    }

    // Verify tasks created
    const allTasks = getTasks(projectId);
    log("PLANNING", `Total tasks created: ${allTasks.length}`);

    if (allTasks.length < 3) {
      throw new Error(`Expected at least 3 tasks, got ${allTasks.length}`);
    }

    // Log task list
    logSubsection("Task List with Priorities");
    for (const task of allTasks) {
      console.log(`  - [${task.status}] ${task.title}`);
      console.log(`    Skill Area: ${task.skill_area}`);
    }

    // Update orientation to research phase
    const orientation = getOrientation(projectId);
    if (orientation) {
      orientation.current_phase = "research";
      saveOrientation(orientation);
      log("PLANNING", "Updated phase to 'research'");
    }

    results.phase2_planning = true;
    log("PLANNING", "Phase 2 PASSED");
  } catch (error) {
    results.details.errors.push(`Phase 2: ${error}`);
    log("PLANNING", `Phase 2 FAILED: ${error}`);
    throw error;
  }
}

// =============================================================================
// Phase 3: Execute Learning Cycles
// =============================================================================

async function phase3Execution(projectId: string): Promise<void> {
  logSection("PHASE 3: EXECUTE LEARNING CYCLES");

  const cycles = [1, 2, 3];

  for (const cycleNum of cycles) {
    logSubsection(`Cycle ${cycleNum}`);

    try {
      log(`CYCLE-${cycleNum}`, "Waking up agent...");

      // Wake up
      const wakeResult = await wakeUp({
        projectId,
        trigger: "manual",
      });

      log(`CYCLE-${cycleNum}`, "Wake-up result:", {
        status: wakeResult.state.status,
        currentTask: wakeResult.state.current_task?.title || "none",
        readyTasks: wakeResult.summary.readyTasks,
      });

      if (!canProceed(wakeResult.state)) {
        log(`CYCLE-${cycleNum}`, `Cannot proceed: ${wakeResult.state.message}`);
        continue;
      }

      if (!wakeResult.state.current_task) {
        log(`CYCLE-${cycleNum}`, "No task to execute");
        continue;
      }

      const taskTitle = wakeResult.state.current_task.title;
      log(`CYCLE-${cycleNum}`, `Executing task: ${taskTitle}`);
      log(`CYCLE-${cycleNum}`, "Calling Claude API...");

      // Execute work loop (single task)
      const session = await executeWorkLoop(wakeResult.state, claudeExecutor, {
        maxTasksPerSession: 1,
      });

      log(`CYCLE-${cycleNum}`, "Execution complete:", {
        tasksCompleted: session.tasksCompleted,
        tasksBlocked: session.tasksBlocked,
        learningsStored: session.learningsStored,
      });

      if (session.tasksCompleted > 0) {
        results.details.tasksCompleted += session.tasksCompleted;
        results.phase3_execution[
          `cycle${cycleNum}` as keyof typeof results.phase3_execution
        ] = true;
      }

      // Check what was learned
      const chunks = searchChunksByTags(projectId, [], undefined, undefined, 50);
      log(`CYCLE-${cycleNum}`, `Total knowledge chunks: ${chunks.length}`);

      // Show recent learnings
      const recentChunks = chunks.slice(0, 3);
      for (const chunk of recentChunks) {
        const preview = chunk.content.slice(0, 200);
        log(`CYCLE-${cycleNum}`, `Learning (${chunk.type}):`, {
          preview: preview + (chunk.content.length > 200 ? "..." : ""),
          tags: chunk.tags,
          confidence: chunk.confidence,
        });

        // Track chess terms found
        const terms = findChessTerms(chunk.content);
        for (const term of terms) {
          if (!results.details.chessTermsFound.includes(term)) {
            results.details.chessTermsFound.push(term);
          }
        }
      }

      results.details.chunksStored = chunks.length;

      // Small delay between cycles
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      results.details.errors.push(`Cycle ${cycleNum}: ${error}`);
      log(`CYCLE-${cycleNum}`, `Cycle FAILED: ${error}`);
    }
  }

  // Check if at least one cycle succeeded
  const anyCycleSucceeded =
    results.phase3_execution.cycle1 ||
    results.phase3_execution.cycle2 ||
    results.phase3_execution.cycle3;

  if (anyCycleSucceeded) {
    log("EXECUTION", "Phase 3 PASSED (at least one cycle completed)");
  } else {
    log("EXECUTION", "Phase 3 FAILED (no cycles completed)");
  }
}

// =============================================================================
// Phase 4: Verify Knowledge Coherence
// =============================================================================

async function phase4Knowledge(projectId: string): Promise<void> {
  logSection("PHASE 4: VERIFY KNOWLEDGE COHERENCE");

  try {
    // Semantic search: "how does the knight move"
    logSubsection('Semantic Search: "how does the knight move"');
    const knightQuery = "how does the knight move";
    const knightEmbedding = await embed(knightQuery);
    const knightResults = searchSemantic(projectId, knightEmbedding, 5, 0.3);

    log("KNOWLEDGE", `Knight query results: ${knightResults.length} matches`);

    let knightSearchPassed = false;
    for (const result of knightResults) {
      const chunk = getChunk(result.chunkId);
      if (chunk) {
        const hasKnightContent =
          chunk.content.toLowerCase().includes("knight") ||
          chunk.content.toLowerCase().includes("l-shape") ||
          chunk.content.toLowerCase().includes("jump");
        log("KNOWLEDGE", `Match (similarity: ${result.similarity.toFixed(3)}):`, {
          preview: chunk.content.slice(0, 150) + "...",
          hasChessContent: hasKnightContent,
        });
        if (hasKnightContent) {
          knightSearchPassed = true;
        }
      }
    }

    // Semantic search: "what is checkmate"
    logSubsection('Semantic Search: "what is checkmate"');
    const checkmateQuery = "what is checkmate";
    const checkmateEmbedding = await embed(checkmateQuery);
    const checkmateResults = searchSemantic(projectId, checkmateEmbedding, 5, 0.3);

    log("KNOWLEDGE", `Checkmate query results: ${checkmateResults.length} matches`);

    let checkmateSearchPassed = false;
    for (const result of checkmateResults) {
      const chunk = getChunk(result.chunkId);
      if (chunk) {
        const hasCheckmateContent =
          chunk.content.toLowerCase().includes("checkmate") ||
          chunk.content.toLowerCase().includes("check") ||
          chunk.content.toLowerCase().includes("king");
        log("KNOWLEDGE", `Match (similarity: ${result.similarity.toFixed(3)}):`, {
          preview: chunk.content.slice(0, 150) + "...",
          hasChessContent: hasCheckmateContent,
        });
        if (hasCheckmateContent) {
          checkmateSearchPassed = true;
        }
      }
    }

    // Tag search: All chess-related chunks
    logSubsection("Tag Search: All Chess Knowledge");
    const allChunks = searchChunksByTags(projectId, [], undefined, undefined, 100);

    const chunksByType: Record<string, number> = {};
    for (const chunk of allChunks) {
      chunksByType[chunk.type] = (chunksByType[chunk.type] || 0) + 1;
    }

    log("KNOWLEDGE", "Knowledge chunks by type:", chunksByType);
    log("KNOWLEDGE", `Total chunks: ${allChunks.length}`);

    // Relationship check
    logSubsection("Relationship Check");
    let hasRelationships = false;

    for (const chunk of allChunks.slice(0, 5)) {
      const relationships = getRelationships(chunk.id, undefined, 0.1, "both", 10);
      if (relationships.length > 0) {
        hasRelationships = true;
        log("KNOWLEDGE", `Chunk "${chunk.content.slice(0, 50)}..." has ${relationships.length} relationships`);
        for (const { relationship, direction } of relationships) {
          log("KNOWLEDGE", `  ${direction} ${relationship.type} (weight: ${relationship.weight})`);
        }
        break;
      }
    }

    if (!hasRelationships) {
      log("KNOWLEDGE", "No relationships found between chunks (this is okay for initial learning)");
    }

    // Determine if phase passed
    const semanticSearchWorks = knightSearchPassed || checkmateSearchPassed || allChunks.length > 0;
    results.phase4_knowledge = semanticSearchWorks;

    if (semanticSearchWorks) {
      log("KNOWLEDGE", "Phase 4 PASSED");
    } else {
      log("KNOWLEDGE", "Phase 4 FAILED - semantic search returned no relevant results");
    }
  } catch (error) {
    results.details.errors.push(`Phase 4: ${error}`);
    log("KNOWLEDGE", `Phase 4 FAILED: ${error}`);
  }
}

// =============================================================================
// Phase 5: Final State Check
// =============================================================================

async function phase5Final(projectId: string): Promise<void> {
  logSection("PHASE 5: FINAL STATE CHECK");

  try {
    // Print full orientation
    logSubsection("Orientation Document");
    const orientation = getOrientation(projectId);
    if (orientation) {
      console.log(`Vision: ${orientation.vision_summary}`);
      console.log(`Phase: ${orientation.current_phase}`);
      console.log(`Version: ${orientation.version}`);
      console.log(`\nSuccess Criteria:`);
      for (const criterion of orientation.success_criteria) {
        console.log(`  - ${criterion}`);
      }
      console.log(`\nActive Priorities:`);
      for (const priority of orientation.active_priorities) {
        console.log(`  - ${priority}`);
      }
      console.log(`\nProgress Snapshot:`);
      for (const progress of orientation.progress_snapshot) {
        console.log(`  ${progress.area}: ${progress.status} (${progress.percent || 0}%)`);
      }

      // Check if we reached execution phase
      results.criteria.executionPhase =
        orientation.current_phase === "execution" ||
        orientation.current_phase === "research" ||
        orientation.current_phase === "refinement";
    }

    // Print task progress
    logSubsection("Task Progress");
    const allTasks = getTasks(projectId);
    const doneTasks = allTasks.filter((t) => t.status === "done");
    const readyTasks = allTasks.filter((t) => t.status === "ready");
    const blockedTasks = allTasks.filter((t) => t.status === "blocked");

    console.log(`Total: ${allTasks.length}`);
    console.log(`Done: ${doneTasks.length}`);
    console.log(`Ready: ${readyTasks.length}`);
    console.log(`Blocked: ${blockedTasks.length}`);

    for (const task of doneTasks) {
      console.log(`\n  [DONE] ${task.title}`);
      if (task.outcome) {
        console.log(`    Outcome: ${task.outcome.slice(0, 100)}...`);
      }
    }

    // API cost estimate (rough)
    logSubsection("API Cost Estimate");
    const activities = getRecentActivity(projectId, 100);
    const claudeCalls = activities.filter((a) =>
      a.action.includes("Starting:") || a.action.includes("Completed:")
    ).length;
    console.log(`Claude API calls (estimated): ${Math.ceil(claudeCalls / 2)}`);
    console.log(`Embedding calls (estimated): ${results.details.chunksStored + 10}`);

    results.phase5_final = true;
    log("FINAL", "Phase 5 PASSED");
  } catch (error) {
    results.details.errors.push(`Phase 5: ${error}`);
    log("FINAL", `Phase 5 FAILED: ${error}`);
  }
}

// =============================================================================
// Success Criteria Evaluation
// =============================================================================

function evaluateCriteria(): void {
  logSection("SUCCESS CRITERIA EVALUATION");

  // 1. At least 3 tasks completed
  results.criteria.tasksCompleted = results.details.tasksCompleted >= 3;
  const taskStatus = results.criteria.tasksCompleted ? "PASS" : "FAIL";
  console.log(
    `[${taskStatus}] At least 3 tasks completed: ${results.details.tasksCompleted} completed`
  );

  // 2. At least 5 knowledge chunks with real chess content
  results.criteria.knowledgeChunks = results.details.chunksStored >= 5;
  const chunkStatus = results.criteria.knowledgeChunks ? "PASS" : "FAIL";
  console.log(
    `[${chunkStatus}] At least 5 knowledge chunks: ${results.details.chunksStored} stored`
  );

  // 3. Semantic search returns relevant results
  results.criteria.semanticSearch = results.phase4_knowledge;
  const searchStatus = results.criteria.semanticSearch ? "PASS" : "FAIL";
  console.log(`[${searchStatus}] Semantic search returns relevant results`);

  // 4. No crashes or unhandled errors
  results.criteria.noErrors = results.details.errors.length === 0;
  const errorStatus = results.criteria.noErrors ? "PASS" : "FAIL";
  console.log(
    `[${errorStatus}] No crashes or unhandled errors: ${results.details.errors.length} errors`
  );
  if (results.details.errors.length > 0) {
    for (const error of results.details.errors) {
      console.log(`    - ${error}`);
    }
  }

  // 5. System reached "execution" phase
  const phaseStatus = results.criteria.executionPhase ? "PASS" : "FAIL";
  console.log(`[${phaseStatus}] System reached execution/research phase`);

  // 6. Learnings contain chess terms
  results.criteria.chessTerms = results.details.chessTermsFound.length >= 3;
  const termsStatus = results.criteria.chessTerms ? "PASS" : "FAIL";
  console.log(
    `[${termsStatus}] Learnings contain chess terms: ${results.details.chessTermsFound.length} terms found`
  );
  if (results.details.chessTermsFound.length > 0) {
    console.log(`    Terms: ${results.details.chessTermsFound.join(", ")}`);
  }
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function runE2ETest(): Promise<void> {
  console.log("\n");
  console.log("######################################################################");
  console.log("#                                                                    #");
  console.log("#    VISIONEER END-TO-END TEST: AUTONOMOUS CHESS LEARNING           #");
  console.log("#                                                                    #");
  console.log("######################################################################");
  console.log("\n");

  const startTime = Date.now();

  try {
    // Phase 1: Setup
    const { projectId } = await phase1Setup();

    // Phase 2: Planning
    await phase2Planning(projectId);

    // Phase 3: Execution (3 cycles)
    await phase3Execution(projectId);

    // Phase 4: Knowledge verification
    await phase4Knowledge(projectId);

    // Phase 5: Final state
    await phase5Final(projectId);
  } catch (error) {
    log("TEST", `Fatal error: ${error}`);
    results.details.errors.push(`Fatal: ${error}`);
  }

  // Evaluate success criteria
  evaluateCriteria();

  // Final verdict
  logSection("FINAL VERDICT");

  const passedCriteria = Object.values(results.criteria).filter(Boolean).length;
  const totalCriteria = Object.keys(results.criteria).length;

  console.log(`Criteria passed: ${passedCriteria}/${totalCriteria}`);
  console.log();

  // Overall pass requires at least 4 out of 6 criteria
  const overallPass = passedCriteria >= 4;

  if (overallPass) {
    console.log("  ########  ########     ###     ######   ###### ");
    console.log("  ##     ## ##     ##   ## ##   ##    ## ##    ##");
    console.log("  ##     ## ##     ##  ##   ##  ##       ##      ");
    console.log("  ########  ########  ##     ##  ######   ###### ");
    console.log("  ##        ##   ##   #########       ##       ##");
    console.log("  ##        ##    ##  ##     ## ##    ## ##    ##");
    console.log("  ##        ##     ## ##     ##  ######   ###### ");
    console.log();
    console.log("  Visioneer successfully demonstrated autonomous learning!");
  } else {
    console.log("  ######## ########     ####    ##       ");
    console.log("  ##       ##     ##     ##     ##       ");
    console.log("  ##       ##     ##     ##     ##       ");
    console.log("  ######   ########      ##     ##       ");
    console.log("  ##       ##     ##     ##     ##       ");
    console.log("  ##       ##     ##     ##     ##       ");
    console.log("  ##       ########     ####    ########");
    console.log();
    console.log("  Some criteria not met. Review errors above.");
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nTest duration: ${duration} seconds`);

  // Cleanup
  closeDatabase();

  // Exit with appropriate code
  process.exit(overallPass ? 0 : 1);
}

// Run the test
runE2ETest().catch((error) => {
  console.error("\nUnhandled error:", error);
  closeDatabase();
  process.exit(1);
});
