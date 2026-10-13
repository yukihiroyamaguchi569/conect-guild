import { escapeForTerminal } from '@conect-guild/snapshot/settingsSchema';

/**
 * Text for the terminal with every character a terminal could act on but the line break written
 * as a `\\uXXXX` escape (escapeForTerminal, line by line). For messages that may carry a string
 * from outside, such as a schema error naming a label, and that keep their own line breaks.
 */
export function escapeControls(text: string): string {
  return text.split('\n').map(escapeForTerminal).join('\n');
}

/**
 * A string from outside (a label, a folder) as a quoted JSON string for the terminal: JSON escapes
 * quotes and line breaks, and escapeForTerminal the rest, so a value is always shown as characters
 * on one line and can never move the cursor or reorder the line.
 */
export function quote(text: string): string {
  return escapeForTerminal(JSON.stringify(text));
}
