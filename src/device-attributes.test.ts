import { describe, expect, it } from "vitest";
import {
  DA1_REPLY,
  DA2_REPLY,
  DeviceAttributeResponder,
} from "./device-attributes.js";

const respond = (...chunks: string[]) => {
  const responder = new DeviceAttributeResponder();
  return chunks.map((chunk) => responder.respond(chunk));
};

describe("answering device attribute queries", () => {
  it.each([
    ["DA1 bare", "\x1b[c", DA1_REPLY],
    ["DA1 with an explicit zero", "\x1b[0c", DA1_REPLY],
    ["DA2", "\x1b[>c", DA2_REPLY],
    ["DA2 with an explicit zero", "\x1b[>0c", DA2_REPLY],
  ])("answers %s", (_label, query, expected) => {
    expect(respond(query)).toEqual([expected]);
  });

  it("answers a query embedded in ordinary output", () => {
    expect(respond(`hello\x1b[cworld`)).toEqual([DA1_REPLY]);
  });

  it("answers every query in one chunk", () => {
    expect(respond("\x1b[c\x1b[>c")).toEqual([DA1_REPLY + DA2_REPLY]);
  });

  it("answers a query split across two chunks", () => {
    expect(respond("prompt \x1b[", "c rest")).toEqual(["", DA1_REPLY]);
  });

  it("answers a query split mid-parameter", () => {
    expect(respond("\x1b[>", "0c")).toEqual(["", DA2_REPLY]);
  });

  it("stays silent for output containing no query", () => {
    expect(respond("~/code/research main\r\n> ")).toEqual([""]);
  });

  it("does not mistake a bare letter c for a query", () => {
    expect(respond("echo c\r\n")).toEqual([""]);
  });

  it("leaves other escape sequences alone", () => {
    expect(respond("\x1b[31mred\x1b[0m\x1b[2J\x1b[6n")).toEqual([""]);
  });

  it("does not grow its buffer without bound on long output", () => {
    const responder = new DeviceAttributeResponder();
    for (let i = 0; i < 1000; i++) responder.respond("x".repeat(1000));

    expect(responder.pending).toBeLessThanOrEqual(32);
  });

  it("discards a partial sequence that turns out to be something else", () => {
    expect(respond("\x1b[", "31mred")).toEqual(["", ""]);
  });
});
