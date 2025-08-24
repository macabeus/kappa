// This file is mostly a copy from https://github.com/clangd/vscode-clangd/blob/d3938b6266f4355797f1f27c4dbebda4c149fe89/src/api.ts
import { BaseLanguageClient } from 'vscode-languageclient';

import { ClangdApiV1, ClangdExtension } from './vscode-clangd';

export class ClangdExtensionImpl implements ClangdExtension {
  constructor(public client: BaseLanguageClient | undefined) {}

  public getApi(version: 1): ClangdApiV1;
  public getApi(version: number): unknown {
    if (version === 1) {
      return { languageClient: this.client };
    }

    throw new Error(`No API version ${version} found`);
  }
}
