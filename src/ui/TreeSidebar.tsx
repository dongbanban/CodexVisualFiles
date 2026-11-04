import React, { useMemo } from "react";
import {
  Folder,
  FolderOpen,
  FileCode2,
  FileText,
  FileImage,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  MoreHorizontal,
  FilePlus2,
  FolderPlus,
  ChevronsDownUp,
  Link2,
} from "lucide-react";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Checkbox } from "./components/ui/checkbox.js";
import { Label } from "./components/ui/label.js";
import { ScrollArea } from "./components/ui/scroll-area.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible.js";
import { cn } from "cn";
import { IconButton, ActionDropdown, FileContext } from "./chrome.js";
import type { WorkspaceModel } from "./useWorkspace.js";
import type { FileActions } from "./useFileActions.js";

export function TreeSidebar({
  workspace,
  actions,
}: {
  workspace: WorkspaceModel;
  actions: FileActions;
}) {
  const {
    stored,
    setStored,
    snapshot,
    query,
    setQuery,
    results,
    truncated,
    searching,
    selected,
    setSelected,
    open,
    toggle,
  } = workspace;
  const { busy, clipboard, setDialog, drag, drop, entryActions } = actions;
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

  return (
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
            variant={stored.searchMode === "name" ? "secondary" : "ghost"}
            aria-pressed={stored.searchMode === "name"}
            onClick={() => setStored((old) => ({ ...old, searchMode: "name" }))}
          >
            文件名
          </Button>
          <Button
            size="xs"
            variant={stored.searchMode === "text" ? "secondary" : "ghost"}
            aria-pressed={stored.searchMode === "text"}
            onClick={() => setStored((old) => ({ ...old, searchMode: "text" }))}
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
            onClick={() => setStored((old) => ({ ...old, expanded: [""] }))}
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
                <p className="p-3 text-xs text-muted-foreground">搜索中…</p>
              )}
              {!searching && !results.length && (
                <p className="p-3 text-xs text-muted-foreground">
                  没有匹配结果
                </p>
              )}
              {results
                .filter(
                  (result) =>
                    !stored.onlyChanged || snapshot.info.changes[result.path],
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
        <span>{Object.keys(snapshot.info.changes).length} 项 Git 改动</span>
        <span>忽略项置灰</span>
      </footer>
    </aside>
  );
}
