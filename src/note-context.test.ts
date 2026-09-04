import { describe, expect, it } from "vitest";
import {
  backlinksTo,
  composeNoteContext,
  headingTrail,
  LIMITS,
  type NoteSnapshot,
} from "./note-context.js";

const NOTE: NoteSnapshot = {
  path: "Projects/Pi plugin.md",
  frontmatter: null,
  aliases: [],
  tags: [],
  headings: [],
  links: [],
  embeds: [],
  backlinks: [],
  lineCount: null,
  cursorLine: null,
  selection: null,
};

const compose = (note: Partial<NoteSnapshot> = {}): string =>
  composeNoteContext({ ...NOTE, ...note }) ?? "";

const lines = (note: Partial<NoteSnapshot> = {}): string[] =>
  compose(note).split("\n");

/** The bullets under one labelled section, without the label. */
const section = (text: string, label: string): string[] => {
  const all = text.split("\n");
  const start = all.indexOf(`${label}:`);
  if (start === -1) return [];

  const items: string[] = [];
  for (const line of all.slice(start + 1)) {
    if (!/^\s*- /.test(line)) break;
    items.push(line.replace(/^(\s*)- /, "$1"));
  }
  return items;
};

describe("with no note in view", () => {
  it("says nothing at all, rather than describing an absent note", () => {
    expect(composeNoteContext(null)).toBeNull();
  });
});

describe("the note itself", () => {
  it("gives the vault-relative path, which is the path from pi's cwd", () => {
    expect(lines()).toContain("Path: `Projects/Pi plugin.md`");
  });

  it("leaves the vault to the session's own system prompt", () => {
    // Which vault, and that its root is the working directory, is told once at
    // startup by `vault-context.ts`. Repeating it in every paste would spend
    // context restating what pi already knows.
    expect(compose()).not.toMatch(/vault "/);
    expect(compose()).not.toContain("working directory");
  });

  it("never includes the note's text, which pi can read for itself", () => {
    // The snapshot has nowhere to put it: this is the rule, stated as a test.
    expect(Object.keys(NOTE)).not.toContain("content");
  });

  it("speaks as the user, since it lands in their editor for them to send", () => {
    expect(compose()).toContain("## The note I am reading");
  });

  it("ends where the facts end, with no closing note about itself", () => {
    // A pasted message is already read as true when sent, so saying it is a
    // snapshot is words spent on what its position in the thread conveys.
    // Telling pi to read the file is said once at startup instead.
    const composed = compose();

    expect(composed).not.toContain("snapshot");
    expect(composed).not.toContain("read the file");
    expect(composed.trimEnd()).toBe(composed);
  });

  it("stops after the last fact it has to report", () => {
    expect(lines({ backlinks: ["Index.md"] }).at(-1)).toBe("- `Index.md`");
    expect(lines().at(-1)).toBe("Path: `Projects/Pi plugin.md`");
  });

  it("reports the length when the note is open in an editor", () => {
    expect(lines({ lineCount: 214 })).toContain("Lines: 214");
  });

  it("says nothing about length when there is no editor to ask", () => {
    expect(compose()).not.toContain("Lines:");
  });
});

describe("where the user is in the note", () => {
  const headings = [
    { level: 1, heading: "Pi plugin", line: 0 },
    { level: 2, heading: "Why", line: 10 },
    { level: 3, heading: "Open questions", line: 20 },
    { level: 2, heading: "Later", line: 40 },
  ];

  it("gives the cursor line and the section holding it", () => {
    expect(lines({ headings, cursorLine: 25 })).toContain(
      'Cursor: line 25, under "Pi plugin > Why > Open questions"',
    );
  });

  it("gives the line alone when it is above every heading", () => {
    // Frontmatter, or a paragraph before the first heading.
    const later = headings.filter((heading) => heading.line > 0);

    expect(lines({ headings: later, cursorLine: 1 })).toContain(
      "Cursor: line 1",
    );
  });

  it("says nothing about a cursor when the note is only being read", () => {
    expect(compose({ headings })).not.toContain("Cursor:");
  });

  it("reports a selection as the lines it covers", () => {
    expect(
      lines({ cursorLine: 30, selection: { from: 25, to: 30 } }),
    ).toContain("Selected: lines 25 to 30");
  });

  it("reports a one-line selection as a single line", () => {
    expect(
      lines({ cursorLine: 25, selection: { from: 25, to: 25 } }),
    ).toContain("Selected: line 25");
  });

  it("says nothing about a selection when there is none", () => {
    expect(compose({ cursorLine: 25 })).not.toContain("Selected:");
  });
});

describe("headingTrail", () => {
  const headings = [
    { level: 1, heading: "Top", line: 0 },
    { level: 2, heading: "Middle", line: 5 },
    { level: 2, heading: "Sibling", line: 15 },
  ];

  it("walks the headings above a line, outermost first", () => {
    expect(headingTrail(headings, 10)).toEqual(["Top", "Middle"]);
  });

  it("replaces a heading with its sibling rather than nesting under it", () => {
    expect(headingTrail(headings, 20)).toEqual(["Top", "Sibling"]);
  });

  it("counts a heading's own line as inside it", () => {
    expect(headingTrail(headings, 6)).toEqual(["Top", "Middle"]);
  });

  it("is empty above the first heading", () => {
    const later = [{ level: 1, heading: "Top", line: 4 }];

    expect(headingTrail(later, 3)).toEqual([]);
  });

  it("counts the first heading's own line as inside it", () => {
    expect(headingTrail(headings, 1)).toEqual(["Top"]);
  });

  it("nests by the levels as written, not by one step at a time", () => {
    const jumped = [
      { level: 1, heading: "Top", line: 0 },
      { level: 4, heading: "Deep", line: 5 },
    ];

    expect(headingTrail(jumped, 10)).toEqual(["Top", "Deep"]);
  });
});

describe("the outline", () => {
  it("indents each heading by its level", () => {
    const text = compose({
      headings: [
        { level: 1, heading: "Pi plugin", line: 0 },
        { level: 2, heading: "Why", line: 4 },
      ],
    });

    expect(section(text, "Outline")).toEqual(["Pi plugin", "  Why"]);
  });

  it("is left out of a note with no headings", () => {
    expect(compose()).not.toContain("Outline:");
  });

  it("is cut off, and says by how much", () => {
    const many = Array.from({ length: LIMITS.headings + 3 }, (_, i) => ({
      level: 1,
      heading: `H${i}`,
      line: i,
    }));

    const items = section(compose({ headings: many }), "Outline");
    expect(items).toHaveLength(LIMITS.headings + 1);
    expect(items[items.length - 1]).toBe("and 3 more");
  });
});

describe("links out of the note", () => {
  it("resolves a wikilink to the file it reaches", () => {
    const text = compose({
      links: [{ text: "[[Obsidian]]", path: "Tools/Obsidian.md" }],
    });

    expect(section(text, "Links to")).toEqual([
      "[[Obsidian]] -> `Tools/Obsidian.md`",
    ]);
  });

  it("says a link is unwritten rather than dropping it", () => {
    const text = compose({ links: [{ text: "[[Zig]]", path: null }] });

    expect(section(text, "Links to")).toEqual(["[[Zig]] (not yet written)"]);
  });

  it("mentions a link once however often the note repeats it", () => {
    const link = { text: "[[Obsidian]]", path: "Tools/Obsidian.md" };
    const text = compose({ links: [link, link, link] });

    expect(section(text, "Links to")).toHaveLength(1);
  });

  it("keeps two links whose text differs but whose target does not", () => {
    const text = compose({
      links: [
        { text: "[[Obsidian]]", path: "Tools/Obsidian.md" },
        { text: "[[Obsidian|the app]]", path: "Tools/Obsidian.md" },
      ],
    });

    expect(section(text, "Links to")).toHaveLength(2);
  });

  it("lists embedded files separately from links", () => {
    const text = compose({
      embeds: [{ text: "![[pane.png]]", path: "Attachments/pane.png" }],
    });

    expect(section(text, "Embeds")).toEqual([
      "![[pane.png]] -> `Attachments/pane.png`",
    ]);
  });

  it("shortens a link long enough to be a paragraph", () => {
    const text = compose({
      links: [{ text: "[".repeat(LIMITS.value + 40), path: null }],
    });

    const [link = ""] = section(text, "Links to");
    expect(link).toContain("...");
    expect(link.length).toBeLessThan(LIMITS.value + 40);
  });
});

describe("backlinks", () => {
  it("lists the notes that link to this one", () => {
    const text = compose({ backlinks: ["Daily/2026-09-01.md"] });

    expect(section(text, "Linked from")).toEqual(["`Daily/2026-09-01.md`"]);
  });

  it("is left out when nothing links here", () => {
    expect(compose()).not.toContain("Linked from:");
  });
});

describe("backlinksTo", () => {
  const links = {
    "Daily/2026-09-01.md": { "Projects/Pi plugin.md": 2 },
    "Projects/Index.md": { "Projects/Pi plugin.md": 1, "Tools/Obsidian.md": 1 },
    "Tools/Obsidian.md": { "Tools/wterm.md": 1 },
  };

  it("finds every note linking to the given path", () => {
    expect(backlinksTo("Projects/Pi plugin.md", links)).toEqual([
      "Daily/2026-09-01.md",
      "Projects/Index.md",
    ]);
  });

  it("does not count a note as linking to itself", () => {
    expect(backlinksTo("Self.md", { "Self.md": { "Self.md": 1 } })).toEqual([]);
  });

  it("is empty for a note nothing links to", () => {
    expect(backlinksTo("Projects/Unlinked.md", links)).toEqual([]);
  });

  it("orders the result, so the same vault reads the same way twice", () => {
    expect(backlinksTo("Projects/Pi plugin.md", links)).toEqual(
      [...backlinksTo("Projects/Pi plugin.md", links)].sort(),
    );
  });
});

describe("tags and aliases", () => {
  it("lists tags on one line, as they are written in the note", () => {
    expect(lines({ tags: ["#project", "#tooling"] })).toContain(
      "Tags: #project, #tooling",
    );
  });

  it("lists aliases, quoted, since they are names with spaces in", () => {
    expect(lines({ aliases: ["Pi plugin", "pi-obsidian"] })).toContain(
      'Also known as: "Pi plugin", "pi-obsidian"',
    );
  });

  it("cuts a note tagged beyond reason off, and says by how much", () => {
    const many = Array.from({ length: LIMITS.tags + 2 }, (_, i) => `#tag${i}`);

    expect(compose({ tags: many })).toContain("and 2 more");
  });
});

describe("frontmatter properties", () => {
  it("reports each property as a line of its own", () => {
    const text = compose({
      frontmatter: { type: "project", status: "active" },
    });

    expect(section(text, "Properties")).toEqual([
      "type: project",
      "status: active",
    ]);
  });

  it("joins a list value, which is how Obsidian stores multiples", () => {
    const text = compose({ frontmatter: { people: ["Ada", "Grace"] } });

    expect(section(text, "Properties")).toEqual(["people: Ada, Grace"]);
  });

  it("keeps numbers, booleans, and dates readable", () => {
    const text = compose({
      frontmatter: { rating: 4, done: false, due: "2026-09-30" },
    });

    expect(section(text, "Properties")).toEqual([
      "rating: 4",
      "done: false",
      "due: 2026-09-30",
    ]);
  });

  it("renders a nested value as something other than [object Object]", () => {
    const text = compose({ frontmatter: { meta: { a: 1 } } });

    expect(section(text, "Properties")).toEqual(['meta: {"a":1}']);
  });

  it("leaves out tags and aliases, which have their own lines", () => {
    const text = compose({
      frontmatter: { tags: ["project"], aliases: ["Pi"], type: "project" },
    });

    expect(section(text, "Properties")).toEqual(["type: project"]);
  });

  it("leaves out the position Obsidian writes into the cache", () => {
    const text = compose({
      frontmatter: { position: { start: 0, end: 3 }, type: "project" },
    });

    expect(section(text, "Properties")).toEqual(["type: project"]);
  });

  it("leaves out a property with nothing in it", () => {
    const text = compose({
      frontmatter: { empty: "", nothing: null, none: [], type: "project" },
    });

    expect(section(text, "Properties")).toEqual(["type: project"]);
  });

  it("folds a multi-line value onto one line", () => {
    const text = compose({ frontmatter: { note: "one\ntwo\n\nthree" } });

    expect(section(text, "Properties")).toEqual(["note: one two three"]);
  });

  it("shortens a value long enough to be a note of its own", () => {
    const text = compose({ frontmatter: { summary: "x".repeat(500) } });
    const [property = ""] = section(text, "Properties");

    expect(property.length).toBeLessThan(LIMITS.value + 20);
    expect(property.endsWith("...")).toBe(true);
  });

  it("cuts a note with a hundred properties off, and says by how much", () => {
    const many = Object.fromEntries(
      Array.from({ length: LIMITS.properties + 5 }, (_, i) => [`k${i}`, i + 1]),
    );

    const items = section(compose({ frontmatter: many }), "Properties");
    expect(items).toHaveLength(LIMITS.properties + 1);
    expect(items[items.length - 1]).toBe("and 5 more");
  });

  it("is left out of a note with no frontmatter", () => {
    expect(compose()).not.toContain("Properties:");
  });
});

describe("the size of what is sent", () => {
  it("stays small for a note of ordinary size", () => {
    const text = compose({
      lineCount: 200,
      cursorLine: 100,
      frontmatter: { type: "project", status: "active" },
      tags: ["#project"],
      headings: Array.from({ length: 12 }, (_, i) => ({
        level: 2,
        heading: `Section ${i}`,
        line: i * 10,
      })),
      links: Array.from({ length: 8 }, (_, i) => ({
        text: `[[Note ${i}]]`,
        path: `Notes/Note ${i}.md`,
      })),
      backlinks: ["Projects/Index.md"],
    });

    expect(text.length).toBeLessThan(2000);
  });

  it("stays bounded however overgrown the note is", () => {
    const text = compose({
      frontmatter: Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [`k${i}`, "y".repeat(400)]),
      ),
      tags: Array.from({ length: 500 }, (_, i) => `#tag${i}`),
      aliases: Array.from({ length: 100 }, (_, i) => `alias ${i}`),
      headings: Array.from({ length: 400 }, (_, i) => ({
        level: 2,
        heading: `Section ${i}`,
        line: i,
      })),
      links: Array.from({ length: 400 }, (_, i) => ({
        text: `[[Note ${i}]]`,
        path: `Notes/Note ${i}.md`,
      })),
      embeds: Array.from({ length: 100 }, (_, i) => ({
        text: `![[img${i}.png]]`,
        path: `Attachments/img${i}.png`,
      })),
      backlinks: Array.from({ length: 900 }, (_, i) => `Daily/${i}.md`),
      lineCount: 40_000,
      cursorLine: 39_000,
      selection: { from: 1, to: 39_000 },
    });

    expect(text.length).toBeLessThan(8000);
  });
});
