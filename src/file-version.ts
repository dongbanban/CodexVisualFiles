import { extname } from "node:path";
import { createHash } from "node:crypto";
import type { FileVersion } from "./shared.js";

export const MAX_PREVIEW_BYTES = 12 * 1024 * 1024;

const imageTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export const missing = (): FileVersion => ({
  exists: false,
  text: "",
  binary: false,
  size: 0,
});

export function fileVersion(data: Buffer | null, path: string): FileVersion {
  if (!data) return missing();
  if (data.length > MAX_PREVIEW_BYTES)
    return {
      exists: true,
      text: "",
      binary: true,
      size: data.length,
      tooLarge: true,
    };
  const mime = imageTypes[extname(path).toLowerCase()];
  if (mime)
    return {
      exists: true,
      text: "",
      image: `data:${mime};base64,${data.toString("base64")}`,
      binary: true,
      size: data.length,
    };
  const binary = data.subarray(0, 8192).includes(0);
  const text = binary ? "" : data.toString("utf8");
  return {
    exists: true,
    text,
    ...(binary
      ? {}
      : {
          revision: createHash("sha256")
            .update(text.replace(/\r\n?/g, "\n"))
            .digest("hex"),
        }),
    binary,
    size: data.length,
  };
}
