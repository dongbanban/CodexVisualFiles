import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownCode } from "./MarkdownCode.js";
import { type FileData, type Slot, type FileVersion } from "../shared.js";
import { rpc, bridge } from "./bridge.js";
import { localReference } from "./file-utils.js";
import type { OpenTarget } from "./file-utils.js";
import { markdownAnchors, linkAnchor } from "./markdown-anchors.js";

function RelatedImage({
  path,
  src,
  alt,
  bindingId,
}: {
  path: string;
  src: string;
  alt: string;
  bindingId: string;
}) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    const relative = localReference(path, src);
    if (relative)
      void rpc<FileData>("visualfiles_read", {
        bindingId,
        action: "file",
        path: relative,
      })
        .then((data) => {
          if (!cancelled) setSource(data.current.image);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, src, bindingId]);
  return source ? (
    <img src={source} alt={alt} />
  ) : (
    <span className="text-muted-foreground">[图片：{alt || src}]</span>
  );
}

export function FilePreview({
  slot,
  version,
  bindingId,
  onOpen,
  onScroll,
  target,
  onError,
}: {
  slot: Slot;
  version: FileVersion;
  bindingId: string;
  onOpen: (path: string, target?: OpenTarget) => void;
  onScroll: (top: number) => void;
  target?: OpenTarget;
  onError: (error: unknown) => void;
}) {
  const article = useRef<HTMLElement>(null);
  const locate = useCallback(
    (fragment: string) => {
      const target = Array.from(
        article.current?.querySelectorAll<HTMLElement>("[data-anchor], [id]") ??
          [],
      ).find(
        (node) => node.dataset.anchor === fragment || node.id === fragment,
      );
      if (target && article.current)
        article.current.scrollTop +=
          target.getBoundingClientRect().top -
          article.current.getBoundingClientRect().top;
      else onError(`未找到章节：${fragment || "（空锚点）"}`);
    },
    [onError],
  );
  useEffect(() => {
    if (article.current) article.current.scrollTop = slot.scroll;
  }, [slot.path, slot.version]);
  useEffect(() => {
    if (target?.anchor !== undefined && version.exists && !version.binary)
      locate(target.anchor);
  }, [target, slot.path, slot.version]);
  const rendered = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, markdownAnchors]}
        remarkRehypeOptions={{
          footnoteLabel: "脚注",
          footnoteBackLabel: "返回正文",
        }}
        components={{
          code: MarkdownCode,
          table: ({ children, ...props }) => (
            <div className="my-4 overflow-x-auto">
              <table {...props}>{children}</table>
            </div>
          ),
          img: ({ src, alt }) => (
            <RelatedImage
              path={slot.path}
              src={typeof src === "string" ? src : ""}
              alt={alt ?? ""}
              bindingId={bindingId}
            />
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                if (href?.startsWith("#")) {
                  try {
                    locate(linkAnchor(href)!);
                  } catch {
                    onError("章节链接编码无效");
                  }
                  return;
                }
                const relative = localReference(slot.path, href ?? "");
                if (relative) {
                  try {
                    onOpen(relative, {
                      anchor: linkAnchor(href ?? ""),
                      version: slot.version,
                    });
                  } catch {
                    onError("章节链接编码无效");
                  }
                } else if (href && /^https?:\/\//i.test(href))
                  void bridge.openLink({ url: href });
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {version.text}
      </ReactMarkdown>
    ),
    [version.text, slot.path, slot.version, bindingId, onOpen, onError, locate],
  );
  if (!version.exists)
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        文件不存在
      </div>
    );
  if (version.image)
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-muted/30 p-5 [&_img]:max-h-full [&_img]:max-w-full [&_img]:object-contain">
        <img src={version.image} alt={slot.path} />
      </div>
    );
  if (version.tooLarge)
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        文件大小 {(version.size / 1024 / 1024).toFixed(1)} MB，超过 12 MB
        预览上限。可复制路径在本机工具中查看。
      </div>
    );
  if (version.binary)
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        二进制文件 · {version.size.toLocaleString()} 字节
      </div>
    );
  return (
    <article
      ref={article}
      onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
      className="markdown-preview h-full overflow-auto p-6 text-sm leading-7 break-words [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:my-4 [&_h2]:text-xl [&_img]:max-w-full [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4"
    >
      {/\.mdx$/i.test(slot.path) && (
        <p className="mb-3 text-xs text-muted-foreground">
          MDX 仅以 Markdown 预览，组件和表达式不会执行。
        </p>
      )}
      {rendered}
    </article>
  );
}
