import {
  FilePlus2,
  FolderPlus,
  Pencil,
  Move,
  Trash2,
  Copy,
  ClipboardPaste,
  Scissors,
  ExternalLink,
} from "lucide-react";
import type { MenuAction } from "./chrome.js";
import { base, parent } from "./file-utils.js";

export interface FileDialogState {
  kind: "createFile" | "createDirectory" | "rename" | "move" | "trash";
  path: string;
  value: string;
}

export function entryMenu(
  path: string,
  directory: boolean,
  ops: {
    busy: boolean;
    clipboard: boolean;
    setDialog: (state: FileDialogState) => void;
    openInCodex: (path: string) => Promise<void>;
    copyEntry: (mode: "copy" | "cut", path: string) => void;
    pasteEntry: (directory: string) => Promise<void>;
    pathActions: (path: string) => MenuAction[];
    conversationActions: (
      path: string,
      slot: undefined,
      directory: boolean,
    ) => MenuAction[];
  },
): MenuAction[] {
  const {
    busy,
    clipboard,
    setDialog,
    openInCodex,
    copyEntry,
    pasteEntry,
    pathActions,
    conversationActions,
  } = ops;
  return [
    ...(directory
      ? [
          {
            label: "新建文件",
            Icon: FilePlus2,
            disabled: busy,
            action: () => setDialog({ kind: "createFile", path, value: "" }),
          },
          {
            label: "新建文件夹",
            Icon: FolderPlus,
            disabled: busy,
            action: () =>
              setDialog({ kind: "createDirectory", path, value: "" }),
          },
        ]
      : [
          {
            label: "Codex 原生查看",
            Icon: ExternalLink,
            disabled: busy,
            action: () => void openInCodex(path),
          },
        ]),
    {
      label: "复制",
      Icon: Copy,
      disabled: !path || busy,
      separator: true,
      action: () => copyEntry("copy", path),
    },
    {
      label: "剪切",
      Icon: Scissors,
      disabled: !path || busy,
      action: () => copyEntry("cut", path),
    },
    {
      label: "粘贴",
      Icon: ClipboardPaste,
      disabled: !clipboard || busy,
      action: () => void pasteEntry(directory ? path : parent(path)),
    },
    ...pathActions(path).map((item, index) => ({
      ...item,
      separator: index === 0,
    })),
    ...conversationActions(path, undefined, directory).map((item, index) => ({
      ...item,
      separator: index === 0,
    })),
    {
      label: "重命名",
      Icon: Pencil,
      disabled: !path || busy,
      separator: true,
      action: () => setDialog({ kind: "rename", path, value: base(path) }),
    },
    {
      label: "移动到…",
      Icon: Move,
      disabled: !path || busy,
      action: () => setDialog({ kind: "move", path, value: parent(path) }),
    },
    {
      label: "移到废纸篓",
      Icon: Trash2,
      disabled: !path || busy,
      danger: true,
      action: () => setDialog({ kind: "trash", path, value: "" }),
    },
  ];
}
