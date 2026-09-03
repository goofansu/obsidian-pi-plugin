/**
 * Answers, and where necessary hides, the queries programs send to a terminal
 * that the wterm core does not handle itself.
 *
 * Two kinds matter here:
 *
 * - Device attributes (`CSI c`, `CSI > c`). Pi sends one at startup and blocks
 *   for ten seconds waiting for a reply. The core consumes the query but never
 *   answers it, so only a reply is needed.
 * - Terminfo capability queries (`DCS + q … ST`, known as XTGETTCAP). vim sends
 *   a batch of these. The core does not recognise the sequence at all, so it
 *   prints the payload as text — the `+q436f+q6b75…` rubbish across the top of
 *   the pane. These must be removed from the stream as well as answered.
 */

/** VT100 with Advanced Video Option. */
export const DA1_REPLY = "\x1b[?1;2c";
/** Terminal id 0, firmware version 276, no cartridge. */
export const DA2_REPLY = "\x1b[>0;276;0c";

const ESC = "\x1b";
const ST = `${ESC}\\`;

/** Enough to hold the longest query while it is still arriving. */
const MAX_PENDING = 256;

const DEVICE_ATTRIBUTES = /^\x1b\[(>?)([0-9;]*)c/;
const CAPABILITY_QUERY = /^\x1bP\+q([0-9a-fA-F;]*)(?:\x1b\\|\x07)/;
/** A trailing fragment that could still turn into either query. */
const PARTIAL = /\x1b(\[[>0-9;]*|P\+?q?[0-9a-fA-F;]*\x1b?)?$/;

export type Filtered = {
  /** What should reach the terminal. */
  text: string;
  /** What should be written back to the process; "" when nothing is owed. */
  reply: string;
};

export class TerminalQueryFilter {
  private carry = "";

  /** How much of a possible query is buffered. Exposed for tests. */
  get pending(): number {
    return this.carry.length;
  }

  process(chunk: string): Filtered {
    const data = this.carry + chunk;
    this.carry = "";

    let text = "";
    let reply = "";
    let i = 0;

    while (i < data.length) {
      const next = data.indexOf(ESC, i);
      if (next === -1) {
        text += data.slice(i);
        break;
      }

      text += data.slice(i, next);
      const rest = data.slice(next);

      const capability = CAPABILITY_QUERY.exec(rest);
      if (capability) {
        // Removed from the stream, and each capability reported unsupported so
        // the program falls back to its terminfo entry instead of waiting.
        for (const cap of capability[1].split(";").filter(Boolean)) {
          reply += `${ESC}P0+r${cap}${ST}`;
        }
        i = next + capability[0].length;
        continue;
      }

      const attributes = DEVICE_ATTRIBUTES.exec(rest);
      if (attributes) {
        const [matched, secondary, parameters] = attributes;
        if (parameters === "" || parameters === "0") {
          reply += secondary === ">" ? DA2_REPLY : DA1_REPLY;
        }
        // Passed through: the core consumes this one correctly.
        text += matched;
        i = next + matched.length;
        continue;
      }

      const partial = PARTIAL.exec(rest);
      if (partial && partial[0] === rest && rest.length <= MAX_PENDING) {
        // Held back rather than printed, so a query split across two reads is
        // never rendered as text.
        this.carry = rest;
        break;
      }

      text += ESC;
      i = next + 1;
    }

    return { text, reply };
  }
}
