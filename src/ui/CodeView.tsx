import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorState, StateEffect, type Extension } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  drawSelection,
  keymap,
  highlightActiveLineGutter,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import {
  gotoLine,
  searchKeymap,
  highlightSelectionMatches,
  search,
} from "@codemirror/search";
import {
  LanguageDescription,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { MergeView } from "@codemirror/merge";
import { oneDark } from "@codemirror/theme-one-dark";
import { cn } from "cn";
import { toast } from "sonner";
import { CodeToolbar } from "./CodeToolbar.js";
import type { Slot, FileVersion, DefinitionLocation } from "../shared.js";
import type { OpenTarget } from "./file-utils.js";
import type { CodeNavigation } from "./useCodeNavigation.js";

export interface CodeSelection {
  path: string;
  version: "head" | "current";
  from: number;
  to: number;
  text: string;
  revision?: string;
}
interface Props {
  dark: boolean;
  slots: [Slot | null, Slot | null];
  versions: [FileVersion | null, FileVersion | null];
  diff: boolean;
  single?: boolean;
  narrow?: boolean;
  onActive?: (index: number) => void;
  onSelection: (selection: CodeSelection) => void;
  onScroll: (index: number, top: number) => void;
  target?: OpenTarget;
  active?: number;
  head: string | null;
  location: DefinitionLocation | null;
  navigation: CodeNavigation;
  onDefinition: (
    slot: Slot,
    position: number,
    revision: string,
  ) => Promise<DefinitionLocation | null>;
}
export function CodeView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editors = useRef<Array<EditorView | null>>([]);
  const merge = useRef<MergeView | null>(null);
  const saved = useRef(
    new Map<
      string,
      {
        revision?: string;
        selection: { anchor: number; head: number };
        scroll: number;
      }
    >(),
  );
  const scrolls = useRef([0, 0]);
  const layout = useRef({ narrow: false, active: 0 });
  const applied = useRef<{
    target?: OpenTarget;
    location?: DefinitionLocation;
  }>({});
  const latest = useRef(props);
  latest.current = props;
  const active = useRef(props.active ?? 0);
  const [cursorLabel, setCursorLabel] = useState("行 1，列 1");
  const [defining, setDefining] = useState(false);
  const [definitionAvailable, setDefinitionAvailable] = useState(false);
  const canDefine = (index: number) =>
    /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(latest.current.slots[index]?.path ?? "");
  const definitionRequest = useRef(0);
  const currentLocation = (
    index = active.current,
  ): DefinitionLocation | null => {
    const editor = editors.current[index];
    const slot = latest.current.slots[index];
    const version = latest.current.versions[index];
    if (!editor || !slot || !version?.revision) return null;
    if (editor.state.doc.toString() !== version.text.replace(/\r\n?/g, "\n"))
      return null;
    return {
      path: slot.path,
      version: slot.version,
      revision: version.revision,
      ...(slot.version === "head"
        ? { head: latest.current.head ?? undefined }
        : {}),
      from: editor.state.selection.main.from,
      to: editor.state.selection.main.to,
    };
  };
  const navigate = (direction: "back" | "forward") => {
    const origin = currentLocation();
    if (!origin || !latest.current.navigation[direction]) return false;
    void latest.current.navigation.navigate(direction, origin);
    return true;
  };
  const jumpToDefinition = async (
    index = active.current,
    position?: number,
  ) => {
    const editor = editors.current[index];
    const slot = latest.current.slots[index];
    const version = latest.current.versions[index];
    if (!editor || !slot || !version || !canDefine(index)) return;
    const text = editor.state.doc.toString();
    const origin = editor.state.selection.main;
    if (!version.revision || version.text.replace(/\r\n?/g, "\n") !== text) {
      toast.error("文件正在更新，请刷新后重试", { duration: 3000 });
      return;
    }
    active.current = index;
    const request = ++definitionRequest.current;
    setDefining(true);
    try {
      const location = await latest.current.onDefinition(
        slot,
        position ?? editor.state.selection.main.head,
        version.revision,
      );
      if (
        request !== definitionRequest.current ||
        editors.current[index] !== editor ||
        editor.state.doc.toString() !== text ||
        active.current !== index ||
        !editor.state.selection.main.eq(origin)
      )
        return;
      const previous = currentLocation(index);
      if (location && previous)
        await latest.current.navigation.jump(location, previous);
      else
        toast.message("未找到定义，请检查导入路径、项目配置和依赖是否可用", {
          duration: 3000,
        });
    } catch (error) {
      if (request === definitionRequest.current)
        toast.error(error instanceof Error ? error.message : String(error), {
          duration: 3000,
        });
    } finally {
      if (request === definitionRequest.current) setDefining(false);
    }
  };
  const identity =
    props.slots
      .map((slot) => (slot ? `${slot.path}:${slot.version}` : ""))
      .join("|") + `:${props.diff}:${props.single}:${props.dark}`;
  useEffect(() => {
    let disposed = false;
    const element = host.current!;
    active.current = props.active ?? 0;
    setDefinitionAvailable(canDefine(active.current));
    definitionRequest.current++;
    setDefining(false);
    const extensions = (index: number): Extension[] => [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.contentAttributes.of({ tabindex: "0" }),
      lineNumbers(),
      drawSelection(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      props.dark ? oneDark : syntaxHighlighting(defaultHighlightStyle),
      highlightSelectionMatches(),
      search({ caseSensitive: true }),
      EditorState.phrases.of({
        Find: "查找",
        next: "下一个",
        previous: "上一个",
        all: "全选匹配",
        "match case": "区分大小写",
        regexp: "正则",
        "by word": "全词",
        close: "关闭查找",
        "No matches": "无匹配结果",
      }),
      keymap.of([
        {
          key: "F12",
          run: () => {
            if (!canDefine(index)) return false;
            void jumpToDefinition(index);
            return true;
          },
        },
        { key: "Alt-ArrowLeft", run: () => navigate("back") },
        { key: "Alt-ArrowRight", run: () => navigate("forward") },
        ...searchKeymap.filter(({ run }) => run !== gotoLine),
        ...defaultKeymap,
      ]),
      EditorView.domEventHandlers({
        click: (event, view) => {
          active.current = index;
          latest.current.onActive?.(index);
          setDefinitionAvailable(canDefine(index));
          if (event.button !== 0 || (!event.metaKey && !event.ctrlKey))
            return false;
          if (!canDefine(index)) return false;
          const position = view.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });
          if (position === null || !view.state.wordAt(position)) return false;
          event.preventDefault();
          view.dispatch({ selection: { anchor: position } });
          view.focus();
          void jumpToDefinition(index, position);
          return true;
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.focusChanged && update.view.hasFocus) {
          active.current = index;
          latest.current.onActive?.(index);
          setDefinitionAvailable(canDefine(index));
        }
        if (
          (update.selectionSet || update.focusChanged) &&
          active.current === index
        ) {
          const position = update.state.selection.main.head;
          const line = update.state.doc.lineAt(position);
          setCursorLabel(
            "行 " + line.number + "，列 " + (position - line.from + 1),
          );
        }
        if (
          !update.selectionSet &&
          !(update.focusChanged && update.view.hasFocus)
        )
          return;
        const slot = latest.current.slots[index];
        if (!slot || active.current !== index) return;
        const range = update.state.selection.main;
        latest.current.onSelection({
          path: slot.path,
          version: slot.version,
          from: update.state.doc.lineAt(range.from).number,
          to: update.state.doc.lineAt(Math.max(range.from, range.to - 1))
            .number,
          text: update.state.sliceDoc(range.from, range.to),
          revision: latest.current.versions[index]?.revision,
        });
      }),
    ];
    const config = (index: number) => {
      const slot = props.slots[index];
      const previous =
        slot && saved.current.get(`${slot.path}:${slot.version}`);
      return {
        doc: props.versions[index]?.text ?? "",
        extensions: extensions(index),
        ...(previous?.revision &&
        previous.revision === props.versions[index]?.revision
          ? { selection: previous.selection }
          : {}),
      };
    };
    if (props.diff) {
      merge.current = new MergeView({
        a: config(0),
        b: config(1),
        parent: element,
        highlightChanges: true,
        gutter: true,
      });
      editors.current = [merge.current.a, merge.current.b];
      scrolls.current = props.slots.map((slot) =>
        slot
          ? (saved.current.get(`${slot.path}:${slot.version}`)?.scroll ??
            slot.scroll)
          : 0,
      );
      merge.current.dom.scrollTop = scrolls.current[props.active ?? 0];
    } else {
      editors.current = props.slots
        .slice(0, props.single ? 1 : 2)
        .map((slot, index) => {
          const container = document.createElement("div");
          container.className =
            "h-full min-w-0 overflow-hidden border-r last:border-r-0";
          element.append(container);
          if (!slot || !props.versions[index]) return null;
          const editor = new EditorView({
            ...config(index),
            parent: container,
          });
          editor.scrollDOM.scrollTop =
            saved.current.get(`${slot.path}:${slot.version}`)?.scroll ??
            slot.scroll;
          return editor;
        });
    }
    for (const [index, editor] of editors.current.entries()) {
      const slot = props.slots[index];
      if (!editor || !slot) continue;
      const language = LanguageDescription.matchFilename(languages, slot.path);
      if (language)
        void language
          .load()
          .then((support) => {
            if (!disposed)
              editor.dispatch({
                effects: StateEffect.appendConfig.of(support),
              });
          })
          .catch(() => {});
      editor.scrollDOM.addEventListener("scroll", () =>
        latest.current.onScroll(index, editor.scrollDOM.scrollTop),
      );
    }
    if (merge.current)
      merge.current.dom.addEventListener("scroll", () => {
        const top = merge.current!.dom.scrollTop;
        const indexes = latest.current.narrow
          ? [latest.current.active ?? 0]
          : [0, 1];
        for (const index of indexes) {
          scrolls.current[index] = top;
          latest.current.onScroll(index, top);
        }
      });
    return () => {
      disposed = true;
      definitionRequest.current++;
      saved.current.clear();
      editors.current.forEach((editor, index) => {
        const slot = props.slots[index];
        if (editor && slot)
          saved.current.set(`${slot.path}:${slot.version}`, {
            revision:
              latest.current.slots[index]?.path === slot.path
                ? latest.current.versions[index]?.revision
                : props.versions[index]?.revision,
            selection: {
              anchor: editor.state.selection.main.anchor,
              head: editor.state.selection.main.head,
            },
            scroll: merge.current
              ? scrolls.current[index]
              : editor.scrollDOM.scrollTop,
          });
      });
      if (merge.current) merge.current.destroy();
      else editors.current.forEach((view) => view?.destroy());
      merge.current = null;
      editors.current = [];
      element.replaceChildren();
    };
  }, [identity]);
  useLayoutEffect(() => {
    const next = props.active ?? 0;
    const previous = layout.current;
    if (
      merge.current &&
      (previous.narrow !== !!props.narrow ||
        (props.narrow && previous.active !== next))
    ) {
      scrolls.current[previous.active] = merge.current.dom.scrollTop;
      merge.current.dom.scrollTop = scrolls.current[next];
      editors.current.forEach((editor) => editor?.requestMeasure());
    }
    layout.current = { narrow: !!props.narrow, active: next };
  }, [props.narrow, props.active, identity]);
  useEffect(() => {
    let changed = false;
    props.versions.forEach((version, index) => {
      const editor = editors.current[index];
      if (
        !editor ||
        !version ||
        editor.state.doc.toString() === version.text.replace(/\r\n?/g, "\n")
      )
        return;
      changed = true;
      const top = editor.scrollDOM.scrollTop;
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: version.text },
      });
      editor.scrollDOM.scrollTop = top;
    });
    if (changed) {
      definitionRequest.current++;
      setDefining(false);
    }
  }, [props.versions[0]?.text, props.versions[1]?.text, identity]);
  useEffect(() => {
    active.current = props.active ?? 0;
    setDefinitionAvailable(canDefine(active.current));
    const editor = editors.current[active.current];
    const slot = props.slots[active.current];
    if (editor && slot) {
      const range = editor.state.selection.main;
      props.onSelection({
        path: slot.path,
        version: slot.version,
        from: editor.state.doc.lineAt(range.from).number,
        to: editor.state.doc.lineAt(Math.max(range.from, range.to - 1)).number,
        text: editor.state.sliceDoc(range.from, range.to),
        revision: props.versions[active.current]?.revision,
      });
    }
  }, [props.active, identity]);
  useEffect(() => {
    const line = props.target?.line;
    if (!line || props.target === applied.current.target) return;
    const index = props.slots.findIndex((slot) => slot?.version === "current");
    const editor = editors.current[index];
    if (editor) {
      applied.current.target = props.target;
      const from = editor.state.doc.line(
        Math.max(1, Math.min(line, editor.state.doc.lines)),
      ).from;
      editor.dispatch({
        selection: { anchor: from },
        effects: EditorView.scrollIntoView(from, { y: "center" }),
      });
      editor.focus();
    }
  }, [props.target, identity]);

  useEffect(() => {
    const location = props.location;
    if (!location || location === applied.current.location) return;
    const index = props.slots.findIndex(
      (slot) =>
        slot?.path === location.path && slot.version === location.version,
    );
    const editor = editors.current[index];
    if (!editor || props.versions[index]?.revision !== location.revision)
      return;
    active.current = index;
    applied.current.location = location;
    setDefinitionAvailable(canDefine(index));
    const from = Math.min(location.from, editor.state.doc.length);
    const to = Math.min(Math.max(from, location.to), editor.state.doc.length);
    editor.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    editor.focus();
  }, [props.location, identity]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <CodeToolbar
        navigation={props.navigation}
        navigate={navigate}
        definitionAvailable={definitionAvailable}
        defining={defining}
        jump={() => void jumpToDefinition()}
        cursorLabel={cursorLabel}
      />
      <div
        ref={host}
        className={cn(
          "min-h-0 min-w-0 flex-1 [&_.cm-content]:font-mono [&_.cm-content]:text-xs",
          "[&_.cm-search_label]:inline-flex [&_.cm-search_label]:items-center [&_.cm-search_label]:align-middle",
          props.diff
            ? "[&_.cm-mergeView]:h-full [&_.cm-mergeView]:overflow-auto [&_.cm-mergeViewEditors]:min-h-full [&_.cm-editor]:h-auto [&_.cm-editor]:min-h-full [&_.cm-scroller]:overflow-visible"
            : "grid [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto",
          !props.diff && (props.single ? "grid-cols-1" : "grid-cols-2"),
          props.diff &&
            props.narrow &&
            (props.active === 0 ? "cm-show-head" : "cm-show-current"),
        )}
      />
    </div>
  );
}
