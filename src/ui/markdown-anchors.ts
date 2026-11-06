interface MarkdownNode {
  type: string;
  value?: string;
  alt?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown> };
}

const text = (node: MarkdownNode): string =>
  node.value ?? node.alt ?? node.children?.map(text).join("") ?? "";

export function markdownAnchors() {
  return (tree: MarkdownNode) => {
    const used = new Set<string>();
    const visit = (node: MarkdownNode) => {
      if (node.type === "heading") {
        const base = text(node)
          .toLowerCase()
          .trim()
          .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
          .replace(/\s+/g, "-");
        let slug = base;
        let count = 0;
        while (used.has(slug)) slug = `${base}-${++count}`;
        used.add(slug);
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            "data-anchor": slug,
          },
        };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

export function linkAnchor(href: string): string | undefined {
  const hash = href.indexOf("#");
  if (hash < 0) return undefined;
  return decodeURIComponent(href.slice(hash + 1));
}
