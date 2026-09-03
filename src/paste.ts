/**
 * Selected note text is handed to Pi as a bracketed paste: Pi enables that mode
 * on startup, and it is what makes the text arrive as text. Every line lands in
 * Pi's editor at once, nothing is interpreted as a key sequence, and nothing is
 * submitted — the user still presses enter themselves.
 */

export const PASTE_START = "\x1b[200~";
export const PASTE_END = "\x1b[201~";

/** The bytes to write to the process, or null when there is nothing to send. */
export function bracketedPaste(text: string): string | null {
  if (text.trim() === "") return null;

  // Carriage returns are what a terminal reads as "submit"; normalising them
  // away means a pasted note can never press enter on the user's behalf.
  const normalised = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return `${PASTE_START}${normalised}${PASTE_END}`;
}
