import { useCallback, useEffect, useState } from "react";
import { renderSVG } from "uqr";
import { ApiError, api, type Campaign, type CampaignChannel, type CampaignList, type Product } from "../api";
import { authClient } from "../auth-client";
import { onRealtime } from "../realtime";

const CHANNELS: { value: CampaignChannel; label: string }[] = [
  { value: "meta", label: "Meta" },
  { value: "google", label: "Google" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "outro", label: "Outro" },
];
const channelLabel = (c: CampaignChannel) => CHANNELS.find((x) => x.value === c)?.label ?? c;

const MAX_MESSAGE = 300;

/** QR code do link, gerado aqui no navegador (nada sai para serviço externo). */
const qrSrc = (link: string) => `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(link, { border: 2 }))}`;

function CampaignItem(props: { campaign: Campaign; onChanged: () => void; onError: (m: string | null) => void }) {
  const { campaign: c, onChanged, onError } = props;
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(c.message);

  async function copy() {
    if (!c.link) return;
    try {
      await navigator.clipboard.writeText(c.link);
      setCopied(true);
    } catch {
      setCopied(false);
      onError("Não foi possível copiar. Selecione o link e copie à mão.");
    }
  }

  async function saveMessage(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      await api.updateCampaign(c.id, { message });
      setEditing(false);
      onChanged();
    } catch (err) {
      onError(
        err instanceof ApiError && err.status === 400
          ? `A mensagem precisa ter o código #${c.code} e no máximo ${MAX_MESSAGE} letras.`
          : "Não foi possível salvar a mensagem.",
      );
    }
  }

  async function archive() {
    if (!confirm(`Arquivar a campanha "${c.name}"? Ela sai da lista de escolha e o histórico fica.`)) return;
    onError(null);
    try {
      await api.updateCampaign(c.id, { archived: true });
      onChanged();
    } catch {
      onError("Não foi possível arquivar.");
    }
  }

  return (
    <li>
      <div className="qr-item-text">
        <strong>{c.name}</strong>
        <span className="muted">
          {c.productName} · {channelLabel(c.channel)} · código <code>{c.code}</code>
        </span>
        {editing ? null : <span className="muted">{c.message}</span>}
      </div>
      {editing && (
        <form className="qr-form" onSubmit={saveMessage}>
          <label>
            Mensagem de {c.name}
            <textarea value={message} maxLength={MAX_MESSAGE} rows={3} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <p className="muted">O código #{c.code} precisa continuar na mensagem.</p>
          <div className="qr-actions">
            <button type="submit" disabled={!message.trim()}>
              Salvar mensagem
            </button>
            <button type="button" className="secondary" onClick={() => (setEditing(false), setMessage(c.message))}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {c.link ? (
        <>
          <input className="campaign-link" readOnly aria-label={`Link de ${c.name}`} value={c.link} onFocus={(e) => e.currentTarget.select()} />
          <div className="qr-actions">
            <button type="button" className="secondary" aria-label={`Copiar link de ${c.name}`} onClick={() => void copy()}>
              Copiar link
            </button>
            <button type="button" className="secondary" aria-label={`Ver QR code de ${c.name}`} aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
              {showQr ? "Esconder QR code" : "Ver QR code"}
            </button>
            {!editing && (
              <button type="button" className="secondary" aria-label={`Editar mensagem de ${c.name}`} onClick={() => setEditing(true)}>
                Editar mensagem
              </button>
            )}
            <button type="button" className="secondary" aria-label={`Arquivar ${c.name}`} onClick={() => void archive()}>
              Arquivar
            </button>
          </div>
          {copied && <p role="status">Link copiado.</p>}
          {showQr && <img className="campaign-qr" alt={`QR code do link de ${c.name}`} src={qrSrc(c.link)} width={200} height={200} />}
        </>
      ) : (
        <div className="qr-actions">
          {!editing && (
            <button type="button" className="secondary" aria-label={`Editar mensagem de ${c.name}`} onClick={() => setEditing(true)}>
              Editar mensagem
            </button>
          )}
          <button type="button" className="secondary" aria-label={`Arquivar ${c.name}`} onClick={() => void archive()}>
            Arquivar
          </button>
        </div>
      )}
    </li>
  );
}

/** Cadastro das campanhas (só admin; o servidor também barra): o CRM gera o código e o link do WhatsApp com QR code. */
export function CampaignsPage() {
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  const [list, setList] = useState<CampaignList | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("meta");

  const load = useCallback(() => {
    api.campaigns().then(setList).catch(() => undefined);
    api.products().then((r) => setProducts(r.products)).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    return onRealtime((e) => {
      if (e.type === "campaigns.changed" || e.type === "products.changed" || e.type === "connection.changed" || e.type === "reconnected") load();
    });
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createCampaign({ name, productId, channel });
      setName("");
      load();
    } catch {
      setError("Não foi possível criar. Confira o nome (até 80 letras) e o produto.");
    }
  }

  return (
    <main className="profile qr-admin">
      {!isAdmin ? (
        <p role="alert">Só o admin cadastra campanhas.</p>
      ) : (
        <>
          {list && !list.hasFunnel && (
            <p className="muted" role="status">
              Crie um funil antes: sem um funil com etapa, a conversa que chega com o código não vira negócio.
            </p>
          )}
          {list && !list.whatsappNumber && (
            <p className="muted" role="status">
              Conecte o número do WhatsApp para gerar o link.
            </p>
          )}
          <form className="qr-form" onSubmit={create}>
            <label>
              Nome da campanha
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Black Friday" maxLength={80} />
            </label>
            <label>
              Produto
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Escolha o produto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Canal
              <select value={channel} onChange={(e) => setChannel(e.target.value as CampaignChannel)}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="qr-actions">
              <button type="submit" disabled={!name.trim() || !productId}>
                Criar campanha
              </button>
            </div>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {list === null ? (
            <p className="muted">Carregando…</p>
          ) : list.campaigns.length === 0 ? (
            <p className="muted">Nenhuma campanha ainda.</p>
          ) : (
            <ul className="qr-list" aria-label="Campanhas cadastradas">
              {list.campaigns.map((c) => (
                <CampaignItem key={`${c.id}:${c.message}:${c.link ?? ""}`} campaign={c} onChanged={load} onError={setError} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
