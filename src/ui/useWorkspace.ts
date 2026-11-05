import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyState,
  emptyViewer,
  normalizeViewer,
  openFile,
  type Binding,
  type SavedState,
  type Snapshot,
  type FileData,
  type Slot,
  type SearchResult,
  type DefinitionLocation,
} from "../shared.js";
import { type CodeSelection } from "./CodeView.js";
import { toast } from "sonner";
import { rpc } from "./bridge.js";
import { ancestors, errorText } from "./file-utils.js";

export function useWorkspace(binding: Binding) {
  const alive = useRef(true);
  const [stored, setStored] = useState<SavedState>({
    ...(binding.state ?? emptyState()),
    viewer: normalizeViewer(binding.state?.viewer ?? emptyViewer()),
  });
  const [snapshot, setSnapshot] = useState<Snapshot>({
    info: binding.info!,
    directories: {},
    files: {},
    errors: {},
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [truncated, setTruncated] = useState(false);
  const setNotice = useCallback((value: string) => {
    if (alive.current && value) toast.message(value, { duration: 3000 });
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const [reading, setReading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState("");

  const [line, setLine] = useState<number>();

  const stateRef = useRef(stored);
  stateRef.current = stored;
  const filesRef = useRef(snapshot.files);
  filesRef.current = snapshot.files;
  const selection = useRef<CodeSelection | null>(null);
  const openQueue = useRef(Promise.resolve());
  const polling = useRef<Promise<boolean> | null>(null);
  const refreshError = useRef<string | null>(null);
  const scrollTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      alive.current = false;
      scrollTimers.current.forEach(clearTimeout);
    },
    [],
  );
  const call = useCallback(
    <T>(name: string, args: Record<string, unknown>) =>
      rpc<T>(name, { bindingId: binding.bindingId, ...args }),
    [binding.bindingId],
  );
  const findDefinition = useCallback(
    async (slot: Slot, position: number, revision: string) => {
      const data = await call<{ definition: DefinitionLocation | null }>(
        "visualfiles_read",
        {
          action: "definition",
          path: slot.path,
          version: slot.version,
          position,
          revision,
        },
      );
      return data.definition;
    },
    [call],
  );
  const refresh = useCallback((): Promise<boolean> => {
    if (polling.current) return polling.current;
    setRefreshing(true);
    const request = (async () => {
      try {
        const state = stateRef.current;
        const data = await call<Snapshot>("visualfiles_read", {
          action: "snapshot",
          directories: state.expanded,
          paths: [
            ...new Set(
              state.viewer.slots.flatMap((slot) => (slot ? [slot.path] : [])),
            ),
          ],
        });
        if (alive.current) {
          setSnapshot((old) => {
            const visible = new Set(
              stateRef.current.viewer.slots.flatMap((slot) =>
                slot ? [slot.path] : [],
              ),
            );
            return {
              ...data,
              directories:
                Object.keys(data.directories).length ===
                  Object.keys(old.directories).length &&
                Object.entries(data.directories).every(
                  ([path, entries]) =>
                    JSON.stringify(entries) ===
                    JSON.stringify(old.directories[path]),
                )
                  ? old.directories
                  : data.directories,
              errors:
                Object.keys(data.errors).length ===
                  Object.keys(old.errors).length &&
                Object.entries(data.errors).every(
                  ([path, error]) => old.errors[path] === error,
                )
                  ? old.errors
                  : data.errors,
              files: Object.fromEntries(
                Object.entries({ ...old.files, ...data.files }).filter(
                  ([path]) => visible.has(path),
                ),
              ),
            };
          });
          setStored((old) => {
            const current = old.viewer.slots[1];
            const file = current && data.files[current.path];
            if (!old.viewer.diff || !file || file.head.exists) return old;
            return {
              ...old,
              viewer: {
                ...old.viewer,
                slots: [current, null],
                active: 0,
                diff: false,
              },
            };
          });
        }
        refreshError.current = null;
        return true;
      } catch (error) {
        const text = errorText(error);
        if (alive.current && refreshError.current !== text) setNotice(text);
        refreshError.current = text;
        return false;
      } finally {
        polling.current = null;
        if (alive.current) setRefreshing(false);
      }
    })();
    polling.current = request;
    return request;
  }, [call, setNotice]);
  const manualRefresh = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      if (await refresh()) setNotice("刷新完成");
      else setNotice(refreshError.current ?? "刷新失败");
    } finally {
      if (alive.current) setManualRefreshing(false);
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    void refresh();
  }, [
    stored.expanded.join("\0"),
    stored.viewer.slots.map((slot) => slot?.path).join("\0"),
    refresh,
  ]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void call("visualfiles_save_state", { state: stored }).catch((error) => {
        if (alive.current) setNotice(`浏览状态保存失败：${errorText(error)}`);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [stored, call]);
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void call<{ results: SearchResult[]; truncated: boolean }>(
        "visualfiles_read",
        {
          action: "search",
          query,
          mode: stored.searchMode,
          includeIgnored: stored.includeIgnored,
        },
      )
        .then((data) => {
          if (!cancelled) {
            setResults(data.results);
            setTruncated(data.truncated);
          }
        })
        .catch((error) => {
          if (!cancelled) setNotice(errorText(error));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, stored.searchMode, stored.includeIgnored, call]);

  const open = useCallback(
    (path: string, targetLine?: number) => {
      setSelected(path);
      setReading(true);
      setLine(targetLine);
      selection.current = null;
      openQueue.current = openQueue.current
        .then(async () => {
          const data = await call<FileData>("visualfiles_read", {
            action: "file",
            path,
          });
          if (!alive.current) return;
          setSnapshot((old) => ({
            ...old,
            files: { ...old.files, [path]: data },
          }));
          setStored((old) => ({
            ...old,
            expanded: [...new Set([...old.expanded, ...ancestors(path)])],
            viewer: openFile(old.viewer, path, data.hasDiff),
          }));
        })
        .catch((error) => {
          if (alive.current) setNotice(errorText(error));
        })
        .finally(() => {
          if (alive.current) setReading(false);
        });
    },
    [call],
  );
  const onScroll = useCallback((index: number, top: number) => {
    clearTimeout(scrollTimers.current[index]);
    scrollTimers.current[index] = setTimeout(() => {
      if (!alive.current) return;
      setStored((old) => {
        const slots = [...old.viewer.slots] as [Slot | null, Slot | null];
        if (!slots[index] || Math.abs(slots[index]!.scroll - top) < 1)
          return old;
        slots[index] = { ...slots[index]!, scroll: top };
        return { ...old, viewer: { ...old.viewer, slots } };
      });
    }, 250);
  }, []);
  const toggle = (path: string) => {
    setSelected(path);
    setStored((old) => ({
      ...old,
      expanded: old.expanded.includes(path)
        ? old.expanded.filter((item) => item !== path)
        : [...old.expanded, path],
    }));
  };

  return {
    binding,
    alive,
    stored,
    setStored,
    snapshot,
    query,
    setQuery,
    results,
    truncated,
    refreshing,
    manualRefreshing,
    manualRefresh,
    reading,
    searching,
    selected,
    setSelected,
    line,
    filesRef,
    selection,
    call,
    refresh,
    open,
    onScroll,
    toggle,
    findDefinition,
    setNotice,
  };
}

export type WorkspaceModel = ReturnType<typeof useWorkspace>;
