# Kappa

[![GitHub Stars](https://flat.badgen.net/github/stars/macabeus/kappa?icon=github)](https://github.com/macabeus/kappa)
[![Visual Studio Marketplace Downloads](https://flat.badgen.net/vs-marketplace/d/macabeus.kappa?icon=visualstudio)](https://marketplace.visualstudio.com/items?itemName=macabeus.kappa)

VS Code extension designed to help you when decompiling a codebase.

https://github.com/user-attachments/assets/6ec32aba-6e94-4011-bbcb-2c4ea7c807c3

> ⚠️ **Work in Progress**: This extension is currently under active development. Features and APIs may change.

- **✅ Automated Code Fixes:** Use plugins to automatically update the code’s AST, eliminating repetitive tasks and correcting common errors.
- **🚧 AI Prompt Builder:** Craft prompts to guide AI in decompiling functions _(coming soon)_.

## 🔌 Kappa Plugins

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

### How to use

1. Add the plugins in a folder called `.kappa-plugins` from the workspace root.
2. Select a function
3. Run the action `Run Kappa Plugins`

### Plugin Development

Want to create your own Kappa Plugin? Check out the [`example-kappa-plugins`](./example-kappa-plugins) directory for examples and templates.
