# Kappa

[![GitHub Stars](https://flat.badgen.net/github/stars/macabeus/kappa?icon=github)](https://github.com/macabeus/kappa)
[![Visual Studio Marketplace Downloads](https://flat.badgen.net/vs-marketplace/d/macabeus.kappa?icon=visualstudio)](https://marketplace.visualstudio.com/items?itemName=macabeus.kappa)

VS Code extension designed to help you when decompiling a codebase.

> ⚠️ **Work in Progress**: This extension is currently under active development. Features and APIs may change.

- **✅ AI Prompt Builder:** Craft high-quality prompts to guide AI in decompiling a function.
- **✅ Automated Code Fixes:** Use plugins to automatically update the code’s AST, eliminating repetitive tasks and correcting common errors.
- **🚧 Agent Mode:** Automatically decompile a given function, until it reache 100% match _(coming soon)_.
- **🚧 Integration with [decomp.me](https://decomp.me/):** Create a new scratch from VS Code _(coming soon)_.

## ⚙️ Extension setup

<img alt="Walkthrough" src="./media/readme/walkthrough.png" />

Make sure to follow the Kappa Setup walkthrough to configure the extension and your project to work properly.

## ✨ AI Prompt Builder

<img alt="Build prompt" src="./media/readme/build-prompt.gif" />

The **AI Prompt Builder** creates context-aware prompts for decompiling a assembly function. It automatically analyzes your codebase to provide the AI with an accurate context for this task.

The prompt includes:

- Real examples from your codebase: Functions that have already been decompiled (found via Git history)
- Function signatures of dependencies used in the target assembly
- Clear instructions and formatting rules for the AI

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
