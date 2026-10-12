/** Code point ranges a terminal could act on: C0 but the line break, DEL and C1, separators, bidi. */
const CONTROL_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x09],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x202e],
  [0x2066, 0x2069],
];

function isControl(code: number): boolean {
  return CONTROL_RANGES.some(([low, high]) => code >= low && code <= high);
}

/**
 * Text for the terminal with every character a terminal could act on (controls other than the line
 * break, DEL, the C1 controls, line separators, bidi overrides) written as a `\uXXXX` escape. For
 * messages that may carry a string from outside, such as a schema error naming a label.
 */
export function escapeControls(text: string): string {
  return Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    return isControl(code) ? `\\u${code.toString(16).padStart(4, '0')}` : char;
  }).join('');
}

/**
 * A string from outside (a label, a folder) as a quoted JSON string for the terminal: JSON escapes
 * quotes and line breaks, and escapeControls the rest, so a value is always shown as characters
 * on one line and can never move the cursor or reorder the line.
 */
export function quote(text: string): string {
  return escapeControls(JSON.stringify(text));
}
