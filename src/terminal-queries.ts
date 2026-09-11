/**
 * Answers, and where necessary hides, the queries programs send to a terminal
 * that the wterm core does not handle itself.
 *
 * Three kinds matter here:
 *
 * - Device attributes (`CSI c`, `CSI > c`). Pi sends one at startup and blocks
 *   for ten seconds waiting for a reply. The core consumes the query but never
 *   answers it, so only a reply is needed.
 * - Terminfo capability queries (`DCS + q … ST`, known as XTGETTCAP). vim sends
 *   a batch of these. The core does not recognise the sequence at all, so it
 *   prints the payload as text — the `+q436f+q6b75…` rubbish across the top of
 *   the pane. These must be removed from the stream as well as answered.
 * - Appearance queries and notification modes. Pi uses these to select and
 *   update an automatic light/dark theme. They are answered or tracked here
 *   and removed because the core does not implement them.
 */

/** VT100 with Advanced Video Option. */
export const DA1_REPLY = "\x1b[?1;2c";
/** Terminal id 0, firmware version 276, no cartridge. */
export const DA2_REPLY = "\x1b[>0;276;0c";

const ESC = "\x1b";
const ST = `${ESC}\\`;

/** Enough to hold the longest query while it is still arriving. */
const MAX_PENDING = 256;

// The control characters are the point: these match terminal escape sequences,
// which begin with ESC and can end with ST or BEL.
// biome-ignore-start lint/suspicious/noControlCharactersInRegex: matching escape sequences
const DEVICE_ATTRIBUTES = /^\x1b\[(>?)([0-9;]*)c/;
const CAPABILITY_QUERY = /^\x1bP\+q([0-9a-fA-F;]*)(?:\x1b\\|\x07)/;
const APPEARANCE_QUERY = "\x1b[?996n";
const ENABLE_APPEARANCE_NOTIFICATIONS = "\x1b[?2031h";
const DISABLE_APPEARANCE_NOTIFICATIONS = "\x1b[?2031l";
/** A trailing fragment that could still turn into a supported query. */
const PARTIAL = /\x1b(\[[>?0-9;]*|P\+?q?[0-9a-fA-F;]*\x1b?)?$/;
// biome-ignore-end lint/suspicious/noControlCharactersInRegex: matching escape sequences

export type Appearance = "light" | "dark";

export type Filtered = {
  /** What should reach the terminal. */
  text: string;
  /** What should be written back to the process; "" when nothing is owed. */
  reply: string;
};

export class TerminalQueryFilter {
  private carry = "";
  private appearanceNotifications = false;

  /** How much of a possible query is buffered. Exposed for tests. */
  get pending(): number {
    return this.carry.length;
  }

  /** A report for a runtime transition, when the process subscribed to them. */
  appearanceChanged(appearance: Appearance): string {
    return this.appearanceNotifications ? appearanceReport(appearance) : "";
  }

  process(chunk: string, appearance: Appearance): Filtered {
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

      if (rest.startsWith(APPEARANCE_QUERY)) {
        reply += appearanceReport(appearance);
        i = next + APPEARANCE_QUERY.length;
        continue;
      }

      if (rest.startsWith(ENABLE_APPEARANCE_NOTIFICATIONS)) {
        this.appearanceNotifications = true;
        i = next + ENABLE_APPEARANCE_NOTIFICATIONS.length;
        continue;
      }

      if (rest.startsWith(DISABLE_APPEARANCE_NOTIFICATIONS)) {
        this.appearanceNotifications = false;
        i = next + DISABLE_APPEARANCE_NOTIFICATIONS.length;
        continue;
      }

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

function appearanceReport(appearance: Appearance): string {
  return `${ESC}[?997;${appearance === "dark" ? "1" : "2"}n`;
}
