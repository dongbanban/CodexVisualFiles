---
name: open-visualfiles
description: Open VisualFiles in a Codex panel when the user asks to open VisualFiles, the project explorer, or 文件树面板.
---

Open the panel with this plugin's `open_visualfiles` tool.

Use the current chat's explicitly selected local working directory as `workingDirectory`, including the actual worktree path when applicable. The plugin installation directory, a prior chat's folder, and the shell's default directory are not substitutes for a selected workspace.

Only source roots of already-registered local Codex projects and their managed Git worktrees can be opened. The server rejects unregistered directories. Do not create a project or register a directory merely to open the panel.

If no local workspace is selected or its identity cannot be established, omit `workingDirectory`. VisualFiles opens a chooser listing registered local Codex projects and their source directories. Choosing a project changes the file tree, not the chat's project or working directory.

VisualFiles shows one selected file, expanding to a HEAD/current comparison for changed files. It provides search, recursive file copy/cut/paste, recoverable deletion, and adding file/folder or code references to an unsent draft in the current or a new conversation. Opening or inspecting the panel does not authorize sending a message or changing project files. Perform those actions only when the user requests them.
