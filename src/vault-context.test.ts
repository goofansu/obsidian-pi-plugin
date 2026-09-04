import { describe, expect, it } from "vitest";
import { composeVaultContext } from "./vault-context.js";

describe("what every session is told at startup", () => {
  it("names the vault, so pi can say where it is without asking", () => {
    expect(composeVaultContext("research")).toContain('vault "research"');
  });

  it("says the working directory is the vault root, which makes paths openable", () => {
    expect(composeVaultContext("research")).toContain(
      "working directory is the vault's root",
    );
  });

  it("speaks about the user, not as the user, since pi is the 'I' here", () => {
    const text = composeVaultContext("research");

    expect(text).toContain("The user is in Obsidian");
    expect(text).not.toMatch(/\bI am\b/);
  });

  it("tells pi to open a described note rather than answering from the description", () => {
    // The description carries an outline and a summary property, which look
    // like enough to answer from. This is what outweighs them, and it is said
    // here rather than in every paste.
    expect(composeVaultContext("research")).toContain(
      "open the path and read it",
    );
  });

  it("says nothing about a particular note, which the user sends by hand", () => {
    const text = composeVaultContext("research");

    for (const word of ["Path:", "Cursor:", "Outline:", "Linked from:"]) {
      expect(text).not.toContain(word);
    }
  });

  it("carries a vault name with awkward characters through as written", () => {
    expect(composeVaultContext('my "notes" / 2026')).toContain(
      'my "notes" / 2026',
    );
  });

  it("stays short, since it is spent on every single session", () => {
    expect(composeVaultContext("research").length).toBeLessThan(400);
  });
});
