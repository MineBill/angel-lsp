# AngelScript Language Server for VSCode

![sample.png](sample.png)

# Freatures

- Syntax Highlight for AngelScript
- Type Checking
- Go to Definition
- Peek References
- Symbol Rename
- Symbol Completions
- Snippets
- Formatter

> Note: Since it is still under development, many features of AngelScript are not fully supported.


# Getting Started

Create the type definition you want to use in your application as `as.predefined` and put it directly under the workspace directory. This will give you symbol completion.

- Example: [`as.predefined`](./examples/OpenSiv3D/as.predefined) for OpenSiv3D


# TODO

- Module Support (`#include` and `import` statements)
- User Settings
- Handler Checking
- Code Action
- Debugger
