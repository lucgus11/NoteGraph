// ---------------------------------------------------------------------------
// Web Worker : extraction des liens [[...]] et tags #tag depuis le Markdown.
// Tourne hors du thread principal pour préserver les 60 FPS de l'UI/graphe.
// ---------------------------------------------------------------------------
import type { ParseRequestMessage, ParseResponseMessage, ParsedNote } from "./types";

const LINK_RE = /\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g;
// Tag: # suivi de lettres/chiffres/-/_ , pas au sein d'un mot (évite "C#" isolé mais reste simple/léger)
const TAG_RE = /(^|\s)#([a-zA-Z0-9_\-À-ÿ]+)/g;

function parseNote(id: string, content: string): ParsedNote {
  const outgoingLinks = new Set<string>();
  const tags = new Set<string>();

  let m: RegExpExecArray | null;

  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(content)) !== null) {
    const name = m[1].trim();
    if (name) outgoingLinks.add(name);
  }

  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(content)) !== null) {
    const tag = m[2].trim();
    if (tag) tags.add(tag);
  }

  return { id, outgoingLinks: [...outgoingLinks], tags: [...tags] };
}

self.onmessage = (ev: MessageEvent<ParseRequestMessage>) => {
  const msg = ev.data;
  if (msg.type !== "parse-all") return;

  const parsed = msg.notes.map((n) => parseNote(n.id, n.content));

  const response: ParseResponseMessage = { type: "parse-result", parsed };
  (self as unknown as Worker).postMessage(response);
};

export {};
