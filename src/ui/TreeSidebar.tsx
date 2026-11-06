import {
  FileText,
  Search,
  X,
  FilePlus2,
  FolderPlus,
  ChevronsDownUp,
} from "lucide-react";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Checkbox } from "./components/ui/checkbox.js";
import { Label } from "./components/ui/label.js";
import { ScrollArea } from "./components/ui/scroll-area.js";
import { IconButton, FileContext } from "./chrome.js";
import { TreeNodes } from "./TreeNodes.js";
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
    searchError,
    retrySearch,
    setSelected,
    open,
  } = workspace;
  const { busy, setDialog, drop, entryActions } = actions;

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
              : "搜索项目内容（区分大小写）…"
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
      <div className="flex flex-wrap items-center gap-2 p-2 text-xs text-muted-foreground">
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
        <Label className="gap-1 text-xs">
          <Checkbox
            className="size-3"
            checked={stored.onlyChanged}
            onCheckedChange={(value) =>
              setStored((old) => ({ ...old, onlyChanged: value }))
            }
          />
          仅改动
        </Label>
        <Label className="gap-1 text-xs">
          <Checkbox
            className="size-3"
            checked={stored.includeIgnored}
            onCheckedChange={(value) =>
              setStored((old) => ({ ...old, includeIgnored: value }))
            }
          />
          包含 Git 忽略文件
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
            项目文件
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
          {query.trim() ? (
            <div>
              {searching && (
                <p className="p-3 text-xs text-muted-foreground">搜索中…</p>
              )}
              {!searching && !searchError && !results.length && (
                <p className="p-3 text-xs text-muted-foreground">
                  {stored.onlyChanged
                    ? "没有符合仅改动条件的结果"
                    : "没有匹配结果"}
                  {stored.onlyChanged && (
                    <Button
                      size="xs"
                      variant="link"
                      onClick={() =>
                        setStored((old) => ({ ...old, onlyChanged: false }))
                      }
                    >
                      取消仅改动
                    </Button>
                  )}
                </p>
              )}
              {searchError && (
                <div role="alert" className="p-3 text-destructive">
                  {searchError}
                  <Button size="xs" variant="outline" onClick={retrySearch}>
                    重试搜索
                  </Button>
                </div>
              )}
              {!searching && !searchError && (
                <p role="status" className="px-3 text-muted-foreground">
                  {results.length} 项结果{truncated ? "（已截断）" : ""}
                </p>
              )}
              {results.map((result, index) => (
                <Button
                  variant="ghost"
                  key={`${result.path}:${result.line ?? index}`}
                  className="h-auto w-full flex-col items-start gap-1 rounded-none px-3 py-2 text-left text-xs font-normal whitespace-normal"
                  onClick={() =>
                    open(
                      result.path,
                      result.line
                        ? { line: result.line, version: "current" }
                        : undefined,
                    )
                  }
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
                    <code className="max-w-full truncate text-xs text-muted-foreground">
                      {result.text}
                    </code>
                  )}
                </Button>
              ))}
              {truncated && (
                <p className="p-3 text-xs text-muted-foreground">
                  显示前 500 项，请缩小搜索范围
                </p>
              )}
            </div>
          ) : (
            <TreeNodes workspace={workspace} actions={actions} />
          )}
        </div>
      </ScrollArea>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t px-2 py-1.5 text-xs text-muted-foreground">
        <span>{Object.keys(snapshot.info.changes).length} 项 Git 改动</span>
        <span>忽略项置灰</span>
      </footer>
    </aside>
  );
}
