import * as vscode from 'vscode';
import { attachedCodeStorage } from './attached-code-storage';

/**
 * Status bar manager for showing attached code status
 */
export class AttachedCodeStatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'kappa.clearAttachedCode';
    this.updateStatusBar();
  }

  /**
   * Update the status bar to reflect current attached code state
   */
  updateStatusBar(): void {
    if (attachedCodeStorage.hasAttached()) {
      this.statusBarItem.text = '$(link) Code Attached';
      this.statusBarItem.tooltip = 'Code is attached for next decompilation prompt. Click to clear.';
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }

  /**
   * Dispose of the status bar item
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
