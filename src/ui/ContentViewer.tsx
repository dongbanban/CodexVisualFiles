import { useEffect, useState } from "react";
import {
  FolderOpen,
  FileCode2,
  X,
  Copy,
  MessageSquare,
  Columns2,
  Eye,
} from "lucide-react";
import { emptyViewer, type FileVersion } from "../shared.js";
import { CodeView } from "./CodeView.js";
import { Button } from "./components/ui/button.js";
import { Badge } from "./components/ui/badge.js";
import { cn } from "cn";
import { IconButton, ActionDropdown } from "./chrome.js";
import type { WorkspaceModel } from "./useWorkspace.js";
import type { FileActions } from "./useFileActions.js";
import { base, markdown, textVersion } from "./file-utils.js";
import { FilePreview } from "./FilePreview.js";

export function ContentViewer({
  workspace,
  actions,
  dark,
}: {
  workspace: WorkspaceModel;
  actions: FileActions;
  dark: boolean;
}) {
  const {
    binding,
    stored,
    setStored,
    snapshot,
    reading,
    target,
    selection,
    open,
    onScroll,
    findDefinition,
    codeNavigation,
    codeLocation,
    connectionError,
  } = workspace;
  const { busy, pathActions, conversationActions } = actions;
  const [sources, setSources] = useState<Record<string, boolean>>({});
  const slots = stored.viewer.slots;
  useEffect(() => {
    const slot = slots[stored.viewer.active];
    if (
      slot &&
      target &&
      (target.line !== undefined || target.anchor !== undefined)
    )
      setSources((old) => ({ ...old, [slot.path]: target.line !== undefined }));
  }, [target]);
  const previews = slots.map(
    (slot) =>
      !!slot &&
      markdown(slot.path) &&
      !(sources[slot.path] ?? stored.viewer.diff),
  );
  const versions = slots.map((slot) =>
    textVersion(slot ? snapshot.files[slot.path] : undefined, slot),
  ) as [FileVersion | null, FileVersion | null];
  const plainText = slots.every(
    (slot, index) =>
      !slot ||
      (!!versions[index] &&
        versions[index]!.exists &&
        !versions[index]!.binary &&
        !previews[index]),
  );
  const splitView = stored.viewer.diff && !!slots[0] && !!slots[1];
  const diff = splitView && plainText;
  const visibleSlots = splitView ? slots : [slots[0]];
  const activeSlot = slots[stored.viewer.active];

  return (
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
              "flex min-h-9 min-w-0 flex-wrap items-center gap-1 border-t-2 border-r px-2 py-1 last:border-r-0",
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
                <span className="min-w-0 flex-1 truncate" title={slot.path}>
                  {base(slot.path)}
                </span>
                {splitView && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 px-1 text-xs",
                      slot.version === "head"
                        ? "text-destructive"
                        : "text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {slot.version === "head" ? "Diff · HEAD" : "Diff · 磁盘"}
                  </Badge>
                )}
                {snapshot.files[slot.path]?.hasDiff && !splitView && (
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label="查看 Diff"
                    onClick={(event) => {
                      event.stopPropagation();
                      open(slot.path);
                    }}
                  >
                    <Columns2 className="size-3.5" />
                    Diff
                  </Button>
                )}
                {markdown(slot.path) && (
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={previews[index] ? "查看源码" : "Markdown 预览"}
                    title={
                      previews[index]
                        ? "当前为预览，点击查看源码"
                        : "当前为源码，点击查看预览"
                    }
                    aria-pressed={previews[index]}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSources((old) => ({
                        ...old,
                        [slot.path]: !(
                          old[slot.path] ??
                          (target?.line !== undefined || stored.viewer.diff)
                        ),
                      }));
                    }}
                  >
                    <Eye className="size-3.5" />
                    {splitView
                      ? previews[index]
                        ? "预览对照"
                        : "源码差异"
                      : previews[index]
                        ? "预览"
                        : "源码"}
                  </Button>
                )}
                {!markdown(slot.path) && !versions[index]?.binary && (
                  <Badge variant="outline">源码</Badge>
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
            target={target}
            active={stored.viewer.active}
            onSelection={(value) => {
              selection.current = value;
            }}
            onScroll={onScroll}
            onDefinition={findDefinition}
            head={snapshot.info.head}
            location={codeLocation}
            navigation={codeNavigation}
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
                    {snapshot.errors[slot.path] ??
                      (connectionError || "正在读取…")}
                  </div>
                ) : versions[index]!.binary ||
                  !versions[index]!.exists ||
                  previews[index] ? (
                  <FilePreview
                    slot={slot}
                    version={versions[index]!}
                    bindingId={binding.bindingId}
                    onOpen={open}
                    anchor={target?.anchor}
                    onError={workspace.setError}
                    onScroll={(top) => onScroll(index, top)}
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
                    head={snapshot.info.head}
                    location={codeLocation}
                    navigation={codeNavigation}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <footer className="flex h-7 shrink-0 items-center gap-2 border-t px-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate" title={activeSlot?.path}>
          {activeSlot?.path ?? "选择文件开始浏览"}
        </span>
        {splitView && (
          <Button
            variant="link"
            size="xs"
            className="h-auto p-0 text-xs"
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
          {connectionError
            ? "自动同步已暂停"
            : busy || reading
              ? "处理中…"
              : "自动同步 · 每 2 秒"}
        </span>
      </footer>
    </main>
  );
}
