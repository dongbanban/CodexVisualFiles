import { useEffect, useRef, useState } from "react";
import { EditorState, StateEffect, type Extension } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  drawSelection,
  keymap,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import {
  gotoLine,
  searchKeymap,
  highlightSelectionMatches,
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
import {
  ArrowLeft,
  ArrowRight,
  CornerDownRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "./chrome.js";
import type { Slot, FileVersion, DefinitionLocation } from "../shared.js";

export interface CodeSelection {
  path: string;
  version: "head" | "current";
  from: number;
  to: number;
  text: string;
}
interface Props {
  dark: boolean;
  slots: [Slot | null, Slot | null];
  versions: [FileVersion | null, FileVersion | null];
  diff: boolean;
  single?: boolean;
  onSelection: (selection: CodeSelection) => void;
  onScroll: (index: number, top: number) => void;
  line?: number;
  active?: number;
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
  const latest = useRef(props);
  latest.current = props;
  const active = useRef(props.active ?? 0);
  const [cursorLabel, setCursorLabel] = useState("行 1，列 1");
  const history = useRef<{
    back: Array<DefinitionLocation & { index: number }>;
    forward: Array<DefinitionLocation & { index: number }>;
  }>({ back: [], forward: [] });
  const [navigation, setNavigation] = useState({ back: false, forward: false });
  const [defining, setDefining] = useState(false);
  const definitionRequest = useRef(0);
  const publishHistory = () =>
    setNavigation({
      back: !!history.current.back.length,
      forward: !!history.current.forward.length,
    });
  const currentLocation = () => {
    const index = active.current;
    const editor = editors.current[index];
    if (!editor) return null;
    return {
      index,
      from: editor.state.selection.main.from,
      to: editor.state.selection.main.to,
    };
  };
  const moveTo = (
    location: DefinitionLocation & { index: number },
    remember = true,
  ) => {
    const editor = editors.current[location.index];
    if (!editor) return;
    const previous = currentLocation();
    if (
      remember &&
      previous &&
      (previous.index !== location.index ||
        previous.from !== location.from ||
        previous.to !== location.to)
    ) {
      history.current.back.push(previous);
      history.current.forward = [];
    }
    active.current = location.index;
    const from = Math.min(Math.max(0, location.from), editor.state.doc.length);
    const to = Math.min(Math.max(from, location.to), editor.state.doc.length);
    editor.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    editor.focus();
    publishHistory();
  };
  const navigate = (direction: "back" | "forward") => {
    const previous = currentLocation();
    const location = history.current[direction].pop();
    if (!location || !previous) return false;
    history.current[direction === "back" ? "forward" : "back"].push(previous);
    moveTo(location, false);
    return true;
  };
  const jumpToDefinition = async (
    index = active.current,
    position?: number,
  ) => {
    const editor = editors.current[index];
    const slot = latest.current.slots[index];
    const version = latest.current.versions[index];
    if (!editor || !slot || !version) return;
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
      if (location) moveTo({ ...location, index });
      else toast.message("未找到同一文件中的定义", { duration: 3000 });
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
    history.current = { back: [], forward: [] };
    publishHistory();
    definitionRequest.current++;
    setDefining(false);
    const extensions = (index: number): Extension[] => [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.contentAttributes.of({ tabindex: "0" }),
      lineNumbers(),
      drawSelection(),
      highlightActiveLineGutter(),
      props.dark ? oneDark : syntaxHighlighting(defaultHighlightStyle),
      highlightSelectionMatches(),
      keymap.of([
        {
          key: "F12",
          run: () => {
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
        mousedown: (event, view) => {
          active.current = index;
          if (event.button !== 0 || (!event.metaKey && !event.ctrlKey))
            return false;
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
        if (update.focusChanged && update.view.hasFocus) active.current = index;
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
        if (!update.selectionSet) return;
        const slot = latest.current.slots[index];
        if (!slot) return;
        const range = update.state.selection.main;
        latest.current.onSelection({
          path: slot.path,
          version: slot.version,
          from: update.state.doc.lineAt(range.from).number,
          to: update.state.doc.lineAt(range.to).number,
          text: update.state.sliceDoc(range.from, range.to),
        });
      }),
    ];
    const config = (index: number) => ({
      doc: latest.current.versions[index]?.text ?? "",
      extensions: extensions(index),
    });
    if (props.diff) {
      merge.current = new MergeView({
        a: config(0),
        b: config(1),
        parent: element,
        highlightChanges: true,
        gutter: true,
      });
      editors.current = [merge.current.a, merge.current.b];
      merge.current.dom.scrollTop = props.slots[0]?.scroll ?? 0;
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
          editor.scrollDOM.scrollTop = slot.scroll;
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
        latest.current.onScroll(0, top);
        latest.current.onScroll(1, top);
      });
    return () => {
      disposed = true;
      definitionRequest.current++;
      if (merge.current) merge.current.destroy();
      else editors.current.forEach((view) => view?.destroy());
      merge.current = null;
      editors.current = [];
      element.replaceChildren();
    };
  }, [identity]);
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
      history.current = { back: [], forward: [] };
      publishHistory();
      definitionRequest.current++;
      setDefining(false);
    }
  }, [props.versions[0]?.text, props.versions[1]?.text, identity]);
  useEffect(() => {
    active.current = props.active ?? 0;
  }, [props.active]);
  useEffect(() => {
    if (!props.line) return;
    for (const editor of editors.current)
      if (editor)
        editor.dispatch({
          effects: EditorView.scrollIntoView(
            editor.state.doc.line(Math.min(props.line, editor.state.doc.lines))
              .from,
            { y: "center" },
          ),
        });
  }, [props.line, identity]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-muted/15 px-2">
        <IconButton
          label="后退（Alt＋←）"
          disabled={!navigation.back}
          onClick={() => navigate("back")}
        >
          <ArrowLeft className="size-3.5" />
        </IconButton>
        <IconButton
          label="前进（Alt＋→）"
          disabled={!navigation.forward}
          onClick={() => navigate("forward")}
        >
          <ArrowRight className="size-3.5" />
        </IconButton>
        <IconButton
          label="转到定义（F12 或 ⌘/Ctrl＋点击）"
          disabled={defining}
          onClick={() => void jumpToDefinition()}
        >
          {defining ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CornerDownRight className="size-3.5" />
          )}
        </IconButton>
        <span className="ml-auto truncate text-[10px] text-muted-foreground">
          {cursorLabel}
        </span>
      </div>
      <div
        ref={host}
        className={cn(
          "min-h-0 min-w-0 flex-1 [&_.cm-content]:font-mono [&_.cm-content]:text-xs",
          "[&_.cm-search_label]:inline-flex [&_.cm-search_label]:items-center [&_.cm-search_label]:align-middle",
          props.diff
            ? "[&_.cm-mergeView]:h-full [&_.cm-mergeView]:overflow-auto [&_.cm-mergeViewEditors]:min-h-full [&_.cm-editor]:h-auto [&_.cm-editor]:min-h-full [&_.cm-scroller]:overflow-visible"
            : "grid [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto",
          !props.diff && (props.single ? "grid-cols-1" : "grid-cols-2"),
        )}
      />
    </div>
  );
}
