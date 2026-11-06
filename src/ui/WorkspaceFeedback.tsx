import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./components/ui/button.js";
import { IconButton } from "./chrome.js";
import type { WorkspaceModel } from "./useWorkspace.js";
import type { FileActions } from "./useFileActions.js";

function ErrorRow({
  message,
  children,
}: {
  message: string;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-destructive/5 px-3 py-2 text-xs"
    >
      <span className="min-w-0 flex-1 break-words text-destructive">
        {message}
      </span>
      {children}
    </div>
  );
}
export function WorkspaceFeedback({
  workspace,
  actions,
  reconnect,
  reconnecting,
}: {
  workspace: WorkspaceModel;
  actions: FileActions;
  reconnect: () => void;
  reconnecting: boolean;
}) {
  if (workspace.connectionError)
    return (
      <ErrorRow message={workspace.connectionError}>
        <Button
          size="xs"
          variant="outline"
          disabled={reconnecting}
          onClick={reconnect}
        >
          {reconnecting ? "正在连接…" : "重新连接项目"}
        </Button>
      </ErrorRow>
    );
  return (
    <>
      {workspace.readError && (
        <ErrorRow
          message={`${workspace.readError.path}：${workspace.readError.message}`}
        >
          <Button
            size="xs"
            variant="outline"
            disabled={workspace.reading}
            onClick={workspace.retryRead}
          >
            重试读取文件
          </Button>
        </ErrorRow>
      )}
      {workspace.syncError && (
        <ErrorRow message={`同步失败：${workspace.syncError}`}>
          <Button
            size="xs"
            variant="outline"
            disabled={workspace.refreshing}
            onClick={() => void workspace.manualRefresh()}
          >
            重试同步
          </Button>
        </ErrorRow>
      )}
      {workspace.error && (
        <ErrorRow message={workspace.error}>
          <IconButton label="关闭错误提示" onClick={workspace.clearError}>
            <X className="size-3.5" />
          </IconButton>
        </ErrorRow>
      )}
      {actions.error && !actions.dialog && (
        <ErrorRow message={actions.error.message}>
          {actions.error.retry && (
            <Button
              size="xs"
              variant="outline"
              disabled={actions.busy}
              onClick={actions.error.retry}
            >
              {actions.error.retryLabel ?? "重试操作"}
            </Button>
          )}
          {actions.error.path !== undefined && (
            <Button
              size="xs"
              variant="outline"
              disabled={actions.busy}
              onClick={() => actions.copyPath(actions.error!.path!)}
            >
              复制路径
            </Button>
          )}
          <IconButton label="关闭操作错误" onClick={actions.clearError}>
            <X className="size-3.5" />
          </IconButton>
        </ErrorRow>
      )}
    </>
  );
}
