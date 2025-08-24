// This file is simplified copy from https://github.com/clangd/vscode-clangd/blob/16efcdcf2fa8296fe8f14ea816da1ed9f8859595/src/ast.ts
import * as vscodelc from 'vscode-languageclient/node';

import type { ASTNode, ASTParams } from './vscode-clangd';

const ASTRequestMethod = 'textDocument/ast';

export const ASTRequestType = new vscodelc.RequestType<ASTParams, ASTNode | null, void>(ASTRequestMethod);
