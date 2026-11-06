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
  ExternalLink,
} from "lucide-react";
import {
  type Snapshot,
  type Slot,
  type TreeEntry,
  type FileData,
} from "../shared.js";
import { type MenuAction } from "./chrome.js";
import {
  addReferenceDraft,
  type ConversationReference,
  type ConversationTarget,
} from "../conversation.js";
import type { WorkspaceModel } from "./useWorkspace.js";
import {
  bridge,
  extensions,
  openFileInCodex,
  referenceDraftSupported,
} from "./bridge.js";
import { parent, base, joinPath, ancestors } from "./file-utils.js";
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
    setSelection,
    call,
    refresh,
    setNotice,
    setError,
    clearError,
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
    setDestinations([]);
    void call<Snapshot>("visualfiles_read", {
      action: "snapshot",
      directories: [dialog.value],
      paths: [],
    })
      .then((data) => {
        if (cancelled) return;
        if (data.errors[dialog.value])
          throw new Error(data.errors[dialog.value]);
        setDestinations(
          (data.directories[dialog.value] ?? []).filter(
            (node) => node.directory && !node.deleted,
          ),
        );
      })
      .catch((error) => {
        if (!cancelled) setError(error);
      });
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
      setError("剪贴板不可用，请检查客户端的剪贴板权限");
    }
  };
  const copyEntry = (mode: "copy" | "cut", path: string) => {
    setClipboard({ mode, path });
    setNotice(
      `已${mode === "copy" ? "复制" : "剪切"} ${base(path)}，请在目标目录粘贴`,
    );
  };
  const openInCodex = async (path: string) => {
    if (busy) return;
    setBusy(true);
    clearError();
    try {
      const file = await call<ConversationReference>("visualfiles_read", {
        action: "reference",
        path,
      });
      if (file.directory)
        throw new Error("Codex 原生查看仅支持文件，请选择文件");
      await openFileInCodex(file.absolutePath);
    } catch (error) {
      if (alive.current) setError(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const relocate = (source: string, destination: string) => {
    const changed = (value: string) =>
      value === source || value.startsWith(`${source}/`)
        ? destination + value.slice(source.length)
        : value;
    setSelected((old) => changed(old));
    setSelection(null);
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
    clearError();
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
      setError(error);
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
    clearError();
    try {
      const selectedCode =
        slot &&
        selection?.path === slot.path &&
        selection.version === slot.version &&
        selection.text
          ? selection
          : null;
      let reference: ConversationReference;
      if (selectedCode || slot?.version === "head") {
        const revision =
          selectedCode?.revision ?? filesRef.current[path]?.head.revision;
        if (!revision) throw new Error("引用内容已变化，请重新选择内容");
        await call<FileData>("visualfiles_read", {
          action: "file",
          path,
          version: slot!.version,
          revision,
          ...(slot!.version === "head"
            ? { head: workspace.snapshot.info.head }
            : {}),
        });
      }
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
      if (alive.current) setError(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function submit() {
    if (!dialog || busy) return;
    setBusy(true);
    clearError();
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
      setError(error);
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
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const referenceScope = (path: string, slot?: Slot, directory = false) => {
    const code =
      slot &&
      selection?.path === path &&
      selection.version === slot.version &&
      selection.text
        ? selection
        : null;
    return code
      ? `引用${slot?.version === "head" ? " HEAD" : ""}选中代码 L${code.from}–L${code.to}`
      : slot?.version === "head"
        ? "引用 HEAD 内容"
        : directory
          ? "引用目录"
          : "引用文件";
  };
  const conversationActions = (
    path: string,
    slot?: Slot,
    directory = false,
  ): MenuAction[] => [
    {
      label: `${referenceScope(path, slot, directory)} · 添加到当前对话草稿`,
      Icon: MessageSquare,
      disabled: busy || !referenceDraftSupported(),
      action: () => void addToConversation(path, "active", slot),
    },
    {
      label: `${referenceScope(path, slot, directory)} · 添加到新对话草稿`,
      Icon: MessageSquare,
      disabled: busy || !referenceDraftSupported(),
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
    error: workspace.error,
    submit,
    drag,
    drop,
    entryActions,
    pathActions,
    conversationActions,
    referenceScope,
    draftSupported: referenceDraftSupported(),
  };
}

export type FileActions = ReturnType<typeof useFileActions>;
