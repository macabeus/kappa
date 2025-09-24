import { VscodeRadio } from '@vscode-elements/react-elements';

type Props = {
  key?: string;
  label: string;
  isRadioLeftSelected: boolean;
  isRadioRightSelected: boolean;
  onCellClick: () => void;
  onLeftRadioClick: () => void;
  onRightRadioClick: () => void;
};

export function OutputCell(props: Props) {
  const { label, isRadioLeftSelected, isRadioRightSelected, key, onCellClick, onLeftRadioClick, onRightRadioClick } =
    props;

  const isSelected = isRadioLeftSelected || isRadioRightSelected;

  return (
    <div
      key={key}
      data-selected={isSelected}
      className="flex flex-col border rounded cursor-pointer min-w-[60px] min-h-[60px] transition-colors border-[var(--vscode-widget-border)] hover:bg-[var(--vscode-list-hoverBackground)] data-[selected=true]:bg-[var(--vscode-list-activeSelectionBackground)] data-[selected=true]:border-[var(--vscode-focusBorder)]"
      onClick={() => onCellClick()}
    >
      <div className="flex justify-between">
        <VscodeRadio
          name="left-selection"
          className="ml-1 w-[18px] h-[18px]"
          checked={isRadioLeftSelected}
          disabled={isRadioRightSelected}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onLeftRadioClick();
          }}
        />

        <VscodeRadio
          name="right-selection"
          className="mr-1 w-[18px] h-[18px]"
          checked={isRadioRightSelected}
          disabled={isRadioLeftSelected}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRightRadioClick();
          }}
        />
      </div>

      <div className="flex justify-center items-center h-full">{label}</div>
    </div>
  );
}
