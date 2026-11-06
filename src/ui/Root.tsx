import { useEffect, useRef, useState } from "react";
import { Folder, FolderOpen, RefreshCw } from "lucide-react";
import { type Binding, type LocalProject } from "../shared.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import { Badge } from "./components/ui/badge.js";
import { ScrollArea } from "./components/ui/scroll-area.js";
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog.js";
import { Toaster } from "./components/ui/sonner.js";
import { toast } from "sonner";
import { ThemeProvider } from "next-themes";
import { cn } from "cn";
import { BuildInfo, IconButton } from "./chrome.js";
import { initialBinding, bridge, rpc, onBinding } from "./bridge.js";
import { errorText, base } from "./file-utils.js";
import { WorkspacePanel } from "./WorkspacePanel.js";

export function Root() {
  const [binding, setBinding] = useState<Binding | null>(null);
  const [dark, setDark] = useState(bridge.getHostContext()?.theme === "dark");
  const [directoryOpen, setDirectoryOpen] = useState(!initialBinding?.root);
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [openError, setOpenError] = useState("");
  const [reload, setReload] = useState(0);
  const [opening, setOpening] = useState(false);
  const requestId = useRef(0);
  useEffect(() => {
    const receive = (data: Binding) => {
      if (data.root) void openWorkspace(data.root, data.projectId);
      else {
        requestId.current++;
        setOpening(false);
        setBinding(data);
        setDirectoryOpen(true);
      }
    };
    const stopReceiving = onBinding(receive);
    if (initialBinding) receive(initialBinding);
    const theme = (context: { theme?: string }) => {
      if (context.theme) setDark(context.theme === "dark");
    };
    bridge.addEventListener("hostcontextchanged", theme);
    return () => {
      requestId.current++;
      stopReceiving();
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
    setOpenError("");
    setDirectoryOpen(true);
  };
  const openWorkspace = async (path: string, projectId?: string) => {
    const request = ++requestId.current;
    setOpening(true);
    setOpenError("");
    try {
      const data = await rpc<{ binding: Binding }>("visualfiles_projects", {
        action: "open",
        workingDirectory: path,
        projectId,
      });
      if (request !== requestId.current) return;
      setBinding(data.binding);
      setDirectoryOpen(false);
    } catch (error) {
      if (request !== requestId.current) return;
      setDirectoryOpen(true);
      setOpenError(errorText(error));
      toast.error(errorText(error), { duration: 3000 });
    } finally {
      if (request === requestId.current) setOpening(false);
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
          <WorkspacePanel
            key={binding.bindingId}
            binding={binding}
            dark={dark}
            chooseWorkspace={chooseWorkspace}
            reconnect={() =>
              void openWorkspace(binding.root!, binding.projectId)
            }
            reconnecting={opening}
          />
        ) : (
          <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
            <FolderOpen className="size-10 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {opening ? "正在连接项目…" : "选择项目后即可浏览文件树。"}
            </p>
            <Button disabled={opening} onClick={chooseWorkspace}>
              <FolderOpen className="size-4" />
              选择浏览项目
            </Button>
            <BuildInfo />
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
              <DialogTitle>选择浏览项目</DialogTitle>
              <DialogDescription>
                仅可选择 Codex
                已登记的本机项目。仅切换文件树，不改变当前聊天所属项目。
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
                ) : projectError && !projects.length ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    项目列表暂不可用，请刷新重试。
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
            {(openError || projectError) && (
              <p role="alert" className="text-sm text-destructive break-words">
                {openError || projectError}。请刷新项目列表或重新选择项目。
              </p>
            )}
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
                  正在切换浏览项目…
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
