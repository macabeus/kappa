// world root:component/root
export type Level = import('./interfaces/wasi-logging-logging.js').Level;
export type * as WasiLoggingLogging010Draft from './interfaces/wasi-logging-logging.js'; // import wasi:logging/logging@0.1.0-draft
export * as diff from './interfaces/objdiff-core-diff.js'; // export objdiff:core/diff
export * as display from './interfaces/objdiff-core-display.js'; // export objdiff:core/display
export function init(level: Level): void;
export function version(): string;
