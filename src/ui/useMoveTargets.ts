import { useEffect, useState } from "react";
import type { TreeEntry } from "../shared.js";
import type { FileDialogState } from "./file-action-menus.js";
import { errorText, parent } from "./file-utils.js";

export const validMoveDirectory = (source: string, directory: string) =>
  !!source && directory !== source && !directory.startsWith(`${source}/`);
export const canMoveTo = (source: string, directory: string) =>
  validMoveDirectory(source, directory) && parent(source) !== directory;

export function useMoveTargets(
  dialog: FileDialogState | null,
  readDirectory: (path: string) => Promise<TreeEntry[]>,
) {
  const [state, setState] = useState<{
    path: string;
    source: string;
    destinations: TreeEntry[];
    loading: boolean;
    error: string;
  }>({ path: "", source: "", destinations: [], loading: false, error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (dialog?.kind !== "move") return;
    let cancelled = false;
    setState({
      path: dialog.value,
      source: dialog.path,
      destinations: [],
      loading: true,
      error: "",
    });
    void readDirectory(dialog.value)
      .then((directories) => {
        if (cancelled) return;
        setState({
          path: dialog.value,
          source: dialog.path,
          loading: false,
          error: "",
          destinations: directories.filter(
            (node) =>
              node.directory &&
              !node.deleted &&
              validMoveDirectory(dialog.path, node.path),
          ),
        });
      })
      .catch((error) => {
        if (!cancelled)
          setState({
            path: dialog.value,
            source: dialog.path,
            destinations: [],
            loading: false,
            error: errorText(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [dialog?.kind, dialog?.path, dialog?.value, readDirectory, retry]);
  const current =
    dialog?.kind === "move" &&
    state.path === dialog.value &&
    state.source === dialog.path;
  return {
    destinations: current ? state.destinations : [],
    destinationsLoading: dialog?.kind === "move" && (!current || state.loading),
    destinationsError: current ? state.error : "",
    retryDestinations: () => setRetry((old) => old + 1),
    canSubmitMove:
      !!current &&
      !state.loading &&
      !state.error &&
      canMoveTo(dialog!.path, dialog!.value),
  };
}
