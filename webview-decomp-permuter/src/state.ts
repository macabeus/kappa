import { atom } from '@illuxiza/nanostores-immer';
import type { DecompPermuterLog } from 'kappa';

export const $state = atom({
  loading: true,
  importedPath: null as string | null,
  baseScore: null as number | null,
  permutations: {} as { [score: number]: { count: number } },
});

export const setLoadingFinished = () => {
  $state.mut((draft) => {
    draft.loading = false;
  });
};

export function setImportedPath(importedPath: string) {
  $state.mut((draft) => {
    draft.importedPath = importedPath;
  });
}

export function importLog(line: DecompPermuterLog) {
  $state.mut((draft) => {
    if (line.type === 'base-score') {
      draft.baseScore = line.value;
    } else if (line.type === 'new-best') {
      draft.permutations[line.value] = { count: 1 };
    } else if (line.type === 'better-score') {
      draft.permutations[line.value] = { count: 1 };
    } else if (line.type === 'same-score') {
      draft.permutations[line.value] ??= { count: 0 };
      draft.permutations[line.value].count += 1;
    }
  });
}
