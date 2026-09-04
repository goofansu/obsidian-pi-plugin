/**
 * What Pi is told about the note the user is reading, and nothing else. Pure:
 * no Obsidian, no PTY, no DOM. `src/active-note.ts` reads Obsidian's caches
 * into a snapshot; this turns a snapshot into the text the user hands to Pi.
 *
 * It is written in the user's own voice, because that is where it lands: the
 * command pastes it into Pi's editor unsubmitted, so the user can add their
 * question to it before pressing enter.
 *
 * It ends where the facts end. It carries no closing note saying that it is a
 * snapshot, nor any instruction to read the file: a pasted message is already
 * read as true when sent, and the standing instruction to open the path lives
 * in the session's system prompt, where it is paid once rather than on every
 * press of the key. See `vault-context.ts`.
 *
 * The note's own text is deliberately absent. Pi runs in the vault and reads
 * any file it wants with its own tools, so repeating a note it can open would
 * only spend context. What Pi cannot work out for itself is everything else
 * here: which note is in view, where the cursor is in it, what its wikilinks
 * resolve to, and which notes link back to it. Obsidian keeps all of that in a
 * cache it built when the vault opened; reproducing it would mean reading every
 * note in the vault.
 */

/** A wikilink from the note, and what it resolves to, or null if nothing. */
export type NoteLink = { text: string; path: string | null };

export type NoteHeading = {
  /** 1 for `#`, 2 for `##`, and so on. */
  level: number;
  heading: string;
  /** Zero-based, as Obsidian reports it. */
  line: number;
};

/** Lines are 1-based, as the user is shown them, and inclusive. */
export type NoteSelection = { from: number; to: number };

export type NoteSnapshot = {
  /** Vault-relative, which is also the path from Pi's working directory. */
  path: string;
  /** Frontmatter as Obsidian parsed it, or null when the note has none. */
  frontmatter: Record<string, unknown> | null;
  aliases: string[];
  /** Every tag in the note, frontmatter and body alike, each with its `#`. */
  tags: string[];
  headings: NoteHeading[];
  links: NoteLink[];
  /** Embedded files, resolved to vault paths where they resolve. */
  embeds: NoteLink[];
  /** Vault paths of the notes that link to this one. */
  backlinks: string[];
  /** Only known while the note is open in an editor. */
  lineCount: number | null;
  /** 1-based. Only known while the note is open in an editor. */
  cursorLine: number | null;
  selection: NoteSelection | null;
};

/**
 * Every list is cut off, because this text is spent context and a vault can
 * hold a note with two hundred headings or an index with a thousand backlinks.
 * The cuts are announced rather than silent, so a truncated outline cannot be
 * read as a complete one.
 */
export const LIMITS = {
  aliases: 10,
  tags: 30,
  properties: 20,
  headings: 40,
  links: 30,
  embeds: 10,
  backlinks: 20,
  /** Characters, per frontmatter value. */
  value: 120,
} as const;

/**
 * Keys reported on their own line above, or written by Obsidian rather than by
 * the user. Repeating them among the properties would only be noise.
 */
const OMITTED_KEYS = new Set(["alias", "aliases", "position", "tag", "tags"]);

/**
 * The text handed to Pi, or null when there is no note in view. Null rather
 * than a note-shaped blank: the caller says so to the user instead, because
 * this is something they asked for and it did not happen.
 */
export function composeNoteContext(note: NoteSnapshot | null): string | null {
  if (!note) return null;

  const lines: string[] = [
    "## The note I am reading",
    "",
    // Which vault, and that its root is the working directory, is already in
    // the session's system prompt — see `vault-context.ts`. Repeating it in
    // every paste would only spend context saying what Pi was told at startup.
    `Path: ${code(note.path)}`,
  ];

  if (note.lineCount !== null) lines.push(`Lines: ${note.lineCount}`);
  lines.push(
    ...cursorLines(note),
    ...inlineSection("Also known as", note.aliases.map(quote), LIMITS.aliases),
    ...inlineSection("Tags", note.tags, LIMITS.tags),
    ...listSection(
      "Properties",
      properties(note.frontmatter),
      LIMITS.properties,
    ),
    ...listSection("Outline", outline(note.headings), LIMITS.headings),
    ...listSection("Links to", linkLines(note.links), LIMITS.links),
    ...listSection("Embeds", linkLines(note.embeds), LIMITS.embeds),
    ...listSection("Linked from", note.backlinks.map(code), LIMITS.backlinks),
  );

  return lines.join("\n");
}

/**
 * Which notes link to this one, read from the map Obsidian keeps of every
 * resolved link in the vault. A note that links to itself is not its own
 * backlink.
 */
export function backlinksTo(
  path: string,
  resolvedLinks: Record<string, Record<string, number>>,
): string[] {
  return Object.entries(resolvedLinks)
    .filter(
      ([source, targets]) => source !== path && targets[path] !== undefined,
    )
    .map(([source]) => source)
    .sort();
}

/**
 * The headings the cursor sits under, outermost first: a line number deep in a
 * note says little on its own, and the section holding it says a lot.
 *
 * Levels are read as they are written rather than assumed to step by one, so an
 * `###` directly below a `#` nests under it.
 */
export function headingTrail(headings: NoteHeading[], line: number): string[] {
  const trail: NoteHeading[] = [];
  for (const heading of headings) {
    // Obsidian counts heading lines from zero; `line` is the one the user sees.
    if (heading.line + 1 > line) break;
    while (trail.length > 0 && lastLevel(trail) >= heading.level) trail.pop();
    trail.push(heading);
  }
  return trail.map((heading) => heading.heading);
}

function lastLevel(trail: NoteHeading[]): number {
  return trail[trail.length - 1]?.level ?? 0;
}

function cursorLines(note: NoteSnapshot): string[] {
  if (note.cursorLine === null) return [];

  const trail = headingTrail(note.headings, note.cursorLine);
  const under = trail.length > 0 ? `, under "${trail.join(" > ")}"` : "";
  const lines = [`Cursor: line ${note.cursorLine}${under}`];

  const { selection } = note;
  if (selection) {
    lines.push(
      selection.from === selection.to
        ? `Selected: line ${selection.from}`
        : `Selected: lines ${selection.from} to ${selection.to}`,
    );
  }
  return lines;
}

/** A one-line section, for values short enough to read as a sentence. */
function inlineSection(
  label: string,
  items: string[],
  limit: number,
): string[] {
  if (items.length === 0) return [];

  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  const more = rest > 0 ? `, and ${rest} more` : "";
  return [`${label}: ${shown.join(", ")}${more}`];
}

/** A bulleted section, for values long enough to want a line each. */
function listSection(label: string, items: string[], limit: number): string[] {
  if (items.length === 0) return [];

  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  const lines = [`${label}:`, ...shown.map(bullet)];
  if (rest > 0) lines.push(`- and ${rest} more`);
  return lines;
}

/**
 * One list item. An item that arrives indented — an outline heading — keeps its
 * indentation ahead of the bullet, so the list nests as Markdown rather than
 * showing its spaces after the marker.
 */
function bullet(item: string): string {
  const indent = item.length - item.trimStart().length;
  return `${item.slice(0, indent)}- ${item.slice(indent)}`;
}

function outline(headings: NoteHeading[]): string[] {
  return headings.map(
    (heading) =>
      `${"  ".repeat(Math.max(0, heading.level - 1))}${heading.heading}`,
  );
}

/**
 * A link as the note writes it, and the file it reaches. An unresolved link is
 * named as such rather than dropped: a wikilink to a note that does not exist
 * yet is a fact about the vault, and is often the thing being worked on.
 */
function linkLines(items: NoteLink[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    const key = `${item.text} ${item.path ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = truncate(item.text);
    lines.push(
      item.path === null
        ? `${text} (not yet written)`
        : `${text} -> ${code(item.path)}`,
    );
  }
  return lines;
}

function properties(frontmatter: Record<string, unknown> | null): string[] {
  if (!frontmatter) return [];

  const lines: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (OMITTED_KEYS.has(key)) continue;
    const formatted = formatValue(value);
    if (formatted === null) continue;
    lines.push(`${key}: ${formatted}`);
  }
  return lines;
}

/**
 * A frontmatter value as one short line, or null when there is nothing to
 * report. Frontmatter is whatever YAML the user wrote, so every shape has to
 * arrive as something readable rather than as `[object Object]`.
 */
function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    const items = value.map(scalar).filter((item) => item !== "");
    return items.length > 0 ? truncate(items.join(", ")) : null;
  }

  if (typeof value === "object") {
    const text = scalar(value);
    return text === "" ? null : truncate(text);
  }

  const text = scalar(value);
  return text === "" ? null : truncate(text);
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      // A value that cannot be serialised — a cycle, most likely — is not worth
      // reporting, and is certainly not worth throwing over.
      return "";
    }
  }
  // Folded onto one line: a multi-line YAML value would otherwise break the
  // one-property-per-line shape this text is read as.
  return String(value).replace(/\s+/g, " ").trim();
}

function truncate(text: string): string {
  return text.length > LIMITS.value
    ? `${text.slice(0, LIMITS.value)}...`
    : text;
}

function code(text: string): string {
  return `\`${text}\``;
}

function quote(text: string): string {
  return `"${text}"`;
}
