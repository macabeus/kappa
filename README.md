# Kappa

<img src="./media/branding/logo.png" align="right" height="130px" />

[![GitHub Stars](https://flat.badgen.net/github/stars/macabeus/kappa?icon=github)](https://github.com/macabeus/kappa)
[![Visual Studio Marketplace Downloads](https://flat.badgen.net/vs-marketplace/d/macabeus.kappa?icon=visualstudio)](https://marketplace.visualstudio.com/items?itemName=macabeus.kappa)

VS Code extension designed to help you when decompiling a codebase.

- **✨ AI Prompt Builder:** Craft high-quality prompts to guide AI in decompiling a function.
- **🤖 Agent Mode:** Automatically decompile a given function, until it reache 100% match.
- **🐸 Integration with [decomp.me](https://decomp.me/):** Create a new scratch in one click.
- **🔌 Automated Code Fixes:** Use plugins to automatically update the code’s AST, eliminating repetitive tasks and correcting common errors.

> [📚 Learn how this project was developed on Substack](https://gambiconf.substack.com/p/development-journey-on-game-decompilation)

## ⚙️ Extension setup

<img alt="Walkthrough" src="./media/readme/walkthrough.png" />

Make sure to follow the Kappa Setup walkthrough to get the extension working on your project.

## ✨ AI Prompt Builder

<img alt="Build prompt" src="./media/readme/build-prompt.gif" />

Click on "Build prompt to decompile it" to create a context-aware prompt for decompiling an assembly function. It automatically analyzes your codebase to provide the AI with accurate context for the task.

The prompt includes:

- Real examples from your codebase: Functions that have already been decompiled (found via Git history)
- Function signatures of dependencies used in the target assembly
- Clear instructions and formatting rules for the AI

## 🤖 Agent Mode

https://github.com/user-attachments/assets/f8f5c135-fd9b-494f-92fd-a69044318567

Click on "Start agent to decompile it" to have VS Code Copilot automatically decompile the assembly function.

> **Note:** Make sure to have the "Agent" mode selected on GitHub Copilot before clicking on the code lens.

## 🎨 Commands

### Compare a symbol from two object files

Kappa bundles [`objdiff`](https://github.com/encounter/objdiff) into the extension. You can call it directly from the command palette by running `Compare a symbol from two object files`.

### Scatter Chart

<img alt="Scatter Chart" src="./media/readme/scatter-chart.png" />

You can plot a scatter chart to visualize clusters of functions with similar assembly code by running `Show chart`.

## 🔖 Language Model Tools

### `objdiff`

You can call [`objdiff`](https://github.com/encounter/objdiff) from the Copilot Chat to explain the diffs from a given function.

```
#objdiff explain the differences on this function.
The current object file is at `sa3/build/bu_bu.o`.
The target object file is at `sa3/expected/bu_bu.o`
```

## 🐸 Integration with decomp.me

<img width="491" height="77" alt="Decomp.me integration" src="https://github.com/user-attachments/assets/5b52f230-017d-4448-ba1e-d79c4b92cc79" />

Create a new scratch on decomp.me instantly by clicking the code lens that appears above assembly functions.

## 🔌 Kappa Plugins

<img alt="Kappa Plugins" src="./media/readme/kappa-plugins.gif" />

**Kappa plugins** are scripts that transform the Abstract Syntax Tree (AST) of C/C++ code blocks. They can be used to:

- Fix common decompilation errors
- Avoid repetitive tasks

### Example Kappa Plugin Case

For instance: When decompiling [Sonic Advance 3](https://github.com/SAT-R/sa3) using AI, it kept messing up by using raw numbers instead of the proper Q notation. So, we can [`ApplyQNotationPlugin`](./example-kappa-plugins/ApplyQNotationPlugin.js) that catches assignments to `Vec32` using a raw number and replaces it with the Q format.

```cpp
// Before: Raw decompiled code
player.x = 256;

// After: ApplyQNotationPlugin transformation
player.x = Q(1);
```

Check more examples on [`./example-kappa-plugins`](./example-kappa-plugins).

### How to use it

1. Add the plugins in a folder called `.kappa-plugins` from the workspace root.
2. Select a function
3. Run the action `Run Kappa Plugins`

## Contributing

- [Creating new plugins to use with the VS Code extension](./docs/create-your-own-kappa-plugin.md)
- [Developing the VS Code extension itself](./docs/developing-kappa-vscode-extension.md)
