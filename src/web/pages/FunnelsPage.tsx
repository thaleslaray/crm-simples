import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { api, type Board, type BoardFilter, type ContactRow, type FunnelCard, type Member } from "../api";
import { authClient } from "../auth-client";
import { contactLabel, formatPhone } from "../format";
import { useFunnels } from "../funnels";
import { LabelChip, useLabels } from "../labels";
import { onRealtime } from "../realtime";

/** Move o card no quadro local (o mesmo que o servidor fará): tira de onde está e põe na etapa, na posição dada. */
function moveLocal(board: Board, contactId: string, stageId: string, index: number): Board {
  const card = board.stages.flatMap((s) => s.cards).find((c) => c.contactId === contactId);
  if (!card) return board;
  return {
    ...board,
    stages: board.stages.map((s) => {
      const rest = s.cards.filter((c) => c.contactId !== contactId);
      if (s.id !== stageId) return { ...s, cards: rest };
      const at = Math.min(Math.max(index, 0), rest.length);
      return { ...s, cards: [...rest.slice(0, at), card, ...rest.slice(at)] };
    }),
  };
}

type Drag = {
  contactId: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  over: { stageId: string; index: number } | null;
};

const EDGE = 48;
const STEP = 18;

/** Kanban de um funil: uma coluna por etapa e um card por contato; arrastar com mouse ou toque, ou escolher a etapa no card. */
export function FunnelsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  const funnels = useFunnels();
  const labels = useLabels();
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<BoardFilter>({ label: "", assignee: "" });
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
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

  async function applyMove(contactId: string, stageId: string, index?: number) {
    if (!funnelId || !board) return;
    const target = board.stages.find((s) => s.id === stageId);
    setNotice(null);
    setBoard(moveLocal(board, contactId, stageId, index ?? target?.cards.length ?? 0));
    try {
      await api.moveCard(funnelId, contactId, stageId, index);
    } catch {
      setNotice("Não foi possível mover o card.");
      load();
    }
  }

  async function removeCard(card: FunnelCard) {
    if (!funnelId) return;
    setNotice(null);
    try {
      await api.removeCard(funnelId, card.contactId);
      load();
    } catch {
      setNotice("Não foi possível tirar o contato do funil.");
    }
  }

  // ---- Arrastar (Pointer Events: o mesmo código serve para mouse e toque) ----

  function locate(x: number, y: number, contactId: string): Drag["over"] {
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
    const cards = [...best.querySelectorAll<HTMLElement>("[data-contact-id]")].filter((el) => el.dataset.contactId !== contactId);
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
    setDrag({ contactId: card.contactId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, over: null });
  }

  function onGripMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    edgeScroll(e.clientX, e.clientY);
    setDrag({ ...drag, dx: e.clientX - drag.startX, dy: e.clientY - drag.startY, over: locate(e.clientX, e.clientY, drag.contactId) });
  }

  function onGripUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const over = locate(e.clientX, e.clientY, drag.contactId);
    const moved = Math.abs(drag.dx) + Math.abs(drag.dy) > 4;
    setDrag(null);
    if (moved && over) void applyMove(drag.contactId, over.stageId, over.index);
  }

  /** Cards da etapa; durante o arraste, a linha de destino entra na posição calculada (sem contar o card arrastado). */
  function renderCards(stage: Board["stages"][number]) {
    const out: React.ReactNode[] = [];
    const overHere = drag?.over?.stageId === stage.id ? drag.over.index : -1;
    let k = 0;
    for (const card of stage.cards) {
      const dragging = drag?.contactId === card.contactId;
      if (!dragging && k === overHere) out.push(<li key="drop" className="kcard-drop" aria-hidden="true" />);
      if (!dragging) k++;
      out.push(
        <li
          key={card.contactId}
          className={`kcard${dragging ? " kcard--dragging" : ""}`}
          data-contact-id={card.contactId}
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
            onMove={(to) => void applyMove(card.contactId, to)}
            onRemove={() => void removeCard(card)}
          />
        </li>,
      );
    }
    if (overHere >= 0 && overHere >= k) out.push(<li key="drop" className="kcard-drop" aria-hidden="true" />);
    return out;
  }

  const taken = new Set(board?.stages.flatMap((s) => s.cards.map((c) => c.contactId)));

  if (funnels && id && !funnels.some((f) => f.id === id) && funnels[0]) return <Navigate to={`/funis/${funnels[0].id}`} replace />;

  return (
    <div className="shell funnels-page">
      <header className="topbar">
        <h1>Funis</h1>
        <div className="user">
          {isAdmin && <Link to="/funis/gerenciar">Gerenciar funis</Link>}
          <Link to="/">Voltar</Link>
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
          <div className="funnels-bar">
            <select aria-label="Funil" value={funnel?.id ?? ""} onChange={(e) => navigate(`/funis/${e.target.value}`)}>
              {funnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select aria-label="Filtrar por etiqueta" value={filter.label} onChange={(e) => setFilter((f) => ({ ...f, label: e.target.value }))}>
              <option value="">Todas as etiquetas</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
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
          {funnel && funnel.stages.length > 0 && <AddContact funnelId={funnel.id} stages={funnel.stages} taken={taken} onAdded={load} onError={setNotice} />}
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
                    {stage.name} <span className="muted">({stage.cards.length})</span>
                  </h2>
                  <ul>
                    {renderCards(stage)}
                    {stage.cards.length === 0 && !drag && <li className="muted board-empty">Sem cards</li>}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
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
}) {
  const { card } = props;
  const name = contactLabel(card);
  return (
    <>
      <div className="kcard-head">
        <button
          type="button"
          className="kcard-grip"
          aria-label={`Arrastar ${name}`}
          onPointerDown={props.onGripDown}
          onPointerMove={props.onGripMove}
          onPointerUp={props.onGripUp}
          onPointerCancel={props.onCancel}
        >
          ⠿
        </button>
        <div className="kcard-id">
          <strong>{name}</strong>
          {card.phone && <span className="muted">{formatPhone(card.phone)}</span>}
        </div>
      </div>
      {card.labels.length > 0 && (
        <div className="chips">
          {card.labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
      <span className="muted kcard-assignee">{card.assigneeName ? `Responsável: ${card.assigneeName}` : "Sem responsável"}</span>
      <div className="kcard-actions">
        {card.conversationId && <Link to={`/conversas/${card.conversationId}`}>Conversa</Link>}
        {card.conversationId && <Link to={`/conversas/${card.conversationId}?ficha=1`}>Ficha</Link>}
        <select aria-label={`Mover ${name} para`} value={props.stageId} onChange={(e) => props.onMove(e.target.value)}>
          {props.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" className="secondary" aria-label={`Tirar ${name} do funil`} onClick={props.onRemove}>
          Tirar
        </button>
      </div>
    </>
  );
}

/** Adiciona um contato ao funil: busca por nome ou telefone e etapa inicial. */
function AddContact(props: {
  funnelId: string;
  stages: { id: string; name: string }[];
  taken: Set<string>;
  onAdded: () => void;
  onError: (msg: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [stageId, setStageId] = useState(props.stages[0]!.id);
  const [rows, setRows] = useState<ContactRow[]>([]);
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
      await api.addCard(props.funnelId, row.id, stage);
      setQuery("");
      props.onAdded();
    } catch {
      props.onError("Não foi possível adicionar o contato.");
    }
  }

  const available = rows.filter((r) => !props.taken.has(r.id)).slice(0, 6);
  return (
    <details className="add-contact">
      <summary>Adicionar contato</summary>
      <div className="add-contact-body">
        <input type="search" aria-label="Buscar contato para adicionar" placeholder="Nome ou telefone" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Etapa inicial" value={stage} onChange={(e) => setStageId(e.target.value)}>
          {props.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {query.trim() && (
          <ul className="add-contact-results" aria-label="Contatos encontrados">
            {available.map((r) => (
              <li key={r.id}>
                <button type="button" className="secondary" onClick={() => void add(r)}>
                  Adicionar {contactLabel(r)}
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="muted">Nenhum contato disponível.</li>}
          </ul>
        )}
      </div>
    </details>
  );
}
