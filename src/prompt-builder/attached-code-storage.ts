/**
 * Simple storage for attached code that will be included in the next prompt
 */
class AttachedCodeStorage {
  private attachedCode: string | null = null;

  /**
   * Store code to be attached to the next prompt
   */
  attach(code: string): void {
    this.attachedCode = code;
  }

  /**
   * Get the attached code and clear it (one-shot behavior)
   */
  consumeAttached(): string | null {
    const code = this.attachedCode;
    this.attachedCode = null;
    return code;
  }

  /**
   * Check if there's code attached
   */
  hasAttached(): boolean {
    return this.attachedCode !== null;
  }

  /**
   * Clear attached code without consuming it
   */
  clear(): void {
    this.attachedCode = null;
  }
}

// Export a singleton instance
export const attachedCodeStorage = new AttachedCodeStorage();
