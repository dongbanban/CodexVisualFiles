export const VERSION = "0.7.5";
export type Version = "head" | "current";
export interface Slot {
  path: string;
  version: Version;
  opened: number;
  scroll: number;
}
export interface ViewerState {
  slots: [Slot | null, Slot | null];
  active: 0 | 1;
  clock: number;
  diff: boolean;
}
export const emptyViewer = (): ViewerState => ({
  slots: [null, null],
  active: 0,
  clock: 0,
  diff: false,
});
export function openFile(
  state: ViewerState,
  path: string,
  hasDiff: boolean,
): ViewerState {
  const clock = state.clock + 1;
  const slot: Slot = { path, version: "current", opened: clock, scroll: 0 };
  if (hasDiff)
    return {
      slots: [{ ...slot, version: "head" }, slot],
      clock,
      active: 1,
      diff: true,
    };
  if (!state.diff && state.slots[0]?.path === path && !state.slots[1])
    return state;
  return { slots: [slot, null], active: 0, clock, diff: false };
}
export function normalizeViewer(state: ViewerState): ViewerState {
  if (
    state.diff &&
    state.slots[0] &&
    state.slots[1] &&
    state.slots[0].path === state.slots[1].path
  )
    return state;
  const selected =
    state.slots[state.active] ?? state.slots[0] ?? state.slots[1];
  return {
    ...state,
    slots: [selected ? { ...selected, version: "current" } : null, null],
    active: 0,
    diff: false,
  };
}
export interface SavedState {
  expanded: string[];
  viewer: ViewerState;
  onlyChanged: boolean;
  includeIgnored: boolean;
  searchMode: "name" | "text";
  treeWidth: number;
}
export const emptyState = (): SavedState => ({
  expanded: [""],
  viewer: emptyViewer(),
  onlyChanged: false,
  includeIgnored: false,
  searchMode: "name",
  treeWidth: 270,
});
export interface GitEntry {
  status: string;
  oldPath?: string;
}
export interface WorkspaceInfo {
  root: string;
  name: string;
  branch: string | null;
  head: string | null;
  worktree: boolean;
  git: boolean;
  changes: Record<string, GitEntry>;
}
export interface TreeEntry {
  path: string;
  name: string;
  directory: boolean;
  symlink: boolean;
  ignored: boolean;
  status: string;
  deleted: boolean;
}
export interface FileVersion {
  exists: boolean;
  text: string;
  revision?: string;
  image?: string;
  binary: boolean;
  size: number;
  tooLarge?: boolean;
}
export interface FileData {
  path: string;
  head: FileVersion;
  current: FileVersion;
  hasDiff: boolean;
}
export interface SearchResult {
  path: string;
  line?: number;
  text?: string;
}
export interface Snapshot {
  info: WorkspaceInfo;
  directories: Record<string, TreeEntry[]>;
  files: Record<string, FileData>;
  errors: Record<string, string>;
}
export interface Binding {
  bindingId: string;
  root: string | null;
  state: SavedState;
  info: WorkspaceInfo | null;
  message?: string;
  preferredRoot?: string;
  projectName?: string;
}
export interface LocalProject {
  id: string;
  name: string;
  roots: string[];
}
export interface DefinitionLocation {
  from: number;
  to: number;
}
