#!/usr/bin/env tsx

/**
 * Quick Test Project Setup
 *
 * Creates a simple project for testing the agent cycle.
 */

import { initializeSchema, closeDatabase } from "../db/connection.js";
import { createProject, saveOrientation, createTask } from "../db/queries.js";
import { Orientation, Phase } from "../utils/types.js";

function setup() {
  initializeSchema();

  console.log("Creating test project...");

  const project = createProject();
  console.log(`Project ID: ${project.id}`);

  const orientation: Orientation = {
    project_id: project.id,
    vision_summary: "Learn the fundamentals of jazz piano improvisation",
    success_criteria: [
      "Play ii-V-I progressions in all 12 keys",
      "Comp through a 12-bar blues",
      "Take a basic solo over Autumn Leaves",
    ],
    constraints: [
      "1 hour practice per day",
      "No formal teacher - self-directed learning",
    ],
    skill_map: [
      {
        skill: "Jazz Harmony",
        parent: null,
        dependencies: [],
        status: "not_started",
        notes: "Understanding chord progressions",
      },
      {
        skill: "Voicings",
        parent: "Jazz Harmony",
        dependencies: ["Jazz Harmony"],
        status: "not_started",
        notes: "Shell voicings, rootless voicings",
      },
      {
        skill: "Blues Form",
        parent: null,
        dependencies: [],
        status: "not_started",
        notes: "12-bar structure",
      },
    ],
    current_phase: "research" as Phase,
    key_decisions: [],
    active_priorities: ["Jazz Harmony", "Blues Form"],
    progress_snapshot: [],
    last_rewritten: new Date().toISOString(),
    version: 1,
  };

  saveOrientation(orientation);
  console.log("Orientation saved.");

  // Create some ready tasks
  const task1 = createTask(
    project.id,
    "Research the ii-V-I chord progression",
    "Learn what makes the ii-V-I the most important progression in jazz. Understand why it works harmonically and how to recognize it.",
    "Jazz Harmony"
  );
  console.log(`Task 1: ${task1.title} (${task1.status})`);

  const task2 = createTask(
    project.id,
    "Study the 12-bar blues form",
    "Learn the standard 12-bar blues chord progression. Understand the I-IV-V structure and common variations like the quick-change.",
    "Blues Form"
  );
  console.log(`Task 2: ${task2.title} (${task2.status})`);

  const task3 = createTask(
    project.id,
    "Learn shell voicings for major 7th chords",
    "Practice 3-7 shell voicings (root-3rd-7th) for major 7th chords. These are the foundation of jazz piano comping.",
    "Voicings",
    [task1.id] // Depends on understanding harmony first
  );
  console.log(`Task 3: ${task3.title} (${task3.status})`);

  console.log();
  console.log("Test project created! Run:");
  console.log("  npm run status");
  console.log("  npm run agent:cycle");

  closeDatabase();
}

setup();
