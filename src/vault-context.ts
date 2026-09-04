/**
 * What every session knows before it is asked anything: which vault it is in,
 * and that its working directory is that vault's root. Pure: no Obsidian, no
 * PTY, no DOM.
 *
 * This is the half of the old note attachment that was always true. It says
 * nothing about any particular note, so there is nothing here to guess wrong
 * and nothing to keep up to date — the note the user is reading is a separate
 * thing they send by hand, composed by `note-context.ts`.
 *
 * Written about the user rather than as the user. It is appended to Pi's own
 * system prompt, where "I" is Pi.
 */

/** The text appended to Pi's system prompt when a session starts. */
export function composeVaultContext(vaultName: string): string {
  return [
    "## The vault this session runs in",
    "",
    `The user is in Obsidian, in the vault "${vaultName}".`,
    "Your working directory is the vault's root, so every vault path you are",
    "given is one you can open.",
    "",
    // Said once here rather than in every note the user sends. It counteracts
    // a real pull: a note description carries an outline and a summary
    // property, which look like enough to answer from, so the instruction to
    // go to the source has to outweigh them.
    "When the user describes a note to you, the description names the file and",
    "carries none of its text: open the path and read it.",
  ].join("\n");
}
