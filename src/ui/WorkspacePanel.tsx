import { useState } from "react";
import { usePanelRef } from "react-resizable-panels";
import {
  FolderOpen,
  RefreshCw,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { type Binding } from "../shared.js";
import { Button } from "./components/ui/button.js";
import { Badge } from "./components/ui/badge.js";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "./components/ui/resizable.js";
import { cn } from "cn";
import { BuildInfo, IconButton } from "./chrome.js";
import { useWorkspace } from "./useWorkspace.js";
import { useFileActions } from "./useFileActions.js";
import { TreeSidebar } from "./TreeSidebar.js";
import { ContentViewer } from "./ContentViewer.js";
import { FileOperationDialog } from "./FileOperationDialog.js";

export function WorkspacePanel({
  binding,
  dark,
  chooseWorkspace,
  reconnect,
  reconnecting,
}: {
  binding: Binding;
  dark: boolean;
  chooseWorkspace: () => void;
  reconnect: () => void;
  reconnecting: boolean;
}) {
  const workspace = useWorkspace(binding);
  const actions = useFileActions(workspace);
  const {
    alive,
    stored,
    setStored,
    snapshot,
    refreshing,
    manualRefreshing,
    manualRefresh,
    error,
    connectionError,
    clearError,
  } = workspace;
  const [sidebar, setSidebar] = useState(true);
  const treePanel = usePanelRef();
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
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
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
            <Badge variant="outline" className="text-xs">
              worktree
            </Badge>
          )}
        </span>
        {manualRefreshing && (
          <span
            role="status"
            className="shrink-0 text-xs text-muted-foreground"
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
      {error && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-destructive/5 px-3 py-2 text-xs"
        >
          <span className="min-w-0 flex-1 break-words text-destructive">
            {error}
          </span>
          {connectionError ? (
            <Button
              size="xs"
              variant="outline"
              disabled={reconnecting}
              onClick={reconnect}
            >
              {reconnecting ? "正在连接…" : "重新连接项目"}
            </Button>
          ) : (
            <>
              <Button
                size="xs"
                variant="outline"
                disabled={refreshing}
                onClick={() => {
                  clearError();
                  void manualRefresh();
                }}
              >
                重试同步
              </Button>
              <IconButton label="关闭错误提示" onClick={clearError}>
                <X className="size-3.5" />
              </IconButton>
            </>
          )}
        </div>
      )}
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
              <TreeSidebar workspace={workspace} actions={actions} />
            </ResizablePanel>
            <ResizableHandle aria-label="调整文件树宽度" withHandle />
          </>
        )}
        <ResizablePanel id="content" minSize={320}>
          <ContentViewer workspace={workspace} actions={actions} dark={dark} />
        </ResizablePanel>
      </ResizablePanelGroup>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-t px-3 py-1 text-xs text-muted-foreground">
        <span>内容只读 · 菜单可管理文件 · 删除进入废纸篓</span>
        <BuildInfo binding={binding} />
      </footer>
      <FileOperationDialog actions={actions} root={binding.root!} />
    </div>
  );
}
