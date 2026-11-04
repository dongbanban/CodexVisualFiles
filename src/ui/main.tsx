import { createRoot } from "react-dom/client";
import { applyDocumentTheme } from "@modelcontextprotocol/ext-apps";
import { bridge } from "./bridge.js";
import { Root } from "./Root.js";
import { errorText } from "./file-utils.js";

try {
  await bridge.connect();
  const theme = bridge.getHostContext()?.theme;
  if (theme) {
    applyDocumentTheme(theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
  createRoot(document.getElementById("app")!).render(<Root />);
} catch (error) {
  document.getElementById("app")!.textContent =
    `VisualFiles 连接失败：${errorText(error)}`;
}
