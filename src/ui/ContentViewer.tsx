import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  FileCode2,
  X,
  MoreHorizontal,
  MessageSquare,
  Eye,
} from "lucide-react";
import { type FileVersion } from "../shared.js";
import { CodeView } from "./CodeView.js";
import { Button } from "./components/ui/button.js";
import { cn } from "cn";
import { IconButton, ActionDropdown } from "./chrome.js";
import type { WorkspaceModel } from "./useWorkspace.js";
import type { FileActions } from "./useFileActions.js";
import { base, markdown, textVersion } from "./file-utils.js";
import { FilePreview } from "./FilePreview.js";
import { useElementWidth } from "./useElementWidth.js";

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
    target,
    open,
    onScroll,
    findDefinition,
    codeNavigation,
    codeLocation,
    connectionError,
    setSelection,
  } = workspace;
  const {
    busy,
    pathActions,
    conversationActions,
    referenceScope,
    draftSupported,
  } = actions;
  const { ref, width } = useElementWidth<HTMLElement>();
  const narrow = width < 640;
  const [sources, setSources] = useState<Record<string, boolean>>({});
  const slots = stored.viewer.slots;
  const split = stored.viewer.diff && !!slots[0] && !!slots[1];
  const active = stored.viewer.active;
  const activeSlot = slots[active];
  const path = activeSlot?.path;
  const isMarkdown = !!path && markdown(path);
  const source = path ? (sources[path] ?? split) : true;
  const preview = isMarkdown && !source;
  const previewed = useRef<string | undefined>(undefined);
  if (preview) previewed.current = path;
  const versions = slots.map((slot) =>
    textVersion(slot ? snapshot.files[slot.path] : undefined, slot),
  ) as [FileVersion | null, FileVersion | null];
  const code =
    slots.some(Boolean) &&
    slots.every(
      (slot, index) =>
        !slot ||
        (versions[index]?.exists &&
          !versions[index]?.binary &&
          !versions[index]?.tooLarge),
    );
  const setActive = useCallback(
    (index: number) => {
      setStored((old) =>
        old.viewer.active === index
          ? old
          : { ...old, viewer: { ...old.viewer, active: index as 0 | 1 } },
      );
    },
    [setStored],
  );
  useEffect(() => {
    if (
      path &&
      target &&
      (target.line !== undefined || target.anchor !== undefined)
    )
      setSources((old) => ({ ...old, [path]: target.line !== undefined }));
  }, [target]);
  const visible = split ? slots : [slots[0]];
  return (
    <main ref={ref} className="flex h-full min-w-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-muted/25 px-2 py-2">
        <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-[1_1_10rem] break-all">
          <div className="font-medium">{path ? base(path) : "选择文件"}</div>
          {path && path !== base(path) && (
            <div className="text-xs text-muted-foreground">{path}</div>
          )}
        </div>
        {path && (
          <>
            {isMarkdown && (
              <Button
                size="xs"
                variant="outline"
                aria-pressed={preview}
                aria-label={preview ? "查看源码" : "Markdown 预览"}
                onClick={() =>
                  setSources((old) => ({ ...old, [path]: !source }))
                }
              >
                <Eye className="size-3.5" />
                {split
                  ? preview
                    ? "预览对照"
                    : "源码差异"
                  : preview
                    ? "预览"
                    : "源码"}
              </Button>
            )}
            <ActionDropdown
              label="引用"
              Icon={MessageSquare}
              disabled={busy}
              description={
                draftSupported
                  ? `${referenceScope(path, activeSlot!)} · 不自动发送`
                  : "当前客户端不支持引用，请更新客户端或复制路径"
              }
              actions={[
                ...conversationActions(path, activeSlot!),
                ...(!draftSupported ? pathActions(path) : []),
              ]}
            >
              引用
            </ActionDropdown>
            <ActionDropdown
              label="更多文件操作"
              Icon={MoreHorizontal}
              actions={pathActions(path)}
            />
            <IconButton label="关闭文件" onClick={workspace.close}>
              <X className="size-3.5" />
            </IconButton>
          </>
        )}
      </header>
      {split && (
        <div
          className={cn(
            "grid shrink-0 border-b",
            narrow ? "grid-cols-2" : "grid-cols-2",
          )}
          role="group"
          aria-label="对比版本"
        >
          {visible.map((slot, index) => (
            <Button
              key={index}
              size="xs"
              variant={active === index ? "secondary" : "ghost"}
              aria-pressed={active === index}
              className="rounded-none"
              onClick={() => setActive(index)}
              title={
                slot?.version === "head"
                  ? "HEAD：当前提交"
                  : "当前磁盘：含已暂存和未暂存改动"
              }
            >
              {slot?.version === "head" ? "HEAD" : "当前磁盘"}
            </Button>
          ))}
        </div>
      )}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {code && (
          <div
            className={cn("h-full", preview && "hidden")}
            aria-hidden={preview || undefined}
          >
            <CodeView
              dark={dark}
              slots={slots}
              versions={versions}
              diff={split}
              single={!split}
              narrow={narrow}
              active={active}
              onActive={setActive}
              target={preview ? undefined : target}
              onSelection={setSelection}
              onScroll={onScroll}
              onDefinition={findDefinition}
              head={snapshot.info.head}
              location={codeLocation}
              navigation={codeNavigation}
            />
          </div>
        )}
        {(!code || (isMarkdown && previewed.current === path)) && (
          <div
            className={cn(
              "grid h-full",
              split && !narrow ? "grid-cols-2" : "grid-cols-1",
              code && !preview && "hidden",
            )}
          >
            {visible.map((slot, index) => (
              <div
                key={`${slot?.path}:${slot?.version}:${index}`}
                className={cn(
                  "h-full min-w-0 overflow-hidden border-r last:border-r-0",
                  split && narrow && index !== active && "hidden",
                )}
                onFocusCapture={() => setActive(index)}
                onPointerDown={() => setActive(index)}
              >
                {!slot ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-muted-foreground">
                    <FolderOpen className="size-9 opacity-35" />
                    <p>从文件树选择文件</p>
                  </div>
                ) : !versions[index] ? (
                  <div className="p-6 text-muted-foreground">
                    {snapshot.errors[slot.path] ??
                      (connectionError || "正在读取…")}
                  </div>
                ) : versions[index]!.binary ||
                  !versions[index]!.exists ||
                  versions[index]!.tooLarge ||
                  isMarkdown ? (
                  <FilePreview
                    slot={slot}
                    version={versions[index]!}
                    bindingId={binding.bindingId}
                    onOpen={open}
                    target={
                      slot.version === (target?.version ?? "current")
                        ? target
                        : undefined
                    }
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
                    target={slot.version === "current" ? target : undefined}
                    onSelection={setSelection}
                    onActive={() => setActive(index)}
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
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-2 py-1 text-xs text-muted-foreground">
        {split && (
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
        {!split && path && snapshot.files[path]?.hasDiff && (
          <Button
            variant="link"
            size="xs"
            className="h-auto p-0"
            onClick={() => open(path)}
          >
            查看 Diff
          </Button>
        )}
        <span className="ml-auto" role="status">
          {connectionError
            ? "自动同步已暂停"
            : busy || workspace.reading
              ? "处理中…"
              : "自动同步 · 每 2 秒"}
        </span>
      </footer>
    </main>
  );
}
