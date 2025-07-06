# Index Codebase

This command creates a database containing:

- Assembly code
- Corresponding decompiled code
- Embedding data from the assembly (when Voyage API Key is configured)

The database is stored in the workspace root directory. **It's recommended to include this database in your git repository**.

## Prerequisites & Assumptions

> **Note**: This extension is currently under active development and has some limitations.

The indexing process expects a specific project structure with the following directories:

### Required Directory Structure

- **`./asm/`** - Contains the original (non-decompiled) assembly functions
- **`./src/`** - Contains the decompiled C source code
- **`./build/`** - Contains the compiled assembly code generated from the C source
  - Assembly module files must match their corresponding C files

### Important Notes

- Ensure all three directories exist before running the indexing command
- For optimal results, configure your Voyage API Key to enable embedding functionality
