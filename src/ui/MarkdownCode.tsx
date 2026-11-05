import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightTree } from "@lezer/highlight";

export function MarkdownCode({
  children,
  className,
  ...props
}: ComponentProps<"code">) {
  const text = String(children ?? "");
  const language = className?.match(/(?:^|\s)language-(\S+)/)?.[1];
  const [highlighted, setHighlighted] = useState<{
    text: string;
    language: string;
    nodes: ReactNode[];
  }>();
  useEffect(() => {
    if (!language) return;
    const description = LanguageDescription.matchLanguageName(
      languages,
      language,
    );
    if (!description) return;
    let cancelled = false;
    void description
      .load()
      .then((support) => {
        if (cancelled) return;
        const nodes: ReactNode[] = [];
        let position = 0;
        highlightTree(
          support.language.parser.parse(text),
          classHighlighter,
          (from, to, classes) => {
            if (from > position) nodes.push(text.slice(position, from));
            nodes.push(
              <span key={from} className={classes}>
                {text.slice(from, to)}
              </span>,
            );
            position = to;
          },
        );
        nodes.push(text.slice(position));
        setHighlighted({ text, language, nodes });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [language, text]);
  return (
    <code {...props} className={className}>
      {highlighted?.text === text && highlighted.language === language
        ? highlighted.nodes
        : children}
    </code>
  );
}
