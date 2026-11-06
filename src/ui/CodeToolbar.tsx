import { ArrowLeft, ArrowRight, CornerDownRight, Loader2 } from "lucide-react";
import { IconButton } from "./chrome.js";
import type { CodeNavigation } from "./useCodeNavigation.js";

export function CodeToolbar({
  navigation,
  navigate,
  definitionAvailable,
  defining,
  jump,
  cursorLabel,
}: {
  navigation: CodeNavigation;
  navigate: (direction: "back" | "forward") => boolean;
  definitionAvailable: boolean;
  defining: boolean;
  jump: () => void;
  cursorLabel: string;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/15 px-2 py-1">
      <IconButton
        label="返回上一处定义跳转位置（Alt＋←）"
        disabled={!navigation.back}
        onClick={() => navigate("back")}
      >
        <ArrowLeft className="size-3.5" />
      </IconButton>
      <IconButton
        label="前往下一处定义跳转位置（Alt＋→）"
        disabled={!navigation.forward}
        onClick={() => navigate("forward")}
      >
        <ArrowRight className="size-3.5" />
      </IconButton>
      <IconButton
        label={
          definitionAvailable
            ? "跳转到定义（JS/TS；F12 或 ⌘/Ctrl＋点击；历史仅记录定义跳转）"
            : "定义跳转仅支持 JS/TS；前进后退仅记录定义跳转"
        }
        disabled={defining || !definitionAvailable}
        onClick={jump}
      >
        {defining ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CornerDownRight className="size-3.5" />
        )}
      </IconButton>
      <span className="text-xs text-muted-foreground">
        定义跳转{definitionAvailable ? "" : " · 仅 JS/TS"}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {cursorLabel}
      </span>
    </div>
  );
}
