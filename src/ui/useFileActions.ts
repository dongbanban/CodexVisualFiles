import React, { useEffect, useState } from "react";
import {
  FilePlus2,
  FolderPlus,
  Pencil,
  Move,
  Trash2,
  Copy,
  ClipboardPaste,
  Scissors,
  MessageSquare,
} from "lucide-react";
import { type Snapshot, type Slot, type TreeEntry } from "../shared.js";
import { type MenuAction } from "./chrome.js";
import {
  addReferenceDraft,
  type ConversationReference,
  type ConversationTarget,
} from "../conversation.js";
import type { WorkspaceModel } from "./useWorkspace.js";
import { bridge, extensions } from "./bridge.js";
import { parent, base, joinPath, ancestors, errorText } from "./file-utils.js";
const INTERNAL_DRAG_TYPE = "application/x-visualfiles";

export interface FileDialogState {
  kind: "createFile" | "createDirectory" | "rename" | "move" | "trash";
  path: string;
  value: string;
}

export function useFileActions(workspace: WorkspaceModel) {
  const {
    binding,
    alive,
    setStored,
    setSelected,
    filesRef,
    selection,
    call,
    refresh,
    setNotice,
  } = workspace;
  const [busy, setBusy] = useState(false);
  const [clipboard, setClipboard] = useState<{
    mode: "copy" | "cut";
    path: string;
  } | null>(null);
  const [dialog, setDialog] = useState<FileDialogState | null>(null);
  const [destinations, setDestinations] = useState<TreeEntry[]>([]);
  useEffect(() => {
    if (dialog?.kind !== "move") return;
    let cancelled = false;
    void call<Snapshot>("visualfiles_read", {
      action: "snapshot",
      directories: [dialog.value],
      paths: [],
    })
      .then((data) => {
        if (!cancelled)
          setDestinations(
            (data.directories[dialog.value] ?? []).filter(
              (node) => node.directory && !node.deleted,
            ),
          );
      })
      .catch((error) => setNotice(errorText(error)));
    return () => {
      cancelled = true;
    };
  }, [dialog?.kind, dialog?.value, call]);
  const absolutePath = (path: string) =>
    path ? `${binding.root!.replace(/\/$/, "")}/${path}` : binding.root!;
  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("已复制");
    } catch {
      setNotice("剪贴板不可用，请检查客户端的剪贴板权限");
    }
  };
  const copyEntry = (mode: "copy" | "cut", path: string) => {
    setClipboard({ mode, path });
    setNotice(
      `已${mode === "copy" ? "复制" : "剪切"} ${base(path)}，请在目标目录粘贴`,
    );
  };
  const relocate = (source: string, destination: string) => {
    const changed = (value: string) =>
      value === source || value.startsWith(`${source}/`)
        ? destination + value.slice(source.length)
        : value;
    setSelected((old) => changed(old));
    selection.current = null;
    setStored((old) => ({
      ...old,
      expanded: [
        ...new Set([...old.expanded.map(changed), ...ancestors(destination)]),
      ],
      viewer: {
        ...old.viewer,
        slots: old.viewer.slots.map((slot) =>
          slot ? { ...slot, path: changed(slot.path) } : null,
        ) as [Slot | null, Slot | null],
      },
    }));
  };
  const pasteEntry = async (directory: string) => {
    if (!clipboard || busy) return;
    const entry = clipboard;
    setBusy(true);
    try {
      const result = await call<{ path: string }>("visualfiles_mutate", {
        action: entry.mode === "cut" ? "move" : "copy",
        path: entry.path,
        destination: joinPath(directory, base(entry.path)),
      });
      if (entry.mode === "cut") {
        relocate(entry.path, result.path);
        setClipboard((current) => (current === entry ? null : current));
      }
      setSelected(result.path);
      setStored((old) => ({
        ...old,
        expanded: [...new Set([...old.expanded, ...ancestors(result.path)])],
      }));
      setNotice(`已粘贴 ${base(result.path)}`);
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  async function addToConversation(
    path: string,
    target: ConversationTarget,
    slot?: Slot,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const selectedCode =
        slot &&
        selection.current?.path === slot.path &&
        selection.current.version === slot.version &&
        selection.current.text
          ? selection.current
          : null;
      let reference: ConversationReference;
      if (slot?.version === "head") {
        const version = filesRef.current[path]?.head;
        if (!version?.exists || version.binary)
          throw new Error("请选择可引用的 HEAD 文本内容，或引用当前文件路径");
        reference = {
          absolutePath: absolutePath(path),
          directory: false,
          version: "head",
          text: selectedCode?.text ?? version.text,
        };
      } else {
        reference = await call<ConversationReference>("visualfiles_read", {
          action: "reference",
          path,
        });
      }
      if (selectedCode)
        reference = {
          ...reference,
          version: slot?.version,
          text: selectedCode.text,
          from: selectedCode.from,
          to: selectedCode.to,
        };
      if (reference.text && reference.text.length > 100000)
        throw new Error("引用内容过长，请先选中需要引用的代码范围");
      await addReferenceDraft(
        extensions.message,
        bridge.getHostCapabilities()?.experimental?.["openai/message"],
        reference,
        target,
      );
      if (alive.current)
        setNotice(
          target === "new"
            ? "已在新对话中添加引用草稿"
            : "已添加到当前对话草稿",
        );
    } catch (error) {
      if (alive.current) setNotice(errorText(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function submit() {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      let path = dialog.path;
      let destination: string | undefined;
      if (
        dialog.kind === "createFile" ||
        dialog.kind === "createDirectory" ||
        dialog.kind === "rename"
      ) {
        if (
          !dialog.value.trim() ||
          /[\/\0]/.test(dialog.value) ||
          [".", ".."].includes(dialog.value)
        )
          throw new Error("请输入有效的单个文件或目录名称");
        if (dialog.kind === "rename")
          destination = joinPath(parent(path), dialog.value);
        else path = joinPath(path, dialog.value);
      }
      if (dialog.kind === "move")
        destination = joinPath(dialog.value, base(dialog.path));
      await call("visualfiles_mutate", {
        action: dialog.kind === "rename" ? "move" : dialog.kind,
        path,
        destination,
      });
      setNotice(
        dialog.kind === "trash" ? "已删除，可在系统废纸篓中找回" : "操作完成",
      );
      if (destination) {
        relocate(dialog.path, destination);
      }
      await refresh();
      setDialog(null);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  const drag = (event: React.DragEvent, node: TreeEntry) => {
    event.dataTransfer.clearData();
    event.dataTransfer.setData(
      INTERNAL_DRAG_TYPE,
      JSON.stringify({ bindingId: binding.bindingId, path: node.path }),
    );
    event.dataTransfer.effectAllowed = "move";
  };
  const drop = async (event: React.DragEvent, directory: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    try {
      const raw = event.dataTransfer.getData(INTERNAL_DRAG_TYPE);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.bindingId !== binding.bindingId || typeof data.path !== "string")
        return;
      if (parent(data.path) === directory) return;
      setBusy(true);
      const destination = joinPath(directory, base(data.path));
      await call("visualfiles_mutate", {
        action: "move",
        path: data.path,
        destination,
      });
      relocate(data.path, destination);
      setStored((old) => ({
        ...old,
        expanded: [...new Set([...old.expanded, directory])],
      }));
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const conversationActions = (path: string, slot?: Slot): MenuAction[] => [
    {
      label: "添加到当前对话",
      Icon: MessageSquare,
      disabled: busy,
      action: () => void addToConversation(path, "active", slot),
    },
    {
      label: "创建新对话",
      Icon: MessageSquare,
      disabled: busy,
      action: () => void addToConversation(path, "new", slot),
    },
  ];
  const pathActions = (path: string): MenuAction[] => [
    {
      label: "复制绝对路径",
      Icon: Copy,
      action: () => void copyText(absolutePath(path)),
    },
    {
      label: "复制相对路径",
      Icon: Copy,
      action: () => void copyText(path || "."),
    },
  ];
  const entryActions = (path: string, directory: boolean): MenuAction[] => [
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
      : []),
    {
      label: "复制",
      Icon: Copy,
      disabled: !path || busy,
      separator: directory,
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
    ...conversationActions(path).map((item, index) => ({
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
      label: "删除",
      Icon: Trash2,
      disabled: !path || busy,
      danger: true,
      action: () => setDialog({ kind: "trash", path, value: "" }),
    },
  ];

  return {
    busy,
    clipboard,
    dialog,
    setDialog,
    destinations,
    submit,
    drag,
    drop,
    entryActions,
    pathActions,
    conversationActions,
  };
}

export type FileActions = ReturnType<typeof useFileActions>;
