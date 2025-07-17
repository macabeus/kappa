/** @module Interface objdiff:core/diff **/
export function runDiff(left: Object | undefined, right: Object | undefined, config: DiffConfig, mapping: MappingConfig): DiffResult;
export interface MappingConfig {
  mappings: Array<[string, string]>,
  selectingLeft?: string,
  selectingRight?: string,
}
export type SymbolRef = number;
/**
 * # Variants
 * 
 * ## `"unknown"`
 * 
 * ## `"function"`
 * 
 * ## `"object"`
 * 
 * ## `"section"`
 */
export type SymbolKind = 'unknown' | 'function' | 'object' | 'section';
export interface SymbolFlags {
  global?: boolean,
  local?: boolean,
  weak?: boolean,
  common?: boolean,
  hidden?: boolean,
  hasExtra?: boolean,
  sizeInferred?: boolean,
  ignored?: boolean,
}
export interface SymbolInfo {
  id: SymbolRef,
  name: string,
  demangledName?: string,
  address: bigint,
  size: bigint,
  kind: SymbolKind,
  section?: number,
  sectionName?: string,
  flags: SymbolFlags,
  align?: number,
  virtualAddress?: bigint,
}
export interface DiffResult {
  left?: ObjectDiff,
  right?: ObjectDiff,
}

export class DiffConfig {
  constructor()
  setProperty(id: string, value: string): void;
  getProperty(id: string): string;
}

export class Object {
  /**
   * This type does not have a public constructor.
   */
  private constructor();
  static parse(data: Uint8Array, config: DiffConfig): Object;
  hash(): bigint;
}

export class ObjectDiff {
  /**
   * This type does not have a public constructor.
   */
  private constructor();
  findSymbol(name: string, sectionName: string | undefined): SymbolInfo | undefined;
  getSymbol(id: number): SymbolInfo | undefined;
}
