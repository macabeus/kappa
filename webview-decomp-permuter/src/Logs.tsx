import { useStore } from '@nanostores/react';
import { VscodeButton, VscodeIcon } from '@vscode-elements/react-elements';
import type { DecompPermuterOutput } from 'kappa';
import { useState } from 'react';

import { OutputCell } from './OutputCell';
import { $state } from './state';
import { messageDispatcher } from './vscode';

function isSameDecompPermuterOutput(a: DecompPermuterOutput | null, b: DecompPermuterOutput | null) {
  if (a === null || b === null) {
    return false;
  }

  if (a.type !== b.type) {
    return false;
  }

  if (a.type === 'base' && b.type === 'base') {
    return true;
  }

  if (a.type === 'output' && b.type === 'output') {
    return a.score === b.score && a.index === b.index;
  }

  return false;
}

export function Logs() {
  const state = useStore($state);
  const [selectedLeftCell, setSelectedLeftCell] = useState<DecompPermuterOutput | null>(null);
  const [selectedRightCell, setSelectedRightCell] = useState<DecompPermuterOutput | null>(null);

  // Convert permutations object to sorted array
  const sortedPermutations = Object.entries(state.permutations)
    .map(([score, data]) => ({ score: Number(score), count: data.count }))
    .sort((a, b) => a.score - b.score);

  const hasPermutations = sortedPermutations.length > 0;

  if (!hasPermutations) {
    return (
      <p className="m-0 italic" style={{ color: 'var(--vscode-descriptionForeground)' }}>
        No output yet better than the base score ({state.baseScore})...
      </p>
    );
  }

  const handleItemClick = (itemId: DecompPermuterOutput) => {
    if (!state.importedPath) {
      alert('No imported path found.');
      return;
    }

    messageDispatcher.api.openDecompPermuterOutput(itemId, state.importedPath);
  };

  const handleCompare = () => {
    if (!selectedLeftCell || !selectedRightCell) {
      alert('Please select one item on the left and one item on the right to compare.');
      return;
    }

    if (!state.importedPath) {
      alert('No imported path found.');
      return;
    }

    messageDispatcher.api.compareDecompPermuterOutput(selectedLeftCell, selectedRightCell, state.importedPath);
  };

  const handleStop = () => [messageDispatcher.api.stopDecompPermuter()];

  const handleRadioClick = (itemId: DecompPermuterOutput, position: 'left' | 'right') => {
    if (position === 'left') {
      setSelectedLeftCell((prev) => (isSameDecompPermuterOutput(prev, itemId) ? null : itemId));
    } else {
      setSelectedRightCell((prev) => (isSameDecompPermuterOutput(prev, itemId) ? null : itemId));
    }
  };

  const compareButtonLabel =
    selectedLeftCell && selectedRightCell
      ? `Compare ${selectedLeftCell.type === 'base' ? 'base' : `${selectedLeftCell.score}-${selectedLeftCell.index}`} ↔ ${
          selectedRightCell.type === 'base' ? 'base' : `${selectedRightCell.score}-${selectedRightCell.index}`
        }`
      : 'Select two items to compare';

  return (
    <div className="mb-6">
      <div className="mb-2">
        <h4 className="text-sm font-medium">Base Score: {state.baseScore}</h4>

        <OutputCell
          label="Base"
          isRadioLeftSelected={selectedLeftCell?.type === 'base'}
          isRadioRightSelected={selectedRightCell?.type === 'base'}
          onCellClick={() => handleItemClick({ type: 'base' })}
          onLeftRadioClick={() => handleRadioClick({ type: 'base' }, 'left')}
          onRightRadioClick={() => handleRadioClick({ type: 'base' }, 'right')}
        />
      </div>

      <div className="vscode-output-content mb-2 h-[384px]">
        <div className="relative m-0 space-y-4">
          {sortedPermutations.map(({ score, count }) => (
            <div key={score} className="space-y-2">
              <h4 className="text-sm font-medium">Score: {score}</h4>

              <div className="flex flex-wrap gap-2">
                {Array.from({ length: count }, (_, index) => {
                  const isSelectedLeft =
                    selectedLeftCell?.type === 'output' &&
                    selectedLeftCell.score === score &&
                    selectedLeftCell.index === index + 1;
                  const isSelectedRight =
                    selectedRightCell?.type === 'output' &&
                    selectedRightCell.score === score &&
                    selectedRightCell.index === index + 1;

                  const DecompPermuterOutput: DecompPermuterOutput = { type: 'output', score, index: index + 1 };

                  return (
                    <OutputCell
                      key={`${score}-${index + 1} `}
                      label={`#${index + 1} `}
                      isRadioLeftSelected={isSelectedLeft}
                      isRadioRightSelected={isSelectedRight}
                      onCellClick={() => handleItemClick(DecompPermuterOutput)}
                      onLeftRadioClick={() => handleRadioClick(DecompPermuterOutput, 'left')}
                      onRightRadioClick={() => handleRadioClick(DecompPermuterOutput, 'right')}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {state.loading && (
            <div className="absolute top-1 right-1 italic">
              <VscodeIcon name="loading" spin spin-duration="1" />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <VscodeButton disabled={!selectedLeftCell || !selectedRightCell} onClick={handleCompare}>
          {compareButtonLabel}
        </VscodeButton>

        <VscodeButton disabled={!state.loading} onClick={handleStop}>
          Stop
        </VscodeButton>
      </div>
    </div>
  );
}
