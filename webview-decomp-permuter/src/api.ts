import type { DecompPermuterLog } from 'kappa';

import * as state from './state';

export class DecompPermuterWebviewApi {
  setLoadingFinished() {
    state.setLoadingFinished();
  }

  setImportedPath(importedPath: string) {
    state.setImportedPath(importedPath);
  }

  postDecompOutput(output: DecompPermuterLog) {
    state.importLog(output);
  }
}
