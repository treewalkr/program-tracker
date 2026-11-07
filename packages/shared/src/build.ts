/**
 * Build ID = app version + commit, SemVer build metadata: "0.1.3+42a93f5".
 * The version is the root package.json's (bumped by `bun run release`);
 * the commit tells two builds of the same version apart.
 */
export function buildId(version: string, commit: string | null | undefined): string {
  const sha = commit?.trim().slice(0, 7);
  return sha ? `${version}+${sha}` : version;
}
