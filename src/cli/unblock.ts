/**
 * CLI command to unblock tasks that have satisfied dependencies
 *
 * Usage: npm run unblock
 *
 * Options:
 *   --force    Force unblock all blocked tasks (removes dependencies)
 *   --show     Just show blocked tasks without unblocking
 */

import Database from 'better-sqlite3';
import path from 'path';

interface Task {
  id: string;
  title: string;
  status: string;
  depends_on: string;
  blocked_by: string;
}

function main() {
  const args = process.argv.slice(2);
  const forceUnblock = args.includes('--force');
  const showOnly = args.includes('--show');

  const dbPath = path.join(process.cwd(), 'visioneer.db');
  const db = new Database(dbPath);

  try {
    // Get the active project
    const project = db.prepare(`
      SELECT id FROM projects ORDER BY created_at DESC LIMIT 1
    `).get() as { id: string } | undefined;

    if (!project) {
      console.log('No project found');
      return;
    }

    console.log(`Project: ${project.id.substring(0, 8)}...\n`);

    // Get blocked tasks
    const blockedTasks = db.prepare(`
      SELECT id, title, status, depends_on, blocked_by
      FROM tasks
      WHERE project_id = ? AND status = 'blocked'
    `).all(project.id) as Task[];

    if (blockedTasks.length === 0) {
      console.log('No blocked tasks found.');
      return;
    }

    console.log(`Found ${blockedTasks.length} blocked tasks:\n`);

    // Analyze each blocked task
    let canUnblock: Task[] = [];
    let stillBlocked: Task[] = [];

    for (const task of blockedTasks) {
      const dependsOn = JSON.parse(task.depends_on || '[]') as string[];
      const blockedBy = JSON.parse(task.blocked_by || '[]') as string[];

      console.log(`📋 ${task.title}`);
      console.log(`   ID: ${task.id.substring(0, 8)}`);

      // Check if blocked by questions (need answers)
      if (blockedBy.length > 0) {
        console.log(`   ❓ Blocked by ${blockedBy.length} question(s) - needs answers`);
        stillBlocked.push(task);
        continue;
      }

      // Check dependency status
      if (dependsOn.length === 0) {
        console.log(`   ✅ No dependencies - can unblock`);
        canUnblock.push(task);
      } else {
        // Check each dependency
        const depStatuses = db.prepare(`
          SELECT id, title, status FROM tasks
          WHERE id IN (${dependsOn.map(() => '?').join(',')})
        `).all(...dependsOn) as { id: string; title: string; status: string }[];

        const allDone = depStatuses.every(d => d.status === 'done');
        const notDone = depStatuses.filter(d => d.status !== 'done');

        if (allDone) {
          console.log(`   ✅ All ${dependsOn.length} dependencies done - can unblock`);
          canUnblock.push(task);
        } else {
          console.log(`   ⏳ Waiting on ${notDone.length} dependencies:`);
          notDone.forEach(d => {
            console.log(`      - ${d.title} (${d.status})`);
          });
          stillBlocked.push(task);
        }
      }
      console.log('');
    }

    // Summary
    console.log('─'.repeat(60));
    console.log(`\nSummary:`);
    console.log(`  Can unblock: ${canUnblock.length}`);
    console.log(`  Still blocked: ${stillBlocked.length}`);

    if (showOnly) {
      console.log('\n(--show mode, not making changes)');
      return;
    }

    // Unblock tasks
    if (forceUnblock) {
      // Force unblock ALL blocked tasks
      console.log('\n⚠️  Force unblocking all blocked tasks...\n');

      const result = db.prepare(`
        UPDATE tasks
        SET status = 'ready', depends_on = '[]', blocked_by = '[]'
        WHERE project_id = ? AND status = 'blocked'
      `).run(project.id);

      console.log(`✅ Force unblocked ${result.changes} tasks`);
    } else if (canUnblock.length > 0) {
      // Unblock only tasks with satisfied dependencies
      console.log('\nUnblocking tasks with satisfied dependencies...\n');

      const updateStmt = db.prepare(`
        UPDATE tasks SET status = 'ready' WHERE id = ?
      `);

      for (const task of canUnblock) {
        updateStmt.run(task.id);
        console.log(`✅ Unblocked: ${task.title}`);
      }

      console.log(`\nUnblocked ${canUnblock.length} tasks.`);
    } else {
      console.log('\nNo tasks can be unblocked (dependencies not satisfied).');
      console.log('Use --force to unblock all tasks anyway.');
    }

    // Show remaining task status
    const remaining = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks
      WHERE project_id = ?
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'in_progress' THEN 1
          WHEN 'ready' THEN 2
          WHEN 'blocked' THEN 3
          WHEN 'done' THEN 4
          ELSE 5
        END
    `).all(project.id) as { status: string; count: number }[];

    console.log('\nTask status:');
    remaining.forEach(r => {
      const icon = r.status === 'done' ? '✅' :
                   r.status === 'ready' ? '🟢' :
                   r.status === 'in_progress' ? '🔵' :
                   r.status === 'blocked' ? '🔴' : '⚪';
      console.log(`  ${icon} ${r.status}: ${r.count}`);
    });

    console.log('\nRun: npm run agent:cycle');

  } finally {
    db.close();
  }
}

main();
