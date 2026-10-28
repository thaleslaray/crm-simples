import { Lock } from "lucide-react";
import type { Note } from "../api";
import { messageTime } from "../format";

/** Nota interna: balão amarelo centralizado, nunca vai ao cliente. */
export function NoteBubble({ note }: { note: Note }) {
  return (
    <li className="note" data-testid="internal-note">
      <span className="note-head">
        <Lock size={14} aria-hidden="true" />
        <strong>{note.authorName ?? "Membro removido"}</strong>
        <span>nota interna, o cliente não vê</span>
        <time dateTime={new Date(note.createdAt).toISOString()}>{messageTime(note.createdAt)}</time>
      </span>
      <p>{note.text}</p>
    </li>
  );
}
