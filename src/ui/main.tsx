import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { usePanelRef } from "react-resizable-panels";
import {
  App as McpApp,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions } from "@openai/mcp-extensions/app";
import {
  Folder,
  FolderOpen,
  FileCode2,
  FileText,
  FileImage,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  X,
  MoreHorizontal,
  FilePlus2,
  FolderPlus,
  Pencil,
  Move,
  Trash2,
  Copy,
  ClipboardPaste,
  Scissors,
  MessageSquare,
  GitBranch,
  Columns2,
  ChevronsDownUp,
  Eye,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  VERSION,
  emptyState,
  emptyViewer,
  normalizeViewer,
  openFile,
  type Binding,
  type SavedState,
  type Snapshot,
  type FileData,
  type Slot,
  type FileVersion,
  type TreeEntry,
  type SearchResult,
  type LocalProject,
  type DefinitionLocation,
} from "../shared.js";
import { CodeView, type CodeSelection } from "./CodeView.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import { Checkbox } from "./components/ui/checkbox.js";
import { Label } from "./components/ui/label.js";
import { Badge } from "./components/ui/badge.js";
import { ScrollArea } from "./components/ui/scroll-area.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible.js";
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog.js";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "./components/ui/resizable.js";
import { Toaster } from "./components/ui/sonner.js";
import { toast } from "sonner";
import { ThemeProvider } from "next-themes";
import { cn } from "cn";
import {
  IconButton,
  ActionDropdown,
  FileContext,
  type MenuAction,
} from "./chrome.js";
import {
  addReferenceDraft,
  type ConversationReference,
  type ConversationTarget,
} from "../conversation.js";

const INTERNAL_DRAG_TYPE = "application/x-visualfiles";
const bridge = new McpApp({ name: "visualfiles", version: VERSION }, {});
const extensions = new OpenAIExtensions(bridge);
let initialBinding: Binding | null = null;
let receiveBinding: ((binding: Binding) => void) | null = null;
bridge.ontoolresult = (result) => {
  const data = result.structuredContent;
  if (data && typeof data === "object" && "bindingId" in data) {
    initialBinding = data as unknown as Binding;
    receiveBinding?.(initialBinding);
  }
};
bridge.onhostcontextchanged = (context) => {
  if (context.theme) {
    applyDocumentTheme(context.theme);
    document.documentElement.classList.toggle("dark", context.theme === "dark");
  }
};
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await bridge.callServerTool({ name, arguments: args });
  if (result.isError)
    throw new Error(
      result.content
        ?.filter((item) => item.type === "text")
        .map((item) => (item as { text: string }).text)
        .join("\n") || "操作失败",
    );
  return result.structuredContent as T;
}
const parent = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const base = (path: string) => path.split("/").pop() || "";
const joinPath = (directory: string, name: string) =>
  directory ? `${directory}/${name}` : name;
const ancestors = (path: string) => {
  const result = [""];
  let directory = parent(path);
  while (directory) {
    result.push(directory);
    directory = parent(directory);
  }
  return result;
};
const textVersion = (data: FileData | undefined, slot: Slot | null) =>
  !data || !slot ? null : data[slot.version];
const markdown = (path: string) => /\.(md|mdx|markdown)$/i.test(path);
function localReference(path: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) return null;
  const parts = href.startsWith("/")
    ? []
    : parent(path).split("/").filter(Boolean);
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
interface Dialog {
  kind: "createFile" | "createDirectory" | "rename" | "move" | "trash";
  path: string;
  value: string;
}

function RelatedImage({
  path,
  src,
  alt,
  bindingId,
}: {
  path: string;
  src: string;
  alt: string;
  bindingId: string;
}) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    const relative = localReference(path, src);
    if (relative)
      void rpc<FileData>("visualfiles_read", {
        bindingId,
        action: "file",
        path: relative,
      })
        .then((data) => {
          if (!cancelled) setSource(data.current.image);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, src, bindingId]);
  return source ? (
    <img src={source} alt={alt} />
  ) : (
    <span className="text-muted-foreground">[图片：{alt || src}]</span>
  );
}
function Preview({
  slot,
  version,
  bindingId,
  onOpen,
}: {
  slot: Slot;
  version: FileVersion;
  bindingId: string;
  onOpen: (path: string, line?: number) => void;
}) {
  if (!version.exists)
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        文件不存在
      </div>
    );
  if (version.image)
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-muted/30 p-5 [&_img]:max-h-full [&_img]:max-w-full [&_img]:object-contain">
        <img src={version.image} alt={slot.path} />
      </div>
    );
  if (version.tooLarge)
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        文件大小 {(version.size / 1024 / 1024).toFixed(1)} MB，超过 12 MB
        预览上限。可复制路径在本机工具中查看。
      </div>
    );
  if (version.binary)
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        二进制文件 · {version.size.toLocaleString()} 字节
      </div>
    );
  return (
    <article className="h-full overflow-auto p-6 text-sm leading-7 break-words [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:my-4 [&_h2]:text-xl [&_img]:max-w-full [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4">
      <ReactMarkdown
        components={{
          img: ({ src, alt }) => (
            <RelatedImage
              path={slot.path}
              src={typeof src === "string" ? src : ""}
              alt={alt ?? ""}
              bindingId={bindingId}
            />
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                const relative = localReference(slot.path, href ?? "");
                if (relative) onOpen(relative);
                else if (href && /^https?:\/\//i.test(href))
                  void bridge.openLink({ url: href });
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {version.text}
      </ReactMarkdown>
    </article>
  );
}

function Panel({
  binding,
  dark,
  chooseWorkspace,
}: {
  binding: Binding;
  dark: boolean;
  chooseWorkspace: () => void;
}) {
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
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState("");
  const [clipboard, setClipboard] = useState<{
    mode: "copy" | "cut";
    path: string;
  } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [destinations, setDestinations] = useState<TreeEntry[]>([]);
  const [previews, setPreviews] = useState<Record<string, boolean>>({});
  const [line, setLine] = useState<number>();
  const [sidebar, setSidebar] = useState(true);
  const treePanel = usePanelRef();
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
    <T,>(name: string, args: Record<string, unknown>) =>
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
        if (alive.current)
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
  useEffect(() => {
    if (dialog?.kind !== "move") return;
    let cancelled = false;
    void call<Snapshot>("visualfiles_read", {
      action: "snapshot",
      directories: [dialog.value],
      paths: [],
    })
      .then((data) => {
        if (!cancelled)
          setDestinations(
            (data.directories[dialog.value] ?? []).filter(
              (node) => node.directory && !node.deleted,
            ),
          );
      })
      .catch((error) => setNotice(errorText(error)));
    return () => {
      cancelled = true;
    };
  }, [dialog?.kind, dialog?.value, call]);
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
  const absolutePath = (path: string) =>
    path ? `${binding.root!.replace(/\/$/, "")}/${path}` : binding.root!;
  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("已复制");
    } catch {
      setNotice("剪贴板不可用，请检查客户端的剪贴板权限");
    }
  };
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
  const copyEntry = (mode: "copy" | "cut", path: string) => {
    setClipboard({ mode, path });
    setNotice(
      `已${mode === "copy" ? "复制" : "剪切"} ${base(path)}，请在目标目录粘贴`,
    );
  };
  const relocate = (source: string, destination: string) => {
    const changed = (value: string) =>
      value === source || value.startsWith(`${source}/`)
        ? destination + value.slice(source.length)
        : value;
    setSelected((old) => changed(old));
    selection.current = null;
    setStored((old) => ({
      ...old,
      expanded: [
        ...new Set([...old.expanded.map(changed), ...ancestors(destination)]),
      ],
      viewer: {
        ...old.viewer,
        slots: old.viewer.slots.map((slot) =>
          slot ? { ...slot, path: changed(slot.path) } : null,
        ) as [Slot | null, Slot | null],
      },
    }));
  };
  const pasteEntry = async (directory: string) => {
    if (!clipboard || busy) return;
    const entry = clipboard;
    setBusy(true);
    try {
      const result = await call<{ path: string }>("visualfiles_mutate", {
        action: entry.mode === "cut" ? "move" : "copy",
        path: entry.path,
        destination: joinPath(directory, base(entry.path)),
      });
      if (entry.mode === "cut") {
        relocate(entry.path, result.path);
        setClipboard((current) => (current === entry ? null : current));
      }
      setSelected(result.path);
      setStored((old) => ({
        ...old,
        expanded: [...new Set([...old.expanded, ...ancestors(result.path)])],
      }));
      setNotice(`已粘贴 ${base(result.path)}`);
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  async function addToConversation(
    path: string,
    target: ConversationTarget,
    slot?: Slot,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const selectedCode =
        slot &&
        selection.current?.path === slot.path &&
        selection.current.version === slot.version &&
        selection.current.text
          ? selection.current
          : null;
      let reference: ConversationReference;
      if (slot?.version === "head") {
        const version = filesRef.current[path]?.head;
        if (!version?.exists || version.binary)
          throw new Error("请选择可引用的 HEAD 文本内容，或引用当前文件路径");
        reference = {
          absolutePath: absolutePath(path),
          directory: false,
          version: "head",
          text: selectedCode?.text ?? version.text,
        };
      } else {
        reference = await call<ConversationReference>("visualfiles_read", {
          action: "reference",
          path,
        });
      }
      if (selectedCode)
        reference = {
          ...reference,
          version: slot?.version,
          text: selectedCode.text,
          from: selectedCode.from,
          to: selectedCode.to,
        };
      if (reference.text && reference.text.length > 100000)
        throw new Error("引用内容过长，请先选中需要引用的代码范围");
      await addReferenceDraft(
        extensions.message,
        bridge.getHostCapabilities()?.experimental?.["openai/message"],
        reference,
        target,
      );
      if (alive.current)
        setNotice(
          target === "new"
            ? "已在新对话中添加引用草稿"
            : "已添加到当前对话草稿",
        );
    } catch (error) {
      if (alive.current) setNotice(errorText(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function submit() {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      let path = dialog.path;
      let destination: string | undefined;
      if (
        dialog.kind === "createFile" ||
        dialog.kind === "createDirectory" ||
        dialog.kind === "rename"
      ) {
        if (
          !dialog.value.trim() ||
          /[\/\0]/.test(dialog.value) ||
          [".", ".."].includes(dialog.value)
        )
          throw new Error("请输入有效的单个文件或目录名称");
        if (dialog.kind === "rename")
          destination = joinPath(parent(path), dialog.value);
        else path = joinPath(path, dialog.value);
      }
      if (dialog.kind === "move")
        destination = joinPath(dialog.value, base(dialog.path));
      await call("visualfiles_mutate", {
        action: dialog.kind === "rename" ? "move" : dialog.kind,
        path,
        destination,
      });
      setNotice(
        dialog.kind === "trash" ? "已删除，可在系统废纸篓中找回" : "操作完成",
      );
      if (destination) {
        relocate(dialog.path, destination);
      }
      await refresh();
      setDialog(null);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  const toggle = (path: string) => {
    setSelected(path);
    setStored((old) => ({
      ...old,
      expanded: old.expanded.includes(path)
        ? old.expanded.filter((item) => item !== path)
        : [...old.expanded, path],
    }));
  };
  const drag = (event: React.DragEvent, node: TreeEntry) => {
    event.dataTransfer.clearData();
    event.dataTransfer.setData(
      INTERNAL_DRAG_TYPE,
      JSON.stringify({ bindingId: binding.bindingId, path: node.path }),
    );
    event.dataTransfer.effectAllowed = "move";
  };
  const drop = async (event: React.DragEvent, directory: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    try {
      const raw = event.dataTransfer.getData(INTERNAL_DRAG_TYPE);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.bindingId !== binding.bindingId || typeof data.path !== "string")
        return;
      if (parent(data.path) === directory) return;
      setBusy(true);
      const destination = joinPath(directory, base(data.path));
      await call("visualfiles_mutate", {
        action: "move",
        path: data.path,
        destination,
      });
      relocate(data.path, destination);
      setStored((old) => ({
        ...old,
        expanded: [...new Set([...old.expanded, directory])],
      }));
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const conversationActions = (path: string, slot?: Slot): MenuAction[] => [
    {
      label: "添加到当前对话",
      Icon: MessageSquare,
      disabled: busy,
      action: () => void addToConversation(path, "active", slot),
    },
    {
      label: "创建新对话",
      Icon: MessageSquare,
      disabled: busy,
      action: () => void addToConversation(path, "new", slot),
    },
  ];
  const pathActions = (path: string): MenuAction[] => [
    {
      label: "复制绝对路径",
      Icon: Copy,
      action: () => void copyText(absolutePath(path)),
    },
    {
      label: "复制相对路径",
      Icon: Copy,
      action: () => void copyText(path || "."),
    },
  ];
  const entryActions = (path: string, directory: boolean): MenuAction[] => [
    ...(directory
      ? [
          {
            label: "新建文件",
            Icon: FilePlus2,
            disabled: busy,
            action: () => setDialog({ kind: "createFile", path, value: "" }),
          },
          {
            label: "新建文件夹",
            Icon: FolderPlus,
            disabled: busy,
            action: () =>
              setDialog({ kind: "createDirectory", path, value: "" }),
          },
        ]
      : []),
    {
      label: "复制",
      Icon: Copy,
      disabled: !path || busy,
      separator: directory,
      action: () => copyEntry("copy", path),
    },
    {
      label: "剪切",
      Icon: Scissors,
      disabled: !path || busy,
      action: () => copyEntry("cut", path),
    },
    {
      label: "粘贴",
      Icon: ClipboardPaste,
      disabled: !clipboard || busy,
      action: () => void pasteEntry(directory ? path : parent(path)),
    },
    ...pathActions(path).map((item, index) => ({
      ...item,
      separator: index === 0,
    })),
    ...conversationActions(path).map((item, index) => ({
      ...item,
      separator: index === 0,
    })),
    {
      label: "重命名",
      Icon: Pencil,
      disabled: !path || busy,
      separator: true,
      action: () => setDialog({ kind: "rename", path, value: base(path) }),
    },
    {
      label: "移动到…",
      Icon: Move,
      disabled: !path || busy,
      action: () => setDialog({ kind: "move", path, value: parent(path) }),
    },
    {
      label: "删除",
      Icon: Trash2,
      disabled: !path || busy,
      danger: true,
      action: () => setDialog({ kind: "trash", path, value: "" }),
    },
  ];
  const expandedPaths = useMemo(
    () => new Set(stored.expanded),
    [stored.expanded],
  );
  function tree(path: string): React.ReactNode {
    const nodes = snapshot.directories[path];
    if (!nodes)
      return (
        <p className="p-3 text-xs text-muted-foreground break-words">
          {snapshot.errors[path] ?? "正在读取…"}
        </p>
      );
    return nodes
      .filter((node) => !stored.onlyChanged || node.status)
      .map((node) => {
        const expanded = expandedPaths.has(node.path);
        const Icon = node.directory
          ? expanded
            ? FolderOpen
            : Folder
          : /\.(png|jpg|jpeg|svg|webp|gif|ico)$/i.test(node.name)
            ? FileImage
            : /\.(tsx?|jsx?|json|css|less|html|ya?ml)$/i.test(node.name)
              ? FileCode2
              : FileText;
        const actions = entryActions(node.path, node.directory);
        const cut =
          clipboard?.mode === "cut" &&
          (clipboard.path === node.path ||
            node.path.startsWith(`${clipboard.path}/`));
        const row = (
          <Button
            variant="ghost"
            size="sm"
            role="treeitem"
            aria-label={node.path}
            aria-selected={selected === node.path}
            aria-expanded={node.directory ? expanded : undefined}
            className={cn(
              "h-7 min-w-0 flex-1 justify-start gap-1.5 rounded-none px-2 text-xs font-normal",
              selected === node.path && "bg-accent text-accent-foreground",
              node.ignored && "text-muted-foreground opacity-55",
              cut && "opacity-40",
            )}
            onClick={() => {
              setSelected(node.path);
              if (!node.directory) open(node.path);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" && node.directory && !expanded)
                toggle(node.path);
              if (event.key === "ArrowLeft" && node.directory && expanded)
                toggle(node.path);
            }}
          >
            <span className="inline-flex size-3 shrink-0">
              {node.directory ? (
                expanded ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )
              ) : null}
            </span>
            <Icon
              className={cn(
                "size-3.5 shrink-0",
                node.directory
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
              )}
            />
            <span className={cn("truncate", node.deleted && "line-through")}>
              {node.name}
            </span>
            {node.symlink && (
              <Link2 className="size-2.5 shrink-0 text-muted-foreground" />
            )}
            {node.status && (
              <span
                className={cn(
                  "ml-auto text-[10px] font-semibold",
                  node.status === "D" || node.status === "U"
                    ? "text-destructive"
                    : node.status === "A"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400",
                )}
              >
                {node.status}
              </span>
            )}
          </Button>
        );
        return (
          <Collapsible
            key={node.path}
            open={node.directory && expanded}
            onOpenChange={(value) => {
              setSelected(node.path);
              setStored((old) => ({
                ...old,
                expanded: value
                  ? [...new Set([...old.expanded, node.path])]
                  : old.expanded.filter((item) => item !== node.path),
              }));
            }}
          >
            <FileContext actions={actions}>
              <div
                className="group/row flex min-w-0 items-center [content-visibility:auto] [contain-intrinsic-size:auto_28px]"
                draggable={!node.deleted}
                onDragStart={(event) => drag(event, node)}
                onDragOver={(event) => {
                  if (node.directory) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  if (node.directory) void drop(event, node.path);
                  else {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              >
                {node.directory ? <CollapsibleTrigger render={row} /> : row}
                <div className="shrink-0 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                  <ActionDropdown
                    label={`${node.path} 的操作`}
                    Icon={MoreHorizontal}
                    actions={actions}
                  />
                </div>
              </div>
            </FileContext>
            {node.directory && expanded && (
              <CollapsibleContent className="ml-4 border-l pl-1" role="group">
                {tree(node.path)}
              </CollapsibleContent>
            )}
          </Collapsible>
        );
      });
  }
  const treeContent = useMemo(
    () => tree(""),
    [
      snapshot.directories,
      snapshot.errors,
      stored.onlyChanged,
      expandedPaths,
      selected,
      clipboard,
      busy,
    ],
  );
  const slots = stored.viewer.slots;
  const versions = slots.map((slot) =>
    textVersion(slot ? snapshot.files[slot.path] : undefined, slot),
  ) as [FileVersion | null, FileVersion | null];
  const plainText = slots.every(
    (slot, index) =>
      !slot ||
      (!!versions[index] &&
        versions[index]!.exists &&
        !versions[index]!.binary &&
        !previews[`${slot.path}:${slot.version}`]),
  );
  const splitView = stored.viewer.diff && !!slots[0] && !!slots[1];
  const diff = splitView && plainText;
  const visibleSlots = splitView ? slots : [slots[0]];
  const activeSlot = slots[stored.viewer.active];
  const labels = {
    createFile: "新建文件",
    createDirectory: "新建文件夹",
    rename: "重命名",
    move: "移动到文件夹",
    trash: "删除",
  };
  return (
    <div className="flex h-dvh w-full flex-col overflow-x-auto overflow-y-hidden bg-background text-xs text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <IconButton
          label={sidebar ? "隐藏文件树" : "显示文件树"}
          onClick={() => setSidebar(!sidebar)}
        >
          {sidebar ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeftOpen className="size-4" />
          )}
        </IconButton>
        <Button
          variant="outline"
          size="xs"
          onClick={chooseWorkspace}
          title={binding.root!}
        >
          <FolderOpen className="size-3" />
          打开项目
        </Button>
        <span className="min-w-0 max-w-40 shrink-0 truncate font-medium">
          {binding.projectName ?? snapshot.info.name}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground"
          title={binding.root!}
        >
          {binding.root}
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate">
            {snapshot.info.branch ?? "非 Git 目录"}
          </span>
          {snapshot.info.worktree && (
            <Badge variant="outline" className="text-[9px]">
              worktree
            </Badge>
          )}
        </span>
        {manualRefreshing && (
          <span
            role="status"
            className="shrink-0 text-[11px] text-muted-foreground"
          >
            刷新中…
          </span>
        )}
        <IconButton
          label={refreshing ? "刷新中…" : "刷新文件树"}
          aria-busy={refreshing}
          disabled={refreshing}
          onClick={() => void manualRefresh()}
        >
          <RefreshCw
            className={cn(
              "size-4",
              refreshing && "animate-spin motion-reduce:animate-none",
            )}
          />
        </IconButton>
      </header>
      <ResizablePanelGroup
        orientation="horizontal"
        className={cn(
          "min-h-0 flex-1",
          sidebar ? "min-w-[561px]" : "min-w-[320px]",
        )}
        onLayoutChanged={(_, { isUserInteraction }) => {
          if (!isUserInteraction) return;
          // Read pixels after the library commits keyboard layout changes.
          queueMicrotask(() => {
            if (!alive.current || !treePanel.current) return;
            const width = Math.round(treePanel.current.getSize().inPixels);
            setStored((old) =>
              old.treeWidth === width ? old : { ...old, treeWidth: width },
            );
          });
        }}
      >
        {sidebar && (
          <>
            <ResizablePanel
              id="files"
              panelRef={treePanel}
              defaultSize={stored.treeWidth}
              minSize={240}
              groupResizeBehavior="preserve-pixel-size"
            >
              <aside className="flex h-full min-h-0 flex-col bg-muted/25">
                <div className="relative mx-2 mt-3">
                  <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-muted-foreground" />
                  <Input
                    aria-label="搜索项目文件"
                    className="h-8 pr-7 pl-7 text-xs"
                    placeholder={
                      stored.searchMode === "name"
                        ? "搜索文件名（区分大小写）…"
                        : "搜索项目内容…"
                    }
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setQuery("");
                    }}
                  />
                  {query && (
                    <div className="absolute top-1 right-1">
                      <IconButton label="清空搜索" onClick={() => setQuery("")}>
                        <X className="size-3" />
                      </IconButton>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 p-2 text-[10px] text-muted-foreground">
                  <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
                    <Button
                      size="xs"
                      variant={
                        stored.searchMode === "name" ? "secondary" : "ghost"
                      }
                      aria-pressed={stored.searchMode === "name"}
                      onClick={() =>
                        setStored((old) => ({ ...old, searchMode: "name" }))
                      }
                    >
                      文件名
                    </Button>
                    <Button
                      size="xs"
                      variant={
                        stored.searchMode === "text" ? "secondary" : "ghost"
                      }
                      aria-pressed={stored.searchMode === "text"}
                      onClick={() =>
                        setStored((old) => ({ ...old, searchMode: "text" }))
                      }
                    >
                      全文
                    </Button>
                  </div>
                  <Label className="gap-1 text-[10px]">
                    <Checkbox
                      className="size-3"
                      checked={stored.onlyChanged}
                      onCheckedChange={(value) =>
                        setStored((old) => ({ ...old, onlyChanged: value }))
                      }
                    />
                    仅改动
                  </Label>
                  <Label className="gap-1 text-[10px]">
                    <Checkbox
                      className="size-3"
                      checked={stored.includeIgnored}
                      onCheckedChange={(value) =>
                        setStored((old) => ({ ...old, includeIgnored: value }))
                      }
                    />
                    搜索忽略文件
                  </Label>
                </div>
                <FileContext actions={entryActions("", true)}>
                  <div
                    className="flex h-8 items-center gap-0.5 border-y px-1.5"
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => void drop(event, "")}
                  >
                    <Button
                      variant="ghost"
                      size="xs"
                      className="min-w-0 flex-1 justify-start truncate font-semibold"
                      onClick={() => {
                        setSelected("");
                        setQuery("");
                      }}
                    >
                      {snapshot.info.name}
                    </Button>
                    <IconButton
                      label="新建文件"
                      disabled={busy}
                      onClick={() =>
                        setDialog({ kind: "createFile", path: "", value: "" })
                      }
                    >
                      <FilePlus2 className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label="新建文件夹"
                      disabled={busy}
                      onClick={() =>
                        setDialog({
                          kind: "createDirectory",
                          path: "",
                          value: "",
                        })
                      }
                    >
                      <FolderPlus className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label="折叠所有目录"
                      onClick={() =>
                        setStored((old) => ({ ...old, expanded: [""] }))
                      }
                    >
                      <ChevronsDownUp className="size-3.5" />
                    </IconButton>
                  </div>
                </FileContext>
                <ScrollArea className="min-h-0 flex-1">
                  <div
                    className="min-h-full py-1 pr-[calc(0.625rem+8px)] pb-4"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => void drop(event, "")}
                  >
                    {query ? (
                      <div>
                        {searching && (
                          <p className="p-3 text-xs text-muted-foreground">
                            搜索中…
                          </p>
                        )}
                        {!searching && !results.length && (
                          <p className="p-3 text-xs text-muted-foreground">
                            没有匹配结果
                          </p>
                        )}
                        {results
                          .filter(
                            (result) =>
                              !stored.onlyChanged ||
                              snapshot.info.changes[result.path],
                          )
                          .map((result, index) => (
                            <Button
                              variant="ghost"
                              key={`${result.path}:${result.line ?? index}`}
                              className="h-auto w-full flex-col items-start gap-1 rounded-none px-3 py-2 text-left text-xs font-normal whitespace-normal"
                              onClick={() => open(result.path, result.line)}
                            >
                              <span className="flex max-w-full items-center gap-1 break-all">
                                <FileText className="size-3 shrink-0" />
                                {result.path}
                                {result.line && (
                                  <span className="text-muted-foreground">
                                    :{result.line}
                                  </span>
                                )}
                              </span>
                              {result.text && (
                                <code className="max-w-full truncate text-[10px] text-muted-foreground">
                                  {result.text}
                                </code>
                              )}
                            </Button>
                          ))}
                        {truncated && (
                          <p className="p-3 text-[10px] text-muted-foreground">
                            显示前 500 项，请缩小搜索范围
                          </p>
                        )}
                      </div>
                    ) : (
                      <div role="tree" aria-label="项目文件树">
                        {treeContent}
                      </div>
                    )}
                  </div>
                </ScrollArea>
                <footer className="flex shrink-0 items-center justify-between gap-2 border-t px-2 py-1.5 text-[10px] text-muted-foreground">
                  <span>
                    {Object.keys(snapshot.info.changes).length} 项 Git 改动
                  </span>
                  <span>忽略项置灰</span>
                </footer>
              </aside>
            </ResizablePanel>
            <ResizableHandle aria-label="调整文件树宽度" withHandle />
          </>
        )}
        <ResizablePanel id="content" minSize={320}>
          <main className="flex h-full min-w-0 flex-col">
            <div
              className={cn(
                "grid shrink-0 border-b bg-muted/25",
                splitView ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              {visibleSlots.map((slot, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex h-9 min-w-0 items-center gap-1 border-t-2 border-r px-2 last:border-r-0",
                    stored.viewer.active === index
                      ? "border-t-primary bg-background"
                      : "border-t-transparent",
                  )}
                  onClick={() =>
                    setStored((old) => ({
                      ...old,
                      viewer: { ...old.viewer, active: index as 0 | 1 },
                    }))
                  }
                >
                  {slot ? (
                    <>
                      <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={slot.path}
                      >
                        {base(slot.path)}
                      </span>
                      {splitView && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 px-1 text-[9px]",
                            slot.version === "head"
                              ? "text-destructive"
                              : "text-emerald-700 dark:text-emerald-400",
                          )}
                        >
                          {slot.version === "head"
                            ? "修改前 · HEAD"
                            : "修改后 · 磁盘"}
                        </Badge>
                      )}
                      {snapshot.files[slot.path]?.hasDiff && !splitView && (
                        <IconButton
                          label="查看 Diff"
                          onClick={(event) => {
                            event.stopPropagation();
                            open(slot.path);
                          }}
                        >
                          <Columns2 className="size-3.5" />
                        </IconButton>
                      )}
                      {markdown(slot.path) && (
                        <IconButton
                          label="Markdown 预览"
                          aria-pressed={
                            !!previews[`${slot.path}:${slot.version}`]
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            setPreviews((old) => ({
                              ...old,
                              [`${slot.path}:${slot.version}`]:
                                !old[`${slot.path}:${slot.version}`],
                            }));
                          }}
                        >
                          <Eye className="size-3.5" />
                        </IconButton>
                      )}
                      <ActionDropdown
                        label={`复制 ${slot.path} 的路径`}
                        Icon={Copy}
                        actions={pathActions(slot.path)}
                      />
                      <ActionDropdown
                        label={`添加 ${slot.path} 到对话`}
                        Icon={MessageSquare}
                        actions={conversationActions(slot.path, slot)}
                        disabled={busy}
                      />
                      <IconButton
                        label="关闭文件"
                        onClick={(event) => {
                          event.stopPropagation();
                          setStored((old) => ({
                            ...old,
                            viewer: emptyViewer(),
                          }));
                        }}
                      >
                        <X className="size-3.5" />
                      </IconButton>
                    </>
                  ) : (
                    <span className="text-muted-foreground">选择文件</span>
                  )}
                </div>
              ))}
            </div>
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
              {plainText && slots.some(Boolean) ? (
                <CodeView
                  dark={dark}
                  slots={slots}
                  versions={versions}
                  diff={diff}
                  single={!splitView}
                  line={line}
                  active={stored.viewer.active}
                  onSelection={(value) => {
                    selection.current = value;
                  }}
                  onScroll={onScroll}
                  onDefinition={findDefinition}
                />
              ) : (
                <div
                  className={cn(
                    "grid h-full",
                    splitView ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {visibleSlots.map((slot, index) => (
                    <div
                      key={`${slot?.path}:${slot?.version}:${index}`}
                      className="h-full min-w-0 overflow-hidden border-r last:border-r-0"
                    >
                      {!slot ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-muted-foreground">
                          <FolderOpen className="size-9 opacity-35" />
                          <p>从文件树选择文件</p>
                        </div>
                      ) : !versions[index] ? (
                        <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
                          {snapshot.errors[slot.path] ?? "正在读取…"}
                        </div>
                      ) : versions[index]!.binary ||
                        !versions[index]!.exists ||
                        previews[`${slot.path}:${slot.version}`] ? (
                        <Preview
                          slot={slot}
                          version={versions[index]!}
                          bindingId={binding.bindingId}
                          onOpen={open}
                        />
                      ) : (
                        <CodeView
                          dark={dark}
                          single
                          slots={[slot, null]}
                          versions={[versions[index], null]}
                          diff={false}
                          onSelection={(value) => {
                            selection.current = value;
                          }}
                          onScroll={(_, top) => onScroll(index, top)}
                          onDefinition={findDefinition}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <footer className="flex h-7 shrink-0 items-center gap-2 border-t px-3 text-[10px] text-muted-foreground">
              <span className="min-w-0 truncate" title={activeSlot?.path}>
                {activeSlot?.path ?? "选择文件开始浏览"}
              </span>
              {splitView && (
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto p-0 text-[10px]"
                  onClick={() =>
                    setStored((old) => ({
                      ...old,
                      viewer: {
                        ...old.viewer,
                        slots: [old.viewer.slots[1], null],
                        active: 0,
                        diff: false,
                      },
                    }))
                  }
                >
                  仅查看当前全文
                </Button>
              )}
              <span
                className="ml-auto shrink-0"
                title="每 2 秒刷新已展开的目录、Git 状态与当前文件内容"
              >
                {busy || reading ? "处理中…" : "自动同步 · 每 2 秒"}
              </span>
            </footer>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      <ShadcnDialog
        open={!!dialog}
        onOpenChange={(value) => {
          if (!value && !busy) setDialog(null);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{dialog ? labels[dialog.kind] : ""}</DialogTitle>
            <DialogDescription className="break-all font-mono text-xs">
              {dialog?.path || binding.root}
            </DialogDescription>
          </DialogHeader>
          {dialog?.kind === "trash" ? (
            <p className="text-sm text-muted-foreground">
              删除后移到系统废纸篓，可在废纸篓中找回。
            </p>
          ) : dialog?.kind === "move" ? (
            <>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={!dialog.value || busy}
                  onClick={() =>
                    setDialog((old) =>
                      old ? { ...old, value: parent(old.value) } : old,
                    )
                  }
                >
                  上一级
                </Button>
                <code className="truncate text-xs text-muted-foreground">
                  /{dialog.value}
                </code>
              </div>
              <ScrollArea className="h-56 rounded-lg border">
                {destinations.map((node) => (
                  <Button
                    key={node.path}
                    variant="ghost"
                    className="w-full justify-start rounded-none text-xs font-normal"
                    onClick={() =>
                      setDialog((old) =>
                        old ? { ...old, value: node.path } : old,
                      )
                    }
                  >
                    <Folder className="size-3.5" />
                    {node.name}
                    <ChevronRight className="ml-auto size-3" />
                  </Button>
                ))}
              </ScrollArea>
              <p className="text-xs text-muted-foreground break-all">
                目标：{joinPath(dialog.value, base(dialog.path))}
              </p>
            </>
          ) : (
            <Input
              autoFocus
              aria-label="名称"
              value={dialog?.value ?? ""}
              onChange={(event) =>
                setDialog((old) =>
                  old ? { ...old, value: event.target.value } : old,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              取消
            </Button>
            <Button
              variant={dialog?.kind === "trash" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "处理中…" : dialog?.kind === "trash" ? "删除" : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </ShadcnDialog>
    </div>
  );
}

function Root() {
  const [binding, setBinding] = useState(initialBinding);
  const [dark, setDark] = useState(bridge.getHostContext()?.theme === "dark");
  const [directoryOpen, setDirectoryOpen] = useState(!initialBinding?.root);
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [reload, setReload] = useState(0);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    receiveBinding = (data) => {
      setBinding(data);
      if (data.root) setDirectoryOpen(false);
    };
    const theme = (context: { theme?: string }) => {
      if (context.theme) setDark(context.theme === "dark");
    };
    bridge.addEventListener("hostcontextchanged", theme);
    return () => {
      receiveBinding = null;
      bridge.removeEventListener("hostcontextchanged", theme);
    };
  }, []);
  useEffect(() => {
    if (!directoryOpen) return;
    let cancelled = false;
    setProjectsLoading(true);
    setProjectError("");
    void rpc<{ projects: LocalProject[] }>("visualfiles_projects", {
      action: "list",
    })
      .then((data) => {
        if (!cancelled) setProjects(data.projects);
      })
      .catch((error) => {
        if (!cancelled) setProjectError(errorText(error));
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [directoryOpen, reload]);
  const chooseWorkspace = () => {
    setProjectQuery("");
    setDirectoryOpen(true);
  };
  const openWorkspace = async (path: string, projectId: string) => {
    if (opening) return;
    setOpening(true);
    try {
      const data = await rpc<Binding>("open_visualfiles", {
        workingDirectory: path,
        projectId,
      });
      setBinding(data);
      setDirectoryOpen(false);
    } catch (error) {
      toast.error(errorText(error), { duration: 3000 });
    } finally {
      setOpening(false);
    }
  };
  const query = projectQuery.trim();
  const filtered = projects.filter(
    (project) =>
      project.name.includes(query) ||
      project.roots.some((root) => root.includes(query)),
  );
  return (
    <ThemeProvider
      attribute="class"
      forcedTheme={dark ? "dark" : "light"}
      enableSystem={false}
    >
      <TooltipProvider delay={250}>
        {binding?.root && binding.info ? (
          <Panel
            key={binding.bindingId}
            binding={binding}
            dark={dark}
            chooseWorkspace={chooseWorkspace}
          />
        ) : (
          <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
            <FolderOpen className="size-10 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              选择项目后即可浏览文件树。
            </p>
            <Button onClick={chooseWorkspace}>
              <FolderOpen className="size-4" />
              打开项目
            </Button>
          </div>
        )}
        <ShadcnDialog
          open={directoryOpen}
          onOpenChange={(value) => {
            if (!opening) setDirectoryOpen(value);
          }}
        >
          <DialogContent showCloseButton={!opening} className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>打开项目</DialogTitle>
              <DialogDescription>
                仅可选择 Codex 已创建并关联本机目录的项目。
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                aria-label="搜索项目"
                placeholder="搜索项目名或路径（区分大小写）…"
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.target.value)}
              />
              <IconButton
                label="刷新项目列表"
                disabled={projectsLoading || opening}
                onClick={() => setReload((old) => old + 1)}
              >
                <RefreshCw
                  className={cn("size-4", projectsLoading && "animate-spin")}
                />
              </IconButton>
            </div>
            <ScrollArea className="h-64 rounded-lg border">
              <div className="p-1 pr-[calc(0.625rem+8px)]">
                {projectsLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    正在读取项目…
                  </p>
                ) : projectError ? (
                  <p role="alert" className="p-3 text-sm text-muted-foreground">
                    {projectError}，请刷新重试。
                  </p>
                ) : !filtered.length ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    {projects.length
                      ? "没有匹配的本机项目"
                      : "暂无已登记的本机项目，请先在 Codex 中创建项目并关联源目录。"}
                  </p>
                ) : (
                  filtered.flatMap((project) =>
                    project.roots.length
                      ? project.roots.map((root) => (
                          <Button
                            key={project.id + ":" + root}
                            variant="ghost"
                            className="h-auto w-full flex-col items-start gap-1 px-3 py-2 text-left font-normal"
                            disabled={opening}
                            onClick={() => void openWorkspace(root, project.id)}
                            title={root}
                          >
                            <span className="flex w-full items-center gap-2 text-sm font-medium">
                              <Folder className="size-4 shrink-0" />
                              {project.name}
                              {project.roots.length > 1 && (
                                <span className="truncate text-xs text-muted-foreground">
                                  · {base(root)}
                                </span>
                              )}
                              {(binding?.root ?? binding?.preferredRoot) ===
                                root && (
                                <Badge variant="secondary" className="ml-auto">
                                  当前
                                </Badge>
                              )}
                            </span>
                            <span className="max-w-full truncate pl-6 font-mono text-xs text-muted-foreground">
                              {root}
                            </span>
                          </Button>
                        ))
                      : [
                          <Button
                            key={project.id}
                            variant="ghost"
                            className="w-full justify-start"
                            disabled
                          >
                            <Folder className="size-4" />
                            {project.name}
                            <span className="ml-auto text-xs">
                              未关联本机目录
                            </span>
                          </Button>,
                        ],
                  )
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={opening}
                onClick={() => setDirectoryOpen(false)}
              >
                取消
              </Button>
              {opening && (
                <span
                  role="status"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <RefreshCw className="size-3 animate-spin" />
                  正在打开项目…
                </span>
              )}
            </DialogFooter>
          </DialogContent>
        </ShadcnDialog>
        <Toaster
          theme={dark ? "dark" : "light"}
          duration={3000}
          closeButton
          position="bottom-center"
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}

try {
  await bridge.connect();
  const theme = bridge.getHostContext()?.theme;
  if (theme) {
    applyDocumentTheme(theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
  createRoot(document.getElementById("app")!).render(<Root />);
} catch (error) {
  document.getElementById("app")!.textContent =
    `VisualFiles 连接失败：${errorText(error)}`;
}
