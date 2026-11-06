import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { contactLabel, initials } from "../format";

/** Par de cores (fundo e inicial) estável do contato, derivado do id: o mesmo na lista e no cabeçalho. Os pares ficam em styles.css por tema. */
const colorOf = (id: string) => `avatar--c${[...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 8}`;

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
    <span className={`avatar avatar--initials ${colorOf(contact.id)} ${className}`} aria-hidden="true">
      {contact.name?.trim() ? initials(contactLabel(contact)) : <UserRound size={22} strokeWidth={1.75} />}
    </span>
  );
}
