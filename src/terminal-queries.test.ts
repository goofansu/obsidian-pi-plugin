import { describe, expect, it } from "vitest";
import { DA1_REPLY, DA2_REPLY, TerminalQueryFilter } from "./terminal-queries.js";

const run = (...chunks: string[]) => {
  const filter = new TerminalQueryFilter();
  return chunks.map((chunk) => filter.process(chunk));
};

describe("device attribute queries", () => {
  it.each([
    ["DA1 bare", "\x1b[c", DA1_REPLY],
    ["DA1 with an explicit zero", "\x1b[0c", DA1_REPLY],
    ["DA2", "\x1b[>c", DA2_REPLY],
    ["DA2 with an explicit zero", "\x1b[>0c", DA2_REPLY],
  ])("answers %s", (_label, query, expected) => {
    expect(run(query)[0].reply).toBe(expected);
  });

  it("leaves the query in the stream, since the core consumes it correctly", () => {
    expect(run("\x1b[c")[0].text).toBe("\x1b[c");
  });

  it("answers a query split across two reads", () => {
    const [first, second] = run("prompt \x1b[", "c rest");

    expect(first.reply).toBe("");
    expect(second.reply).toBe(DA1_REPLY);
  });
});

describe("terminfo capability queries", () => {
  const CO = "\x1b P+q436f\x1b\\".replace(/ /g, "");

  it("never lets the query reach the screen", () => {
    // This is the +q436f rubbish vim printed across the pane.
    expect(run(CO)[0].text).toBe("");
  });

  it("reports the capability unsupported, so the program stops waiting", () => {
    expect(run(CO)[0].reply).toBe("\x1bP0+r436f\x1b\\");
  });

  it("answers every capability in a batched query", () => {
    const batch = "\x1bP+q436f;6b7531\x1b\\";

    expect(run(batch)[0].reply).toBe("\x1bP0+r436f\x1b\\\x1bP0+r6b7531\x1b\\");
  });

  it("accepts a bell terminator as well as a string terminator", () => {
    expect(run("\x1bP+q436f\x07")[0].text).toBe("");
  });

  it("keeps the surrounding output intact", () => {
    const { text } = run(`before\x1bP+q436f\x1b\\after`)[0];

    expect(text).toBe("beforeafter");
  });

  it("hides a query split across two reads rather than printing half of it", () => {
    const [first, second] = run("\x1bP+q43", "6f\x1b\\done");

    expect(first.text).toBe("");
    expect(second.text).toBe("done");
    expect(second.reply).toBe("\x1bP0+r436f\x1b\\");
  });
});

describe("everything else passes through", () => {
  it("leaves ordinary text alone", () => {
    expect(run("~/code/research main\r\n> ")[0]).toEqual({
      text: "~/code/research main\r\n> ",
      reply: "",
    });
  });

  it("leaves colour and cursor sequences alone", () => {
    const styled = "\x1b[31mred\x1b[0m\x1b[2J\x1b[6n";

    expect(run(styled)[0]).toEqual({ text: styled, reply: "" });
  });

  it("does not mistake a bare letter c for a query", () => {
    expect(run("echo c\r\n")[0]).toEqual({ text: "echo c\r\n", reply: "" });
  });

  it("emits a lone escape rather than swallowing it", () => {
    expect(run("\x1bX")[0].text).toBe("\x1bX");
  });

  it("does not grow its buffer without bound on long output", () => {
    const filter = new TerminalQueryFilter();
    for (let i = 0; i < 500; i++) filter.process("x".repeat(1000));

    expect(filter.pending).toBe(0);
  });

  it("does not hold back an over-long fragment for ever", () => {
    const filter = new TerminalQueryFilter();
    filter.process(`\x1bP+q${"a".repeat(400)}`);

    expect(filter.pending).toBeLessThanOrEqual(256);
  });
});
