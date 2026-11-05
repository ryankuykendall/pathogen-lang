/**
 * An error in another file, at its own line (docs/modules.md "In each tool":
 * "if that file is open, the error shows at its own line too"). A document's
 * check sends such errors to the files they happened in (getDiagnostics'
 * `alsoIn`), and each open file shows its own diagnostics together with what
 * the other open documents sent it. Publishing replaces a file's whole list,
 * so every publish goes through `for`.
 *
 * Files are matched by key, one spelling per file (samePathKey), so an
 * editor's URI and a project folder joined with a project path meet. No Node
 * or LSP connection here: the server computes the keys and publishes.
 */
import type { Diagnostic } from 'vscode-languageserver/node';

/** A diagnostic for another file, by that file's key. */
export interface SentDiagnostic {
  to: string;
  diagnostic: Diagnostic;
}

const sameDiagnostic = ({ range: { start, end }, severity, message }: Diagnostic): string =>
  `${start.line}:${start.character}-${end.line}:${end.character}:${severity}:${message}`;

export class CrossFileDiagnostics {
  /** Each checked document's own diagnostics, by URI. */
  private readonly own = new Map<string, Diagnostic[]>();

  /** What each checked document sent to other files, by the sender's URI. */
  private readonly sent = new Map<string, SentDiagnostic[]>();

  /**
   * A check of `uri` finished: its own diagnostics, and what it sends to
   * other files, which replaces what it sent before. Returns the keys of the
   * files it sent to, before or now, which need publishing again.
   */
  checked(uri: string, own: Diagnostic[], sent: SentDiagnostic[]): Set<string> {
    this.own.set(uri, own);
    return this.replaceSent(uri, sent);
  }

  /** `uri` closed: what it sent goes. Returns the keys of the files it had sent to. */
  closed(uri: string): Set<string> {
    this.own.delete(uri);
    return this.replaceSent(uri, []);
  }

  /**
   * What to publish for the open document `uri`, whose file is `key` (null
   * for one that isn't a saved file): its own diagnostics, then those other
   * documents sent it. One diagnostic two importers both sent shows once.
   */
  for(uri: string, key: string | null): Diagnostic[] {
    const out = [...(this.own.get(uri) ?? [])];
    if (key === null) return out;
    const seen = new Set(out.map(sameDiagnostic));
    [...this.sent]
      .filter(([from]) => from !== uri)
      .flatMap(([, list]) => list)
      .filter(({ to }) => to === key)
      .forEach(({ diagnostic }) => {
        const same = sameDiagnostic(diagnostic);
        if (seen.has(same)) return;
        seen.add(same);
        out.push(diagnostic);
      });
    return out;
  }

  private replaceSent(uri: string, sent: SentDiagnostic[]): Set<string> {
    const keys = new Set([...(this.sent.get(uri) ?? []), ...sent].map((s) => s.to));
    if (sent.length > 0) this.sent.set(uri, sent);
    else this.sent.delete(uri);
    return keys;
  }
}
