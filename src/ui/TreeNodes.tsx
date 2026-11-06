import React, { useMemo, useRef, useState } from "react";
import {
  Folder,
  FolderOpen,
  FileCode2,
  FileText,
  FileImage,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Link2,
} from "lucide-react";
import { Button } from "./components/ui/button.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible.js";
import { cn } from "cn";
import { ActionDropdown, FileContext } from "./chrome.js";
import { parent } from "./file-utils.js";
import type { WorkspaceModel } from "./useWorkspace.js";
import type { FileActions } from "./useFileActions.js";

export function TreeNodes({
  workspace,
  actions,
}: {
  workspace: WorkspaceModel;
  actions: FileActions;
}) {
  const { stored, setStored, snapshot, selected, setSelected, open, toggle } =
    workspace;
  const { busy, clipboard, drag, drop, entryActions } = actions;
  const container = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(selected);
  const visiblePaths = useMemo(() => {
    const paths: string[] = [];
    const collect = (directory: string) => {
      for (const node of snapshot.directories[directory] ?? []) {
        if (stored.onlyChanged && !node.status) continue;
        paths.push(node.path);
        if (node.directory && stored.expanded.includes(node.path))
          collect(node.path);
      }
    };
    collect("");
    return paths;
  }, [snapshot.directories, stored.expanded, stored.onlyChanged]);
  const tabStop = visiblePaths.includes(focused) ? focused : visiblePaths[0];
  const focusPath = (path?: string) => {
    if (path === undefined) return;
    const node = Array.from(
      container.current?.querySelectorAll<HTMLButtonElement>(
        '[role="treeitem"]',
      ) ?? [],
    ).find((item) => item.getAttribute("aria-label") === path);
    node?.focus();
  };
  const navigate = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      '[role="treeitem"]',
    );
    if (!row) return;
    const path = row.getAttribute("aria-label")!;
    const index = visiblePaths.indexOf(path);
    const expanded = row.getAttribute("aria-expanded");
    let next: string | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = visiblePaths[Math.min(index + 1, visiblePaths.length - 1)];
        break;
      case "ArrowUp":
        next = visiblePaths[Math.max(index - 1, 0)];
        break;
      case "Home":
        next = visiblePaths[0];
        break;
      case "End":
        next = visiblePaths.at(-1);
        break;
      case "ArrowRight":
        if (expanded === "false") toggle(path);
        else if (
          expanded === "true" &&
          parent(visiblePaths[index + 1] ?? "") === path
        )
          next = visiblePaths[index + 1];
        break;
      case "ArrowLeft":
        if (expanded === "true") toggle(path);
        else next = parent(path);
        break;
      case "ContextMenu":
      case "F10":
        if (event.key === "F10" && !event.shiftKey) return;
        row
          .closest("[data-tree-row]")
          ?.querySelector<HTMLButtonElement>(
            '[data-slot="dropdown-menu-trigger"]',
          )
          ?.click();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    focusPath(next);
  };
  const expandedPaths = useMemo(
    () => new Set(stored.expanded),
    [stored.expanded],
  );
  function tree(path: string): React.ReactNode {
    const nodes = snapshot.directories[path];
    if (!nodes)
      return (
        <p className="p-3 text-xs text-muted-foreground break-words">
          {snapshot.errors[path] ?? (workspace.connectionError || "正在读取…")}
        </p>
      );
    const visible = nodes.filter((node) => !stored.onlyChanged || node.status);
    if (!visible.length && path === "" && stored.onlyChanged)
      return (
        <div className="p-3 text-muted-foreground">
          没有符合仅改动条件的文件
          <Button
            size="xs"
            variant="link"
            onClick={() => setStored((old) => ({ ...old, onlyChanged: false }))}
          >
            取消仅改动
          </Button>
        </div>
      );
    return visible.map((node, index) => {
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
          aria-level={node.path.split("/").length}
          aria-posinset={index + 1}
          aria-setsize={visible.length}
          tabIndex={tabStop === node.path ? 0 : -1}
          onFocus={() => {
            setFocused(node.path);
            setSelected(node.path);
          }}
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
                "ml-auto text-xs font-semibold",
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
            setFocused(node.path);
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
              data-tree-row
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
  const content = useMemo(
    () => tree(""),
    [
      snapshot.directories,
      snapshot.errors,
      stored.onlyChanged,
      expandedPaths,
      selected,
      clipboard,
      busy,
      tabStop,
      workspace.connectionError,
    ],
  );
  return (
    <div
      ref={container}
      role="tree"
      aria-label="项目文件树"
      onKeyDown={navigate}
    >
      {content}
    </div>
  );
}
