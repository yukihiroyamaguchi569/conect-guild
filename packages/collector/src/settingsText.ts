/**
 * A string from outside (a label, a folder) as a quoted JSON string for the terminal. JSON escapes
 * quotes and the C0 controls (line breaks, ESC); the rest of what a terminal could act on (DEL,
 * the C1 controls, line separators, bidi overrides) is escaped here, so a value is always shown as
 * characters and can never move the cursor or reorder the line.
 */
export function quote(text: string): string {
  return JSON.stringify(text).replace(
    /[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
