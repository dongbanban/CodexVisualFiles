import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownCode } from "./MarkdownCode.js";
import { type FileData, type Slot, type FileVersion } from "../shared.js";
import { rpc, bridge } from "./bridge.js";
import { localReference } from "./file-utils.js";

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
}: {
  slot: Slot;
  version: FileVersion;
  bindingId: string;
  onOpen: (path: string, line?: number) => void;
  onScroll: (top: number) => void;
}) {
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    if (article.current) article.current.scrollTop = slot.scroll;
  }, [slot.path, slot.version]);
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
                  const target = document.getElementById(href.slice(1));
                  if (target && article.current?.contains(target))
                    target.scrollIntoView({ block: "start" });
                  return;
                }
                const relative = localReference(slot.path, href ?? "");
                if (relative) onOpen(relative);
                else if (href && /^https?:\/\//i.test(href))
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
    </article>
  );
}
