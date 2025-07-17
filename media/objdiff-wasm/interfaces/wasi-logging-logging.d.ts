/** @module Interface wasi:logging/logging@0.1.0-draft **/
export function log(level: Level, context: string, message: string): void;
/**
 * # Variants
 * 
 * ## `"trace"`
 * 
 * ## `"debug"`
 * 
 * ## `"info"`
 * 
 * ## `"warn"`
 * 
 * ## `"error"`
 * 
 * ## `"critical"`
 */
export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'critical';
