import { homedir } from "node:os";
import { join } from "node:path";

export const dataDirectory = () =>
  process.env.PLUGIN_DATA || join(homedir(), ".local", "share", "VisualFiles");
