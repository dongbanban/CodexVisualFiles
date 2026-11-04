import { fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";

export async function entrypointDirectory(
  explicit: string | undefined,
  metadata: Record<string, unknown> | undefined,
  listRoots?: () => Promise<Array<{ uri: string }>>,
) {
  if (explicit) return explicit;
  let turn: Record<string, unknown> = {};
  const value = metadata?.["x-codex-turn-metadata"];
  if (value && typeof value === "object")
    turn = value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        turn = parsed;
    } catch {
      /* Older clients may not send JSON metadata. */
    }
  }
  const cwd =
    metadata?.cwd ??
    metadata?.workingDirectory ??
    turn.cwd ??
    turn.workingDirectory ??
    turn.working_directory;
  if (typeof cwd === "string" && isAbsolute(cwd)) return cwd;
  if (listRoots) {
    try {
      const roots = await listRoots();
      if (roots.length === 1 && roots[0].uri.startsWith("file:"))
        return fileURLToPath(roots[0].uri);
    } catch {
      /* The directory chooser remains available when the host has no roots API. */
    }
  }
  return undefined;
}
