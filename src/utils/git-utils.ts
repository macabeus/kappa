import * as vscode from 'vscode';
import type { Change, GitExtension, Repository } from '../git';

export function getRepositoryForFile(path: string): Repository | null {
  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
  const api = gitExtension?.getAPI(1);

  if (api?.state !== 'initialized') {
    return null;
  }

  const repo = api.repositories.find((r) => path.startsWith(r.rootUri.fsPath)) ?? null;

  return repo;
}

/**
 * Get the changes of files in a commit
 * @param repo
 * @param commitHash
 * @returns Return a map of parent commit hashes to their file changes relative to the given commit hash.
 */
export async function getFileChangesFromCommit(
  repo: Repository,
  commitHash: string,
): Promise<Record<string, Change[]>> {
  const commit = await repo.getCommit(commitHash);
  if (!commit || commit.parents.length === 0) {
    // TODO: If there are no parent commit, it should returns all files in the commit
    return {};
  }

  const result: Record<string, Change[]> = {};

  const promises = commit.parents.map(async (parent) => {
    const changes = await repo.diffBetween(parent, commitHash);
    result[parent] = changes;
  });

  await Promise.allSettled(promises);

  return result;
}
