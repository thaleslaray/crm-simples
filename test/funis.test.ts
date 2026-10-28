import { describe, expect, it } from "vitest";
import { assume, conversationOf, inbox } from "./helpers/conversations";
import { applyLabel, newLabel } from "./helpers/etiquetas";
import { ficha } from "./helpers/ficha";
import { connectRealtime } from "./helpers/realtime";
import {
  addCard,
  addStage,
  board,
  createFunnel,
  deleteFunnel,
  deleteStage,
  layout,
  listFunnels,
  moveCard,
  newClient,
  newFunnel,
  removeCard,
  renameFunnel,
  renameStage,
  reorderStages,
} from "./helpers/funis";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";

describe("Funis: cadastro", () => {
  it("admin cria funil com etapas e todo membro o ve na lista, com as etapas em ordem", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();

    const res = await createFunnel(admin, "Vendas");
    expect(res.status).toBe(201);
    const { funnel } = (await res.json()) as { funnel: { id: string } };
    await addStage(admin, funnel.id, "Novo");
    await addStage(admin, funnel.id, "Proposta");

    expect(await listFunnels(atendente)).toMatchObject([{ name: "Vendas", stages: [{ name: "Novo" }, { name: "Proposta" }] }]);
  });

  it("atendente nao cria, renomeia nem apaga funis e etapas", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const vendas = await newFunnel(admin, "Vendas", ["Novo"]);

    expect((await createFunnel(atendente, "X")).status).toBe(403);
    expect((await renameFunnel(atendente, vendas.id, "X")).status).toBe(403);
    expect((await deleteFunnel(atendente, vendas.id)).status).toBe(403);
    expect((await addStage(atendente, vendas.id, "X")).status).toBe(403);
    expect((await renameStage(atendente, vendas.id, vendas.stages[0]!.id, "X")).status).toBe(403);
    expect((await reorderStages(atendente, vendas.id, [vendas.stages[0]!.id])).status).toBe(403);
    expect(await listFunnels(admin)).toMatchObject([{ name: "Vendas", stages: [{ name: "Novo" }] }]);
  });

  it("recusa nome vazio ou longo demais; funil inexistente responde 404", async () => {
    const admin = await loginAsAdmin();
    const vendas = await newFunnel(admin, "Vendas", []);

    expect((await createFunnel(admin, "  ")).status).toBe(400);
    expect((await createFunnel(admin, "x".repeat(81))).status).toBe(400);
    expect((await addStage(admin, vendas.id, "")).status).toBe(400);
    expect((await addStage(admin, "nao", "Etapa")).status).toBe(404);
    expect((await renameFunnel(admin, "nao", "X")).status).toBe(404);
  });

  it("admin renomeia funil e etapa e reordena as etapas", async () => {
    const admin = await loginAsAdmin();
    const vendas = await newFunnel(admin, "Vendas", ["A", "B", "C"]);
    const [a, b, c] = vendas.stages.map((s) => s.id) as [string, string, string];

    expect((await renameFunnel(admin, vendas.id, "Comercial")).status).toBe(200);
    expect((await renameStage(admin, vendas.id, b, "Meio")).status).toBe(200);
    expect((await reorderStages(admin, vendas.id, [c, a, b])).status).toBe(200);

    expect(await listFunnels(admin)).toMatchObject([{ name: "Comercial", stages: [{ name: "C" }, { name: "A" }, { name: "Meio" }] }]);
  });

  it("reordenar exige todas as etapas do funil, cada uma uma vez", async () => {
    const admin = await loginAsAdmin();
    const vendas = await newFunnel(admin, "Vendas", ["A", "B"]);
    const [a] = vendas.stages.map((s) => s.id) as [string];

    expect((await reorderStages(admin, vendas.id, [a])).status).toBe(400);
    expect((await reorderStages(admin, vendas.id, [a, a])).status).toBe(400);
    expect((await listFunnels(admin))[0]!.stages.map((s) => s.name)).toEqual(["A", "B"]);
  });
});

const P1 = "5511900000041";
const P2 = "5511900000042";
const P3 = "5511900000043";

describe("Funis: cards", () => {
  async function cenario() {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const vendas = await newFunnel(admin, "Vendas", ["Novo", "Proposta", "Fechado"]);
    const [novo, proposta, fechado] = vendas.stages.map((s) => s.id) as [string, string, string];
    const c1 = await newClient(admin, P1);
    const c2 = await newClient(admin, P2);
    const c3 = await newClient(admin, P3);
    return { admin, atendente, vendas, novo, proposta, fechado, c1, c2, c3 };
  }

  it("atendente adiciona contato escolhendo a etapa inicial; o quadro mostra o card", async () => {
    const { atendente, vendas, proposta, c1 } = await cenario();

    expect((await addCard(atendente, vendas.id, c1, proposta)).status).toBe(201);

    const { body } = await board(atendente, vendas.id);
    expect(body.stages.map((s) => [s.name, s.cards.length])).toEqual([["Novo", 0], ["Proposta", 1], ["Fechado", 0]]);
    expect(body.stages[1]!.cards[0]).toMatchObject({ contactId: c1, phone: P1, name: "Cliente", labels: [] });
    expect(body.stages[1]!.cards[0]!.conversationId).toBeTruthy();
  });

  it("o card traz status da conversa, ultima mensagem e foto para o quadro", async () => {
    const { atendente, vendas, novo, c1 } = await cenario();
    await addCard(atendente, vendas.id, c1, novo);

    const card = (await board(atendente, vendas.id)).body.stages[0]!.cards[0]!;

    expect(card.status).toBe("aberta");
    expect(card.lastMessage).toMatchObject({ type: "text" });
    expect(card.lastMessage!.text).toBeTruthy();
    expect(card).toHaveProperty("avatarUrl");
  });

  it("no maximo um card por contato em cada funil, mas o contato pode estar em varios funis", async () => {
    const { admin, atendente, vendas, novo, proposta, c1 } = await cenario();
    const suporte = await newFunnel(admin, "Suporte", ["Aberto"]);

    expect((await addCard(atendente, vendas.id, c1, novo)).status).toBe(201);
    expect((await addCard(atendente, vendas.id, c1, proposta)).status).toBe(409);
    expect((await addCard(atendente, suporte.id, c1, suporte.stages[0]!.id)).status).toBe(201);

    expect(await layout(atendente, vendas.id)).toEqual({ Novo: [P1], Proposta: [], Fechado: [] });
    expect(await layout(atendente, suporte.id)).toEqual({ Aberto: [P1] });
  });

  it("recusa contato, funil ou etapa inexistente (ou etapa de outro funil)", async () => {
    const { admin, atendente, vendas, novo, c1 } = await cenario();
    const suporte = await newFunnel(admin, "Suporte", ["Aberto"]);

    expect((await addCard(atendente, vendas.id, "nao", novo)).status).toBe(404);
    expect((await addCard(atendente, "nao", c1, novo)).status).toBe(404);
    expect((await addCard(atendente, vendas.id, c1, "nao")).status).toBe(404);
    expect((await addCard(atendente, vendas.id, c1, suporte.stages[0]!.id)).status).toBe(404);
  });

  it("arrastar: mover para outra etapa na posicao pedida mantem a ordem dos demais", async () => {
    const { atendente, vendas, novo, proposta, c1, c2, c3 } = await cenario();
    for (const c of [c1, c2, c3]) await addCard(atendente, vendas.id, c, novo);
    expect(await layout(atendente, vendas.id)).toMatchObject({ Novo: [P1, P2, P3] });

    expect((await moveCard(atendente, vendas.id, c3, proposta)).status).toBe(200);
    expect((await moveCard(atendente, vendas.id, c1, proposta, 0)).status).toBe(200);

    expect(await layout(atendente, vendas.id)).toEqual({ Novo: [P2], Proposta: [P1, P3], Fechado: [] });
  });

  it("reordenar dentro da mesma etapa respeita o indice", async () => {
    const { atendente, vendas, novo, c1, c2, c3 } = await cenario();
    for (const c of [c1, c2, c3]) await addCard(atendente, vendas.id, c, novo);

    await moveCard(atendente, vendas.id, c3, novo, 0);
    expect(await layout(atendente, vendas.id)).toMatchObject({ Novo: [P3, P1, P2] });

    await moveCard(atendente, vendas.id, c3, novo, 99);
    expect(await layout(atendente, vendas.id)).toMatchObject({ Novo: [P1, P2, P3] });
  });

  it("mover contato que nao esta no funil, ou para etapa inexistente, responde 404", async () => {
    const { atendente, vendas, novo, c1, c2 } = await cenario();
    await addCard(atendente, vendas.id, c1, novo);

    expect((await moveCard(atendente, vendas.id, c2, novo)).status).toBe(404);
    expect((await moveCard(atendente, vendas.id, c1, "nao")).status).toBe(404);
  });

  it("tirar o contato do funil remove so o card dele; o contato continua nos outros funis", async () => {
    const { admin, atendente, vendas, novo, c1, c2 } = await cenario();
    const suporte = await newFunnel(admin, "Suporte", ["Aberto"]);
    await addCard(atendente, vendas.id, c1, novo);
    await addCard(atendente, vendas.id, c2, novo);
    await addCard(atendente, suporte.id, c1, suporte.stages[0]!.id);

    expect((await removeCard(atendente, vendas.id, c1)).status).toBe(200);

    expect(await layout(atendente, vendas.id)).toMatchObject({ Novo: [P2] });
    expect(await layout(atendente, suporte.id)).toEqual({ Aberto: [P1] });
    expect((await removeCard(atendente, vendas.id, c1)).status).toBe(404);
  });

  it("apagar etapa vazia funciona sem destino", async () => {
    const { admin, vendas, fechado } = await cenario();

    expect((await deleteStage(admin, vendas.id, fechado)).status).toBe(200);

    expect((await listFunnels(admin))[0]!.stages.map((s) => s.name)).toEqual(["Novo", "Proposta"]);
  });

  it("apagar etapa com cards exige escolher a etapa de destino, e os cards vao para o fim dela", async () => {
    const { admin, atendente, vendas, novo, proposta, c1, c2, c3 } = await cenario();
    await addCard(atendente, vendas.id, c1, novo);
    await addCard(atendente, vendas.id, c2, novo);
    await addCard(atendente, vendas.id, c3, proposta);

    expect((await deleteStage(admin, vendas.id, novo)).status).toBe(409);
    expect((await deleteStage(admin, vendas.id, novo, novo)).status).toBe(400);
    expect((await deleteStage(admin, vendas.id, novo, "nao")).status).toBe(400);
    expect(await layout(admin, vendas.id)).toMatchObject({ Novo: [P1, P2], Proposta: [P3] });

    expect((await deleteStage(admin, vendas.id, novo, proposta)).status).toBe(200);

    expect(await layout(admin, vendas.id)).toEqual({ Proposta: [P3, P1, P2], Fechado: [] });
  });

  it("filtra o quadro por etiqueta do contato", async () => {
    const { admin, atendente, vendas, novo, c1, c2 } = await cenario();
    const vip = await newLabel(admin, "VIP");
    await addCard(atendente, vendas.id, c1, novo);
    await addCard(atendente, vendas.id, c2, novo);
    await applyLabel(atendente, c2, vip.id);

    expect(await layout(atendente, vendas.id, `?label=${vip.id}`)).toEqual({ Novo: [P2], Proposta: [], Fechado: [] });
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards.find((c) => c.contactId === c2)!.labels).toMatchObject([{ name: "VIP" }]);
  });

  it("filtra o quadro pelo responsavel da conversa atual (eu, sem responsavel ou um membro)", async () => {
    const { admin, atendente, vendas, novo, c1, c2, c3 } = await cenario();
    for (const c of [c1, c2, c3]) await addCard(atendente, vendas.id, c, novo);
    const conversas = await inbox(admin);
    const conv = (phone: string) => conversas.find((x) => x.contact.phone === phone)!.id;
    await assume(atendente, conv(P1));
    await assume(admin, conv(P2));
    const adminId = (await conversationOf(admin, conv(P2))).assigneeId!;

    expect(await layout(atendente, vendas.id, "?assignee=me")).toMatchObject({ Novo: [P1] });
    expect(await layout(atendente, vendas.id, "?assignee=none")).toMatchObject({ Novo: [P3] });
    expect(await layout(atendente, vendas.id, `?assignee=${adminId}`)).toMatchObject({ Novo: [P2] });
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards.find((c) => c.contactId === c2)).toMatchObject({ assigneeId: adminId });
  });

  it("a ficha lista os funis e etapas do contato, e quem esta fora de qualquer funil nao aparece no quadro", async () => {
    const { admin, atendente, vendas, proposta, c1, c2 } = await cenario();
    const suporte = await newFunnel(admin, "Suporte", ["Aberto"]);
    await addCard(atendente, vendas.id, c1, proposta);
    await addCard(atendente, suporte.id, c1, suporte.stages[0]!.id);

    expect((await ficha(atendente, c1)).funnels).toEqual([
      { funnelId: vendas.id, funnelName: "Vendas", stageId: proposta, stageName: "Proposta" },
      { funnelId: suporte.id, funnelName: "Suporte", stageId: suporte.stages[0]!.id, stageName: "Aberto" },
    ]);
    expect((await ficha(atendente, c2)).funnels).toEqual([]);
    expect((await board(atendente, vendas.id)).body.stages.flatMap((s) => s.cards).map((c) => c.contactId)).toEqual([c1]);
  });

  it("adicionar, mover e remover card publicam evento em tempo real para os colegas", async () => {
    const { admin, atendente, vendas, novo, proposta, c1 } = await cenario();
    const ws = await connectRealtime(admin);

    await addCard(atendente, vendas.id, c1, novo);
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    await moveCard(atendente, vendas.id, c1, proposta);
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    await removeCard(atendente, vendas.id, c1);
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    ws.close();
  });

  it("mudar funis e etapas publica evento em tempo real", async () => {
    const admin = await loginAsAdmin();
    const ws = await connectRealtime(admin);

    const vendas = await newFunnel(admin, "Vendas", []);
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    await addStage(admin, vendas.id, "Novo");
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    ws.close();
  });

  it("atendente nao apaga etapa; apagar o funil leva os cards", async () => {
    const { admin, atendente, vendas, novo, c1 } = await cenario();
    await addCard(atendente, vendas.id, c1, novo);

    expect((await deleteStage(atendente, vendas.id, novo, novo)).status).toBe(403);
    expect((await deleteFunnel(admin, vendas.id)).status).toBe(200);

    expect(await listFunnels(admin)).toEqual([]);
    expect((await board(admin, vendas.id)).status).toBe(404);
  });
});
