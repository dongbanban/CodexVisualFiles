import { Folder, ChevronRight } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { ScrollArea } from "./components/ui/scroll-area.js";
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog.js";
import type { FileActions } from "./useFileActions.js";
import { parent, base, joinPath } from "./file-utils.js";

export function FileOperationDialog({
  actions,
  root,
}: {
  actions: FileActions;
  root: string;
}) {
  const { busy, dialog, setDialog, destinations, submit } = actions;
  const labels = {
    createFile: "新建文件",
    createDirectory: "新建文件夹",
    rename: "重命名",
    move: "移动到文件夹",
    trash: "删除",
  };
  return (
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
            {dialog?.path || root}
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
  );
}
