#!/usr/bin/env tsx

/**
 * Artifact Cleanup CLI
 *
 * Lists artifacts, shows superseded/archived status, and provides cleanup options.
 *
 * Usage:
 *   npm run artifacts:cleanup              # List all artifacts by topic
 *   npm run artifacts:cleanup --status     # Show status summary
 *   npm run artifacts:cleanup --archive    # Archive superseded files
 *   npm run artifacts:cleanup --delete     # Delete archived files older than 30 days
 *   npm run artifacts:cleanup --dry-run    # Show what would be done without doing it
 */

import { resolve } from 'path';
import { ArtifactManager, ArtifactGroup, CleanupAction, ArtifactRecord } from '../artifacts/index.js';

const ARTIFACTS_DIR = resolve(process.cwd(), 'artifacts');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'active': return '\u2705'; // Green check
    case 'superseded': return '\u26A0\uFE0F'; // Warning
    case 'archived': return '\uD83D\uDCE6'; // Box
    case 'deleted': return '\u274C'; // X
    default: return '\u2753'; // Question
  }
}

function typeIcon(type: string): string {
  switch (type) {
    case 'research': return '\uD83D\uDD0D';
    case 'guide': return '\uD83D\uDCD6';
    case 'spec': return '\uD83D\uDCCB';
    case 'code': return '\uD83D\uDCBB';
    case 'config': return '\u2699\uFE0F';
    case 'data': return '\uD83D\uDCCA';
    case 'test': return '\uD83E\uDDEA';
    default: return '\uD83D\uDCC4';
  }
}

function printGroup(group: ArtifactGroup): void {
  const statusSummary = [
    group.activeCount > 0 ? `${group.activeCount} active` : '',
    group.supersededCount > 0 ? `${group.supersededCount} superseded` : '',
    group.archivedCount > 0 ? `${group.archivedCount} archived` : '',
  ].filter(Boolean).join(', ');

  console.log(`\n\u250C${'─'.repeat(70)}\u2510`);
  console.log(`\u2502 \uD83D\uDCC1 ${group.topic.toUpperCase().padEnd(50)} ${formatBytes(group.totalSize).padStart(10)} \u2502`);
  console.log(`\u2502    ${statusSummary.padEnd(60)} \u2502`);
  console.log(`\u251C${'─'.repeat(70)}\u2524`);

  for (const artifact of group.artifacts) {
    const icon = statusIcon(artifact.status);
    const tIcon = typeIcon(artifact.type);
    const name = artifact.filename.length > 45
      ? '...' + artifact.filename.slice(-42)
      : artifact.filename;

    console.log(`\u2502 ${icon} ${tIcon} ${name.padEnd(48)} ${artifact.status.padEnd(10)} \u2502`);

    if (artifact.metadata.supersedes) {
      console.log(`\u2502      \u2514\u2500 supersedes: ${artifact.metadata.supersedes.slice(0, 45).padEnd(45)} \u2502`);
    }
    if (artifact.metadata.superseded_by) {
      console.log(`\u2502      \u2514\u2500 replaced by: ${artifact.metadata.superseded_by.slice(0, 43).padEnd(43)} \u2502`);
    }
  }

  console.log(`\u2514${'─'.repeat(70)}\u2518`);
}

function printStatusSummary(artifacts: ArtifactRecord[]): void {
  const byStatus = new Map<string, number>();
  const byType = new Map<string, number>();
  let totalSize = 0;

  for (const a of artifacts) {
    byStatus.set(a.status, (byStatus.get(a.status) || 0) + 1);
    byType.set(a.type, (byType.get(a.type) || 0) + 1);
    totalSize += a.size_bytes;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('  ARTIFACT STATUS SUMMARY');
  console.log('═'.repeat(50));

  console.log('\nBy Status:');
  for (const [status, count] of byStatus) {
    console.log(`  ${statusIcon(status)} ${status.padEnd(15)} ${count}`);
  }

  console.log('\nBy Type:');
  for (const [type, count] of byType) {
    console.log(`  ${typeIcon(type)} ${type.padEnd(15)} ${count}`);
  }

  console.log(`\nTotal: ${artifacts.length} artifacts (${formatBytes(totalSize)})`);
  console.log('═'.repeat(50));
}

function printCleanupActions(actions: CleanupAction[], dryRun: boolean): void {
  if (actions.length === 0) {
    console.log('\n\u2705 No cleanup actions needed!');
    return;
  }

  console.log('\n' + '═'.repeat(50));
  console.log(dryRun ? '  CLEANUP PREVIEW (dry run)' : '  CLEANUP ACTIONS');
  console.log('═'.repeat(50));

  const archives = actions.filter(a => a.action === 'archive');
  const deletes = actions.filter(a => a.action === 'delete');

  if (archives.length > 0) {
    console.log(`\n\uD83D\uDCE6 To Archive (${archives.length}):`);
    for (const { artifact, reason } of archives) {
      console.log(`  • ${artifact.filename}`);
      console.log(`    └─ ${reason}`);
    }
  }

  if (deletes.length > 0) {
    console.log(`\n\uD83D\uDDD1\uFE0F To Delete (${deletes.length}):`);
    for (const { artifact, reason } of deletes) {
      console.log(`  • ${artifact.filename}`);
      console.log(`    └─ ${reason}`);
    }
  }

  console.log('═'.repeat(50));
}

async function main() {
  const args = process.argv.slice(2);
  const showStatus = args.includes('--status');
  const doArchive = args.includes('--archive');
  const doDelete = args.includes('--delete');
  const dryRun = args.includes('--dry-run');

  console.log('\uD83D\uDCC1 Artifact Lifecycle Manager');
  console.log(`   Directory: ${ARTIFACTS_DIR}`);

  const manager = new ArtifactManager(ARTIFACTS_DIR);
  const artifacts = manager.scanArtifacts();

  console.log(`   Found: ${artifacts.length} artifacts`);

  if (showStatus) {
    printStatusSummary(artifacts);
    return;
  }

  if (doArchive || doDelete) {
    const actions = manager.generateCleanupActions(artifacts);
    printCleanupActions(actions, dryRun);

    if (!dryRun) {
      if (doArchive) {
        const archiveActions = actions.filter(a => a.action === 'archive');
        for (const { artifact } of archiveActions) {
          console.log(`\uD83D\uDCE6 Archiving: ${artifact.filename}`);
          manager.moveToArchive(artifact);
        }
        console.log(`\n\u2705 Archived ${archiveActions.length} artifacts`);
      }

      if (doDelete) {
        console.log('\n\u26A0\uFE0F Delete functionality disabled for safety.');
        console.log('   Manually remove files from artifacts/_archive/ if needed.');
      }
    }
    return;
  }

  // Default: list all artifacts by topic
  const groups = manager.groupByTopic(artifacts);
  groups.sort((a, b) => b.artifacts.length - a.artifacts.length);

  for (const group of groups) {
    printGroup(group);
  }

  // Show summary
  printStatusSummary(artifacts);

  // Show cleanup suggestions
  const actions = manager.generateCleanupActions(artifacts);
  if (actions.length > 0) {
    console.log(`\n\uD83D\uDCA1 ${actions.length} cleanup actions available.`);
    console.log('   Run with --archive to move superseded files to _archive/');
    console.log('   Run with --dry-run to preview without changes');
  }
}

main().catch(console.error);
