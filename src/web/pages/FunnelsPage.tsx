import { GripVertical, MoreVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { api, type Board, type BoardFilter, type ContactRow, type FunnelCard, type Member } from "../api";
import { CloseDealDialog, lostReasonLabel } from "../components/CloseDealDialog";
import { DealFields, draftToInput, emptyDraft, useActiveProducts } from "../components/DealFields";
import { authClient } from "../auth-client";
import { StatusPill } from "../components/StatusPill";
import { LabelTag } from "../components/LabelTag";
import { contactLabel, formatMoney, initials, listTime, messagePreview } from "../format";
import { useFunnels } from "../funnels";
import { useLabels } from "../labels";
import { onRealtime } from "../realtime";

/** Move o card no quadro local (o mesmo que o servidor fará): tira de onde está e põe na etapa, na posição dada. */
function moveLocal(board: Board, dealId: string, stageId: string, index: number): Board {
  const card = board.stages.flatMap((s) => s.cards).find((c) => c.dealId === dealId);
  if (!card) return board;
  return {
    ...board,
    stages: board.stages.map((s) => {
      const rest = s.cards.filter((c) => c.dealId !== dealId);
      if (s.id !== stageId) return { ...s, cards: rest };
      const at = Math.min(Math.max(index, 0), rest.length);
      return { ...s, cards: [...rest.slice(0, at), card, ...rest.slice(at)] };
    }),
  };
}

type Drag = {
  dealId: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  over: { stageId: string; index: number } | null;
};

const EDGE = 48;
const STEP = 18;

/** Kanban de um funil: uma coluna por etapa e um cartão por negócio; arrastar com mouse ou toque, ou escolher a etapa no card. */
export function FunnelsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  const funnels = useFunnels();
  const labels = useLabels();
  const products = useActiveProducts();
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<BoardFilter>({ label: "", assignee: "", product: "", status: "" });
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [closing, setClosing] = useState<{ card: FunnelCard; kind: "ganho" | "perdido" } | null>(null);
  const boardEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.members().then((r) => setMembers(r.members)).catch(() => undefined);
  }, []);

  const funnel = funnels?.find((f) => f.id === id) ?? funnels?.[0];
  const funnelId = funnel?.id;

  const load = useCallback(() => {
    if (!funnelId) return;
    api
      .board(funnelId, filter)
      .then((b) => (setBoard(b), setFailed(false)))
      .catch(() => setFailed(true));
  }, [funnelId, filter]);

  useEffect(() => {
    setBoard(null);
    load();
    return onRealtime((e) => {
      if (e.type === "reconnected" || e.type === "labels.changed" || e.type === "contact.updated" || e.type === "conversation.updated") return load();
      if (e.type === "funnel.changed" && e.funnelId === funnelId) load();
    });
  }, [load, funnelId]);

  async function applyMove(dealId: string, stageId: string, index?: number) {
    if (!funnelId || !board) return;
    const target = board.stages.find((s) => s.id === stageId);
    setNotice(null);
    setBoard(moveLocal(board, dealId, stageId, index ?? target?.cards.length ?? 0));
    try {
      await api.moveDeal(funnelId, dealId, stageId, index);
    } catch {
      setNotice("Não foi possível mover o negócio.");
      load();
    }
  }

  async function removeCard(card: FunnelCard) {
    if (!funnelId) return;
    setNotice(null);
    try {
      await api.removeDeal(funnelId, card.dealId);
      load();
    } catch {
      setNotice("Não foi possível remover o negócio.");
    }
  }

  async function reopenCard(card: FunnelCard) {
    if (!funnelId) return;
    setNotice(null);
    try {
      await api.reopenDeal(funnelId, card.dealId);
      load();
    } catch {
      setNotice("Não foi possível reabrir o negócio.");
    }
  }

  // ---- Arrastar (Pointer Events: o mesmo código serve para mouse e toque) ----

  function locate(x: number, y: number, dealId: string): Drag["over"] {
    const root = boardEl.current;
    if (!root) return null;
    const cols = [...root.querySelectorAll<HTMLElement>("[data-stage-id]")];
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const col of cols) {
      const r = col.getBoundingClientRect();
      const dist = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (dist < bestDist) (best = col), (bestDist = dist);
    }
    if (!best) return null;
    const cards = [...best.querySelectorAll<HTMLElement>("[data-deal-id]")].filter((el) => el.dataset.dealId !== dealId);
    const index = cards.filter((el) => {
      const r = el.getBoundingClientRect();
      return y > r.top + r.height / 2;
    }).length;
    return { stageId: best.dataset.stageId!, index };
  }

  function edgeScroll(x: number, y: number) {
    const root = boardEl.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    if (x < r.left + EDGE) root.scrollLeft -= STEP;
    else if (x > r.right - EDGE) root.scrollLeft += STEP;
    if (y < r.top + EDGE) root.scrollTop -= STEP;
    else if (y > r.bottom - EDGE) root.scrollTop += STEP;
  }

  function onGripDown(e: React.PointerEvent<HTMLButtonElement>, card: FunnelCard) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ dealId: card.dealId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, over: null });
  }

  function onGripMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    edgeScroll(e.clientX, e.clientY);
    setDrag({ ...drag, dx: e.clientX - drag.startX, dy: e.clientY - drag.startY, over: locate(e.clientX, e.clientY, drag.dealId) });
  }

  function onGripUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const over = locate(e.clientX, e.clientY, drag.dealId);
    const moved = Math.abs(drag.dx) + Math.abs(drag.dy) > 4;
    setDrag(null);
    if (moved && over) void applyMove(drag.dealId, over.stageId, over.index);
  }

  /** Cards da etapa; durante o arraste, a linha de destino entra na posição calculada (sem contar o card arrastado). */
  function renderCards(stage: Board["stages"][number]) {
    const out: React.ReactNode[] = [];
    const overHere = drag?.over?.stageId === stage.id ? drag.over.index : -1;
    let k = 0;
    for (const card of stage.cards.filter(matches)) {
      const dragging = drag?.dealId === card.dealId;
      if (!dragging && k === overHere) out.push(<li key="drop" className="kcard-drop" aria-hidden="true" />);
      if (!dragging) k++;
      out.push(
        <li
          key={card.dealId}
          className={`kcard${dragging ? " kcard--dragging" : ""}`}
          data-deal-id={card.dealId}
          style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
        >
          <Card
            card={card}
            stages={board!.stages}
            stageId={stage.id}
            onGripDown={(e) => onGripDown(e, card)}
            onGripMove={onGripMove}
            onGripUp={onGripUp}
            onCancel={() => setDrag(null)}
            onMove={(to) => void applyMove(card.dealId, to)}
            onRemove={() => void removeCard(card)}
            isAdmin={isAdmin}
            onClose={(kind) => setClosing({ card, kind })}
            onReopen={() => void reopenCard(card)}
          />
        </li>,
      );
    }
    if (overHere >= 0 && overHere >= k) out.push(<li key="drop" className="kcard-drop" aria-hidden="true" />);
    return out;
  }

  const needle = query.trim().toLowerCase();
  const matches = (c: FunnelCard) =>
    !needle || [contactLabel(c), c.phone ?? "", c.lastMessage ? messagePreview(c.lastMessage.type, c.lastMessage.text) : ""].some((t) => t.toLowerCase().includes(needle));

  if (funnels && id && !funnels.some((f) => f.id === id) && funnels[0]) return <Navigate to={`/funis/${funnels[0].id}`} replace />;

  return (
    <div className="shell funnels-page board-wrap">
      <header className="board-head">
        <h1>Funis</h1>
        {funnels && funnels.length > 0 && (
          <div className="chip-row" role="group" aria-label="Funil">
            {funnels.map((f) => (
              <button key={f.id} type="button" className={`chip${f.id === funnel?.id ? " on" : ""}`} aria-pressed={f.id === funnel?.id} onClick={() => navigate(`/funis/${f.id}`)}>
                {f.name}
              </button>
            ))}
          </div>
        )}
        <div className="board-head-end">
      <div className="funnels-bar">
        <input type="search" aria-label="Filtrar negócios" placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Filtrar por situação" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as BoardFilter["status"] }))}>
          <option value="">Abertos</option>
          <option value="ganho">Ganhos</option>
          <option value="perdido">Perdidos</option>
        </select>
        <select aria-label="Filtrar por etiqueta" value={filter.label} onChange={(e) => setFilter((f) => ({ ...f, label: e.target.value }))}>
          <option value="">Todas as etiquetas</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por produto" value={filter.product} onChange={(e) => setFilter((f) => ({ ...f, product: e.target.value }))}>
          <option value="">Todos os produtos</option>
          <option value="none">Sem produto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por responsável" value={filter.assignee} onChange={(e) => setFilter((f) => ({ ...f, assignee: e.target.value }))}>
          <option value="">Todos os responsáveis</option>
          <option value="me">Meus</option>
          <option value="none">Sem responsável</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
          {funnel && funnel.stages.length > 0 && <NewDeal funnelId={funnel.id} stages={funnel.stages} onAdded={load} onError={setNotice} />}
          {isAdmin && (
            <Link className="board-manage" to="/funis/gerenciar">
              Gerenciar funis
            </Link>
          )}
        </div>
      </header>
      {funnels === null ? (
        <p className="muted funnels-msg">Carregando…</p>
      ) : funnels.length === 0 ? (
        <p className="muted funnels-msg">
          Nenhum funil ainda. {isAdmin ? <Link to="/funis/gerenciar">Crie o primeiro.</Link> : "O admin ainda não criou funis."}
        </p>
      ) : (
        <>
          {notice && (
            <p className="error funnels-msg" role="alert">
              {notice}
            </p>
          )}
          {failed && !board && (
            <p className="error funnels-msg" role="alert">
              Não foi possível carregar o funil.
            </p>
          )}
          {funnel && funnel.stages.length === 0 && (
            <p className="muted funnels-msg">
              Este funil ainda não tem etapas. {isAdmin ? <Link to="/funis/gerenciar">Crie as etapas.</Link> : "Peça ao admin para criá-las."}
            </p>
          )}
          {board && (
            <div className={`board${drag ? " board--dragging" : ""}`} ref={boardEl} role="group" aria-label="Quadro do funil">
              {board.stages.map((stage) => (
                <section key={stage.id} className={`board-col${drag?.over?.stageId === stage.id ? " board-col--over" : ""}`} data-stage-id={stage.id} aria-label={`Etapa ${stage.name}`}>
                  <h2>
                    <span className="board-col-name">{stage.name}</span> <span className="board-count">{stage.cards.length}</span>
                  </h2>
                  <ul>
                    {renderCards(stage)}
                    {stage.cards.length === 0 && !drag && <li className="board-empty">{filter.status ? "Nenhum negócio" : "Arraste um negócio para cá"}</li>}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      {closing && (
        <CloseDealDialog
          funnelId={funnelId!}
          dealId={closing.card.dealId}
          kind={closing.kind}
          subject={[contactLabel(closing.card), closing.card.productName].filter(Boolean).join(" · ")}
          initialValueCents={closing.card.valueCents}
          onClose={() => setClosing(null)}
          onDone={() => (setClosing(null), load())}
        />
      )}
    </div>
  );
}

function Card(props: {
  card: FunnelCard;
  stages: Board["stages"];
  stageId: string;
  onGripDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onGripMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onGripUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCancel: () => void;
  onMove: (stageId: string) => void;
  onRemove: () => void;
  isAdmin: boolean;
  onClose: (kind: "ganho" | "perdido") => void;
  onReopen: () => void;
}) {
  const { card } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const name = contactLabel(card);
  const preview = card.lastMessage ? messagePreview(card.lastMessage.type, card.lastMessage.text) : "";
  const tags = card.labels.slice(0, 2);
  const more = card.labels.length - tags.length;
  // "Aberta" é o estado comum de quase todo card: o selo só aparece quando o status foge disso.
  const status = card.status === "aberta" ? null : card.status;
  const closed = card.dealStatus !== "aberto";
  const body = (
    <>
      <div className="kcard-line">
        <span className="avatar avatar--xs" aria-hidden="true">
          {card.avatarUrl ? <img src={card.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials(name)}
        </span>
        <span className="kcard-name">{name}</span>
        {card.lastMessage && <span className="kcard-time">{listTime(card.lastMessage.timestamp)}</span>}
      </div>
      {(card.productName || card.valueCents !== null) && (
        <p className="kcard-deal">
          {card.productName && <span className="kcard-product">{card.productName}</span>}
          {card.valueCents !== null && <span className="kcard-value">{formatMoney(card.valueCents)}</span>}
        </p>
      )}
      {card.originCampaignName && <p className="kcard-origin muted">Campanha: {card.originCampaignName}</p>}
      {closed && (
        <p className={`kcard-closed kcard-closed--${card.dealStatus}`}>
          <strong>{card.dealStatus === "ganho" ? "Ganho" : `Perdido: ${lostReasonLabel(card.lostReason)}`}</strong>
          {card.closedAt !== null && <span> · {new Date(card.closedAt).toLocaleDateString("pt-BR")}</span>}
        </p>
      )}
      {closed && card.lostNote && <p className="kcard-preview">{card.lostNote}</p>}
      {!closed && preview && <p className="kcard-preview">{preview}</p>}
      {(status || tags.length > 0) && (
        <div className="kcard-meta">
          {status && <StatusPill status={status} />}
          {tags.map((l) => (
            <LabelTag key={l.id} label={l} />
          ))}
          {more > 0 && <span className="label-tag label-tag--more">+{more}</span>}
        </div>
      )}
    </>
  );
  return (
    <>
      {card.conversationId ? (
        <Link className="kcard-main" to={`/conversas/${card.conversationId}`} aria-label={`Abrir conversa de ${name}`}>
          {body}
        </Link>
      ) : (
        <div className="kcard-main">{body}</div>
      )}
      <div className="kcard-tools">
        <div className="kcard-menu">
          <button type="button" className="kcard-more" aria-label={`Ações de ${name}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <MoreVertical size={18} aria-hidden="true" />
          </button>
          {menuOpen && (
          <div className="kcard-menu-body">
            {card.conversationId && <Link to={`/conversas/${card.conversationId}?ficha=1`}>Ficha</Link>}
            {closed ? (
              props.isAdmin && (
                <button type="button" className="secondary" aria-label={`Reabrir negócio de ${name}`} onClick={() => (setMenuOpen(false), props.onReopen())}>
                  Reabrir negócio
                </button>
              )
            ) : (
              <>
                <button type="button" className="secondary" aria-label={`Ganhou: ${name}`} onClick={() => (setMenuOpen(false), props.onClose("ganho"))}>
                  Ganhou
                </button>
                <button type="button" className="secondary" aria-label={`Perdeu: ${name}`} onClick={() => (setMenuOpen(false), props.onClose("perdido"))}>
                  Perdeu
                </button>
                <select aria-label={`Mover ${name} para`} value={props.stageId} onChange={(e) => props.onMove(e.target.value)}>
                  {props.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button type="button" className="secondary" aria-label={`Remover negócio de ${name}`} onClick={props.onRemove}>
              Remover negócio
            </button>
          </div>
          )}
        </div>
        {!closed && (
        <button
          type="button"
          className="kcard-grip"
          aria-label={`Arrastar ${name}`}
          onPointerDown={props.onGripDown}
          onPointerMove={props.onGripMove}
          onPointerUp={props.onGripUp}
          onPointerCancel={props.onCancel}
        >
          <GripVertical size={18} aria-hidden="true" />
        </button>
        )}
      </div>
    </>
  );
}

/** "+ Negócio": busca o contato, escolhe a etapa inicial e, se quiser, produto, valor e origem. */
function NewDeal(props: {
  funnelId: string;
  stages: { id: string; name: string }[];
  onAdded: () => void;
  onError: (msg: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [stageId, setStageId] = useState(props.stages[0]!.id);
  const [draft, setDraft] = useState(emptyDraft);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const box = useRef<HTMLDetailsElement>(null);
  const stage = props.stages.some((s) => s.id === stageId) ? stageId : props.stages[0]!.id;

  useEffect(() => {
    if (!query.trim()) return setRows([]);
    let alive = true;
    const timer = setTimeout(() => {
      api.contacts(query, "").then((r) => alive && setRows(r.contacts)).catch(() => undefined);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  async function add(row: ContactRow) {
    props.onError(null);
    try {
      await api.addDeal(props.funnelId, row.id, stage, draftToInput(draft));
      setQuery("");
      setDraft(emptyDraft);
      // O painel flutua sobre o quadro: fecha ao criar para não tapar os cartões.
      if (box.current) box.current.open = false;
      props.onAdded();
    } catch {
      props.onError("Não foi possível criar o negócio.");
    }
  }

  const available = rows.slice(0, 6);
  return (
    <details className="add-contact" ref={box}>
      <summary>
        <Plus size={16} aria-hidden="true" />
        Negócio
      </summary>
      <div className="add-contact-body">
        <input type="search" aria-label="Buscar contato do negócio" placeholder="Nome ou telefone" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label>
          Etapa inicial
          <select value={stage} onChange={(e) => setStageId(e.target.value)}>
            {props.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <DealFields draft={draft} onChange={setDraft} />
        {query.trim() && (
          <ul className="add-contact-results" aria-label="Contatos encontrados">
            {available.map((r) => (
              <li key={r.id}>
                <button type="button" className="secondary" onClick={() => void add(r)}>
                  Criar negócio para {contactLabel(r)}
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="muted">Nenhum contato encontrado.</li>}
          </ul>
        )}
      </div>
    </details>
  );
}
