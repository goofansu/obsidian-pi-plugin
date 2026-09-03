/**
 * Reading Obsidian for the note the user is in. This is the only module that
 * touches Obsidian's metadata cache, and it decides nothing: it copies what the
 * cache already holds into the plain snapshot `note-context.ts` formats, so
 * every rule about what Pi is told stays in the pure module beside the tests.
 *
 * Everything here comes from Obsidian's public API and from a cache that is
 * already in memory, so a session start costs no file reads.
 */

import {
  type App,
  type CachedMetadata,
  getAllTags,
  getLinkpath,
  parseFrontMatterAliases,
  type Reference,
  type TFile,
} from "obsidian";
import {
  backlinksTo,
  type NoteLink,
  type NoteSelection,
  type NoteSnapshot,
} from "./note-context.js";

/**
 * The note in view, or null when there is none — an empty workspace, or a pane
 * that is not a file.
 *
 * `getActiveFile` reports the last file the user was in rather than whatever
 * holds the keyboard, so this is still the user's note when it is called from
 * the sidebar pane that Pi is starting in. That is the whole reason the note
 * can be captured at all: revealing Pi's pane to start it must not change the
 * answer.
 */
export function readActiveNote(app: App): NoteSnapshot | null {
  const file = app.workspace.getActiveFile();
  if (!file) return null;

  const cache = app.metadataCache.getFileCache(file);

  return {
    vaultName: app.vault.getName(),
    path: file.path,
    frontmatter: frontmatterOf(cache),
    aliases: parseFrontMatterAliases(cache?.frontmatter ?? null) ?? [],
    // Both frontmatter and body tags, deduplicated, each with its leading `#`.
    tags: unique(cache ? (getAllTags(cache) ?? []) : []),
    headings: (cache?.headings ?? []).map((heading) => ({
      level: heading.level,
      heading: heading.heading,
      line: heading.position.start.line,
    })),
    links: resolveAll(app, file, cache?.links ?? []),
    embeds: resolveAll(app, file, cache?.embeds ?? []),
    backlinks: backlinksTo(file.path, app.metadataCache.resolvedLinks),
    ...editorState(app, file),
  };
}

/**
 * The cursor and the selection, which exist only while the note is open in an
 * editor: a note being read rather than edited has neither, and reading view
 * supplies no editor at all.
 *
 * The editor is checked against the file first. Obsidian keeps the last active
 * editor after focus moves to a sidebar pane, which is what makes this readable
 * from Pi's pane — but a stale editor for some other note would put a cursor
 * position on the wrong note, so a mismatch is treated as no editor.
 */
function editorState(
  app: App,
  file: TFile,
): Pick<NoteSnapshot, "lineCount" | "cursorLine" | "selection"> {
  const active = app.workspace.activeEditor;
  const editor = active?.file?.path === file.path ? active?.editor : undefined;
  if (!editor) return { lineCount: null, cursorLine: null, selection: null };

  return {
    lineCount: editor.lineCount(),
    // Obsidian counts from zero; the snapshot carries the line the user sees.
    cursorLine: editor.getCursor().line + 1,
    selection: selectionOf(
      editor.getSelection(),
      editor.getCursor("from").line,
      editor.getCursor("to").line,
    ),
  };
}

/** Which lines are selected, or null when nothing is. */
function selectionOf(
  selected: string,
  fromLine: number,
  toLine: number,
): NoteSelection | null {
  if (selected === "") return null;
  return { from: fromLine + 1, to: toLine + 1 };
}

/**
 * Each link as the note writes it, with the file it reaches. Resolution is the
 * point: `[[Some note]]` names a file only Obsidian's own rules can find, so a
 * resolved path saves Pi searching the vault for one — and an unresolved link
 * is reported as unwritten rather than sent as a path that does not exist.
 */
function resolveAll(app: App, file: TFile, refs: Reference[]): NoteLink[] {
  return refs.map((ref) => ({
    // The link as written, brackets included, so it can be found in the note.
    text: ref.original,
    path:
      app.metadataCache.getFirstLinkpathDest(
        // A link may carry a heading or block after `#`; the file is the part
        // before it.
        getLinkpath(ref.link),
        file.path,
      )?.path ?? null,
  }));
}

/**
 * Frontmatter, or null when the note has none. Obsidian hands out the cache's
 * own object, so it is copied rather than passed on: the pure module must not
 * be able to alter what Obsidian holds.
 */
function frontmatterOf(
  cache: CachedMetadata | null,
): Record<string, unknown> | null {
  if (!cache?.frontmatter) return null;
  return { ...cache.frontmatter };
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
