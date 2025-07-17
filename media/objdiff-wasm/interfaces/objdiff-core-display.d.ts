/** @module Interface objdiff:core/display **/
export function displaySections(diff: ObjectDiff, filter: SymbolFilter, config: DisplayConfig): Array<SectionDisplay>;
export function displaySymbol(diff: ObjectDiff, symbol: SymbolRef): SymbolDisplay;
export function displayInstructionRow(diff: ObjectDiff, symbol: SymbolRef, rowIndex: number, config: DiffConfig): InstructionDiffRow;
export function symbolContext(diff: ObjectDiff, symbol: SymbolRef): Array<ContextItem>;
export function symbolHover(diff: ObjectDiff, symbol: SymbolRef): Array<HoverItem>;
export function instructionContext(diff: ObjectDiff, symbol: SymbolRef, rowIndex: number, config: DiffConfig): Array<ContextItem>;
export function instructionHover(diff: ObjectDiff, symbol: SymbolRef, rowIndex: number, config: DiffConfig): Array<HoverItem>;
export type Object = import('./objdiff-core-diff.js').Object;
export type ObjectDiff = import('./objdiff-core-diff.js').ObjectDiff;
export type DiffConfig = import('./objdiff-core-diff.js').DiffConfig;
export type SymbolInfo = import('./objdiff-core-diff.js').SymbolInfo;
export type SymbolRef = import('./objdiff-core-diff.js').SymbolRef;
export interface DisplayConfig {
  showHiddenSymbols: boolean,
  showMappedSymbols: boolean,
  reverseFnOrder: boolean,
}
export interface SymbolFilter {
  regex?: string,
  mapping?: SymbolRef,
}
export interface SectionDisplay {
  id: string,
  name: string,
  size: bigint,
  matchPercent?: number,
  symbols: Uint32Array,
}
export interface SymbolDisplay {
  info: SymbolInfo,
  targetSymbol?: SymbolRef,
  matchPercent?: number,
  diffScore?: [bigint, bigint],
  rowCount: number,
}
/**
 * # Variants
 * 
 * ## `"normal"`
 * 
 * ## `"extab"`
 */
export type SymbolNavigationKind = 'normal' | 'extab';
export interface ContextItemCopy {
  value: string,
  label?: string,
}
export interface ContextItemNavigate {
  label: string,
  symbol: SymbolRef,
  kind: SymbolNavigationKind,
}
export type ContextItem = ContextItemCopy | ContextItemNavigate | ContextItemSeparator;
export interface ContextItemCopy {
  tag: 'copy',
  val: ContextItemCopy,
}
export interface ContextItemNavigate {
  tag: 'navigate',
  val: ContextItemNavigate,
}
export interface ContextItemSeparator {
  tag: 'separator',
}
/**
 * # Variants
 * 
 * ## `"normal"`
 * 
 * ## `"emphasized"`
 * 
 * ## `"special"`
 * 
 * ## `"delete"`
 * 
 * ## `"insert"`
 */
export type HoverItemColor = 'normal' | 'emphasized' | 'special' | 'delete' | 'insert';
export interface HoverItemText {
  label: string,
  value: string,
  color: HoverItemColor,
}
export type HoverItem = HoverItemText | HoverItemSeparator;
export interface HoverItemText {
  tag: 'text',
  val: HoverItemText,
}
export interface HoverItemSeparator {
  tag: 'separator',
}
export interface DiffTextOpcode {
  mnemonic: string,
  opcode: number,
}
export interface DiffTextSymbol {
  name: string,
  demangledName?: string,
}
export type DiffText = DiffTextBasic | DiffTextLine | DiffTextAddress | DiffTextOpcode | DiffTextSigned | DiffTextUnsigned | DiffTextOpaque | DiffTextBranchDest | DiffTextSymbol | DiffTextAddend | DiffTextSpacing | DiffTextEol;
export interface DiffTextBasic {
  tag: 'basic',
  val: string,
}
export interface DiffTextLine {
  tag: 'line',
  val: number,
}
export interface DiffTextAddress {
  tag: 'address',
  val: bigint,
}
export interface DiffTextOpcode {
  tag: 'opcode',
  val: DiffTextOpcode,
}
export interface DiffTextSigned {
  tag: 'signed',
  val: bigint,
}
export interface DiffTextUnsigned {
  tag: 'unsigned',
  val: bigint,
}
export interface DiffTextOpaque {
  tag: 'opaque',
  val: string,
}
export interface DiffTextBranchDest {
  tag: 'branch-dest',
  val: bigint,
}
export interface DiffTextSymbol {
  tag: 'symbol',
  val: DiffTextSymbol,
}
export interface DiffTextAddend {
  tag: 'addend',
  val: bigint,
}
export interface DiffTextSpacing {
  tag: 'spacing',
  val: number,
}
export interface DiffTextEol {
  tag: 'eol',
}
export type DiffTextColor = DiffTextColorNormal | DiffTextColorDim | DiffTextColorBright | DiffTextColorReplace | DiffTextColorDelete | DiffTextColorInsert | DiffTextColorRotating;
export interface DiffTextColorNormal {
  tag: 'normal',
}
export interface DiffTextColorDim {
  tag: 'dim',
}
export interface DiffTextColorBright {
  tag: 'bright',
}
export interface DiffTextColorReplace {
  tag: 'replace',
}
export interface DiffTextColorDelete {
  tag: 'delete',
}
export interface DiffTextColorInsert {
  tag: 'insert',
}
export interface DiffTextColorRotating {
  tag: 'rotating',
  val: number,
}
export interface DiffTextSegment {
  text: DiffText,
  color: DiffTextColor,
  padTo: number,
}
/**
 * # Variants
 * 
 * ## `"none"`
 * 
 * ## `"op-mismatch"`
 * 
 * ## `"arg-mismatch"`
 * 
 * ## `"replace"`
 * 
 * ## `"insert"`
 * 
 * ## `"delete"`
 */
export type InstructionDiffKind = 'none' | 'op-mismatch' | 'arg-mismatch' | 'replace' | 'insert' | 'delete';
export interface InstructionDiffRow {
  segments: Array<DiffTextSegment>,
  diffKind: InstructionDiffKind,
}
