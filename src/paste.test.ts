import { describe, expect, it } from "vitest";
import { bracketedPaste, PASTE_END, PASTE_START } from "./paste.js";

describe("sending selected text to pi", () => {
  it("wraps the text in a bracketed paste, which pi has enabled", () => {
    expect(bracketedPaste("hello")).toBe(`${PASTE_START}hello${PASTE_END}`);
  });

  it("keeps multi-line text in one paste rather than line by line", () => {
    const payload = bracketedPaste("first\nsecond\nthird") ?? "";

    expect(payload.startsWith(PASTE_START)).toBe(true);
    expect(payload.endsWith(PASTE_END)).toBe(true);
    expect(payload.split(PASTE_START)).toHaveLength(2);
  });

  it("never ends with a carriage return, so nothing is submitted for the user", () => {
    for (const text of [
      "one line",
      "trailing newline\n",
      "windows\r\n",
      "bare\r",
    ]) {
      const payload = bracketedPaste(text);
      expect(payload?.endsWith(`\r${PASTE_END}`)).toBe(false);
    }
  });

  it("normalises windows and classic-mac line endings", () => {
    expect(bracketedPaste("a\r\nb\rc")).toBe(
      `${PASTE_START}a\nb\nc${PASTE_END}`,
    );
  });

  it("preserves interior blank lines, which carry meaning in a note", () => {
    expect(bracketedPaste("para one\n\npara two")).toContain(
      "para one\n\npara two",
    );
  });

  it("passes terminal escape sequences through as literal text", () => {
    // A note could contain anything; it is pasted, never interpreted, because
    // bracketed paste is exactly the mode that makes that true.
    const payload = bracketedPaste("\x1b[31mred\x1b[0m") ?? "";

    expect(payload).toContain("\x1b[31mred\x1b[0m");
  });

  it("declines to send nothing", () => {
    expect(bracketedPaste("")).toBeNull();
    expect(bracketedPaste("   \n\t  ")).toBeNull();
  });

  it("keeps text that only looks empty at the edges", () => {
    expect(bracketedPaste("  hello  ")).toBe(
      `${PASTE_START}  hello  ${PASTE_END}`,
    );
  });
});
