import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { contactLabel, initials } from "../format";

const COLORS = ["#00a884", "#ff7043", "#5c6bc0", "#26a69a", "#ab47bc", "#ef6c00", "#8d6e63", "#42a5f5"];

/** Cor estável do contato nas iniciais, derivada do id (a mesma na lista e no cabeçalho da conversa). */
const colorOf = (id: string) => COLORS[[...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % COLORS.length]!;

/** Foto do contato; sem foto (ou se a URL temporária falhar), iniciais coloridas ou o ícone de pessoa para número sem nome. */
export function ContactAvatar({
  contact,
  className = "",
}: {
  contact: { id: string; name: string | null; phone: string | null; avatarUrl: string | null };
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [contact.avatarUrl]);
  if (contact.avatarUrl && !broken)
    return <img className={`avatar ${className}`} src={contact.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return (
    <span className={`avatar avatar--initials ${className}`} style={{ background: colorOf(contact.id) }} aria-hidden="true">
      {contact.name?.trim() ? initials(contactLabel(contact)) : <UserRound size={22} strokeWidth={1.75} />}
    </span>
  );
}
