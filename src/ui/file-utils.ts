import { type FileData, type Slot, type Version } from "../shared.js";

export interface OpenTarget {
  line?: number;
  anchor?: string;
  version?: Version;
}

export const parent = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const base = (path: string) => path.split("/").pop() || "";
export const joinPath = (directory: string, name: string) =>
  directory ? `${directory}/${name}` : name;
export const ancestors = (path: string) => {
  const result = [""];
  let directory = parent(path);
  while (directory) {
    result.push(directory);
    directory = parent(directory);
  }
  return result;
};
export const textVersion = (data: FileData | undefined, slot: Slot | null) =>
  !data || !slot ? null : data[slot.version];
export const markdown = (path: string) => /\.(md|mdx|markdown)$/i.test(path);
export function localReference(path: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) return null;
  const parts = href.startsWith("/")
    ? []
    : parent(path).split("/").filter(Boolean);
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
