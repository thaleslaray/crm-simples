import type { Message } from "../api";
import { formatPhone, formatSize, messagePreview } from "../format";

/** Conteúdo de uma bolha: texto, mídia (imagem, vídeo, áudio, documento, figurinha), localização ou contato. */
export function MessageBody({ message: m }: { message: Message }) {
  const caption = m.text ? <p>{m.text}</p> : null;

  if (m.media) {
    const url = `/api/media/${encodeURIComponent(m.id)}`;
    if (m.media.status === "pending")
      return (
        <>
          <p className="media-note" role="status">
            Carregando mídia…
          </p>
          {caption}
        </>
      );
    if (m.media.status === "failed")
      return (
        <>
          <p className="media-note media-note--error" role="alert">
            Não foi possível baixar a mídia
          </p>
          {caption}
        </>
      );
    if (m.media.status === "expired")
      return (
        <>
          <p className="media-note">Mídia expirada</p>
          {caption}
        </>
      );
    return (
      <>
        {m.type === "image" && <img className="media" src={url} alt={m.text ?? "Imagem recebida"} loading="lazy" />}
        {m.type === "sticker" && <img className="media media--sticker" src={url} alt="Figurinha" loading="lazy" />}
        {m.type === "video" && <video className="media" src={url} controls preload="metadata" playsInline />}
        {(m.type === "audio" || m.type === "voice") && (
          <audio className="media-audio" src={url} controls preload="metadata" aria-label={m.type === "voice" ? "Nota de voz" : "Áudio"} />
        )}
        {m.type === "document" && (
          <a className="media-doc" href={url} download={m.media.name ?? undefined}>
            <span className="media-doc-name">{m.media.name ?? "Documento"}</span>
            {m.media.size !== null && <span className="muted">{formatSize(m.media.size)}</span>}
          </a>
        )}
        {caption}
      </>
    );
  }

  if (m.location) {
    const { lat, lng, name, address } = m.location;
    return (
      <div className="card-inline">
        <strong>{name ?? "Localização"}</strong>
        {address && <span>{address}</span>}
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noreferrer noopener">
          Ver no mapa
        </a>
      </div>
    );
  }

  if (m.contact) {
    return (
      <div className="card-inline">
        <strong>{m.contact.name ?? "Contato"}</strong>
        {m.contact.phone && <span>{/^\d+$/.test(m.contact.phone) ? formatPhone(m.contact.phone) : m.contact.phone}</span>}
      </div>
    );
  }

  return <p>{messagePreview(m.type, m.text)}</p>;
}
