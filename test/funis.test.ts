import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { assume, conversationOf, inbox } from "./helpers/conversations";
import { applyLabel, newLabel } from "./helpers/etiquetas";
import { ficha } from "./helpers/ficha";
import { newProduct, updateProduct } from "./helpers/produtos";
import { connectRealtime } from "./helpers/realtime";
import {
  addDeal,
  closeDeal,
  reopenDeal,
  editDeal,
  addStage,
  board,
  createFunnel,
  deleteFunnel,
  deleteStage,
  layout,
  listFunnels,
  moveDeal,
  newDeal,
  newClient,
  newFunnel,
  removeDeal,
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

describe("Funis: negocios", () => {
  const uazapi = fakeUazapi();
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

  it("atendente cria negocio escolhendo a etapa inicial; o quadro mostra o cartao do cliente", async () => {
    const { atendente, vendas, proposta, c1 } = await cenario();

    expect((await addDeal(atendente, vendas.id, c1, proposta)).status).toBe(201);

    const { body } = await board(atendente, vendas.id);
    expect(body.stages.map((s) => [s.name, s.cards.length])).toEqual([["Novo", 0], ["Proposta", 1], ["Fechado", 0]]);
    expect(body.stages[1]!.cards[0]).toMatchObject({ contactId: c1, phone: P1, name: "Cliente", labels: [], productId: null, valueCents: null, originKind: null });
    expect(body.stages[1]!.cards[0]!.dealId).toBeTruthy();
    expect(body.stages[1]!.cards[0]!.conversationId).toBeTruthy();
  });

  it("o cartao traz status da conversa, ultima mensagem e foto para o quadro", async () => {
    const { atendente, vendas, novo, c1 } = await cenario();
    await addDeal(atendente, vendas.id, c1, novo);

    const card = (await board(atendente, vendas.id)).body.stages[0]!.cards[0]!;

    expect(card.status).toBe("aberta");
    expect(card.lastMessage).toMatchObject({ type: "text" });
    expect(card.lastMessage!.text).toBeTruthy();
    expect(card).toHaveProperty("avatarUrl");
  });

  it("o mesmo contato pode ter varios negocios, no mesmo funil ou em outros", async () => {
    const { admin, atendente, vendas, novo, proposta, c1 } = await cenario();
    const suporte = await newFunnel(admin, "Suporte", ["Aberto"]);

    expect((await addDeal(atendente, vendas.id, c1, novo)).status).toBe(201);
    expect((await addDeal(atendente, vendas.id, c1, proposta)).status).toBe(201);
    expect((await addDeal(atendente, suporte.id, c1, suporte.stages[0]!.id)).status).toBe(201);

    expect(await layout(atendente, vendas.id)).toEqual({ Novo: [P1], Proposta: [P1], Fechado: [] });
    expect(await layout(atendente, suporte.id)).toEqual({ Aberto: [P1] });
  });

  it("recusa contato, funil ou etapa inexistente (ou etapa de outro funil)", async () => {
    const { admin, atendente, vendas, novo, c1 } = await cenario();
    const suporte = await newFunnel(admin, "Suporte", ["Aberto"]);

    expect((await addDeal(atendente, vendas.id, "nao", novo)).status).toBe(404);
    expect((await addDeal(atendente, "nao", c1, novo)).status).toBe(404);
    expect((await addDeal(atendente, vendas.id, c1, "nao")).status).toBe(404);
    expect((await addDeal(atendente, vendas.id, c1, suporte.stages[0]!.id)).status).toBe(404);
  });

  it("escolher o produto preenche o valor com o preco dele; valor informado vence; produto inexistente ou valor invalido sao recusados", async () => {
    const { admin, atendente, vendas, novo, c1 } = await cenario();
    const curso = await newProduct(admin, "Curso", 99700);

    expect((await addDeal(atendente, vendas.id, c1, novo, { productId: curso.id })).status).toBe(201);
    expect((await addDeal(atendente, vendas.id, c1, novo, { productId: curso.id, valueCents: 50000 })).status).toBe(201);
    expect((await addDeal(atendente, vendas.id, c1, novo, { valueCents: 1234 })).status).toBe(201);

    expect((await board(atendente, vendas.id)).body.stages[0]!.cards).toMatchObject([
      { productId: curso.id, productName: "Curso", valueCents: 99700 },
      { productId: curso.id, productName: "Curso", valueCents: 50000 },
      { productId: null, productName: null, valueCents: 1234 },
    ]);
    expect((await addDeal(atendente, vendas.id, c1, novo, { productId: "nao" })).status).toBe(404);
    expect((await addDeal(atendente, vendas.id, c1, novo, { valueCents: -1 })).status).toBe(400);
    expect((await addDeal(atendente, vendas.id, c1, novo, { valueCents: 1.5 })).status).toBe(400);
  });

  it("produto arquivado nao pode ser escolhido num negocio novo, mas continua aparecendo no antigo", async () => {
    const { admin, atendente, vendas, novo, c1 } = await cenario();
    const curso = await newProduct(admin, "Curso", 99700);
    await newDeal(atendente, vendas.id, c1, novo, { productId: curso.id });
    await updateProduct(admin, curso.id, { archived: true });

    expect((await addDeal(atendente, vendas.id, c1, novo, { productId: curso.id })).status).toBe(404);
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards).toMatchObject([{ productName: "Curso" }]);
  });

  it("origem manual: Indicacao, Organico, Cliente antigo, Outro ou vazia; outro valor e recusado", async () => {
    const { atendente, vendas, novo, c1 } = await cenario();

    for (const originKind of ["indicacao", "organico", "cliente_antigo", "outro"]) {
      expect((await addDeal(atendente, vendas.id, c1, novo, { originKind })).status).toBe(201);
    }
    expect((await addDeal(atendente, vendas.id, c1, novo, { originKind: null })).status).toBe(201);
    expect((await addDeal(atendente, vendas.id, c1, novo, { originKind: "facebook" })).status).toBe(400);
    expect((await addDeal(atendente, vendas.id, c1, novo, { originKind: "campanha" })).status).toBe(400);

    expect((await board(atendente, vendas.id)).body.stages[0]!.cards.map((c) => c.originKind)).toEqual([
      "indicacao",
      "organico",
      "cliente_antigo",
      "outro",
      null,
    ]);
  });

  it("editar o negocio troca produto, valor e origem; trocar o produto nao mexe no valor ja digitado", async () => {
    const { admin, atendente, vendas, novo, c1 } = await cenario();
    const curso = await newProduct(admin, "Curso", 99700);
    const dealId = await newDeal(atendente, vendas.id, c1, novo, { valueCents: 1000 });

    expect((await editDeal(atendente, vendas.id, dealId, { productId: curso.id, originKind: "indicacao" })).status).toBe(200);
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards[0]).toMatchObject({ productId: curso.id, valueCents: 1000, originKind: "indicacao" });

    expect((await editDeal(atendente, vendas.id, dealId, { valueCents: 250000, originKind: null, productId: null })).status).toBe(200);
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards[0]).toMatchObject({ productId: null, valueCents: 250000, originKind: null });
  });

  it("editar recusa dados invalidos e negocio inexistente", async () => {
    const { atendente, vendas, novo, c1 } = await cenario();
    const dealId = await newDeal(atendente, vendas.id, c1, novo);

    expect((await editDeal(atendente, vendas.id, dealId, { valueCents: -5 })).status).toBe(400);
    expect((await editDeal(atendente, vendas.id, dealId, { originKind: "x" })).status).toBe(400);
    expect((await editDeal(atendente, vendas.id, dealId, { productId: "nao" })).status).toBe(404);
    expect((await editDeal(atendente, vendas.id, dealId, {})).status).toBe(400);
    expect((await editDeal(atendente, vendas.id, "nao", { valueCents: 1 })).status).toBe(404);
  });

  it("arrastar: mover para outra etapa na posicao pedida mantem a ordem dos demais", async () => {
    const { atendente, vendas, novo, proposta, c1, c2, c3 } = await cenario();
    const [d1, , d3] = [await newDeal(atendente, vendas.id, c1, novo), await newDeal(atendente, vendas.id, c2, novo), await newDeal(atendente, vendas.id, c3, novo)];
    expect(await layout(atendente, vendas.id)).toMatchObject({ Novo: [P1, P2, P3] });

    expect((await moveDeal(atendente, vendas.id, d3, proposta)).status).toBe(200);
    expect((await moveDeal(atendente, vendas.id, d1, proposta, 0)).status).toBe(200);

    expect(await layout(atendente, vendas.id)).toEqual({ Novo: [P2], Proposta: [P1, P3], Fechado: [] });
  });

  it("reordenar dentro da mesma etapa respeita o indice", async () => {
    const { atendente, vendas, novo, c1, c2, c3 } = await cenario();
    await newDeal(atendente, vendas.id, c1, novo);
    await newDeal(atendente, vendas.id, c2, novo);
    const d3 = await newDeal(atendente, vendas.id, c3, novo);

    await moveDeal(atendente, vendas.id, d3, novo, 0);
    expect(await layout(atendente, vendas.id)).toMatchObject({ Novo: [P3, P1, P2] });

    await moveDeal(atendente, vendas.id, d3, novo, 99);
    expect(await layout(atendente, vendas.id)).toMatchObject({ Novo: [P1, P2, P3] });
  });

  it("mover negocio inexistente (ou de outro funil), ou para etapa inexistente, responde 404", async () => {
    const { admin, atendente, vendas, novo, c1 } = await cenario();
    const suporte = await newFunnel(admin, "Suporte", ["Aberto"]);
    const dealId = await newDeal(atendente, vendas.id, c1, novo);

    expect((await moveDeal(atendente, vendas.id, "nao", novo)).status).toBe(404);
    expect((await moveDeal(atendente, suporte.id, dealId, suporte.stages[0]!.id)).status).toBe(404);
    expect((await moveDeal(atendente, vendas.id, dealId, "nao")).status).toBe(404);
  });

  it("remover o negocio tira so o cartao dele; o outro negocio do mesmo contato continua", async () => {
    const { atendente, vendas, novo, c1, c2 } = await cenario();
    const d1 = await newDeal(atendente, vendas.id, c1, novo);
    await newDeal(atendente, vendas.id, c1, novo);
    await newDeal(atendente, vendas.id, c2, novo);

    expect((await removeDeal(atendente, vendas.id, d1)).status).toBe(200);

    expect(await layout(atendente, vendas.id)).toMatchObject({ Novo: [P1, P2] });
    expect((await removeDeal(atendente, vendas.id, d1)).status).toBe(404);
  });

  it("apagar etapa vazia funciona sem destino", async () => {
    const { admin, vendas, fechado } = await cenario();

    expect((await deleteStage(admin, vendas.id, fechado)).status).toBe(200);

    expect((await listFunnels(admin))[0]!.stages.map((s) => s.name)).toEqual(["Novo", "Proposta"]);
  });

  it("apagar etapa com negocios exige escolher a etapa de destino, e os negocios vao para o fim dela", async () => {
    const { admin, atendente, vendas, novo, proposta, c1, c2, c3 } = await cenario();
    await newDeal(atendente, vendas.id, c1, novo);
    await newDeal(atendente, vendas.id, c2, novo);
    await newDeal(atendente, vendas.id, c3, proposta);

    const semDestino = await deleteStage(admin, vendas.id, novo);
    expect(semDestino.status).toBe(409);
    expect(await semDestino.json()).toEqual({ error: "etapa_com_negocios" });
    expect((await deleteStage(admin, vendas.id, novo, novo)).status).toBe(400);
    expect((await deleteStage(admin, vendas.id, novo, "nao")).status).toBe(400);
    expect(await layout(admin, vendas.id)).toMatchObject({ Novo: [P1, P2], Proposta: [P3] });

    expect((await deleteStage(admin, vendas.id, novo, proposta)).status).toBe(200);

    expect(await layout(admin, vendas.id)).toEqual({ Proposta: [P3, P1, P2], Fechado: [] });
  });

  it("filtra o quadro por etiqueta do contato", async () => {
    const { admin, atendente, vendas, novo, c1, c2 } = await cenario();
    const vip = await newLabel(admin, "VIP");
    await newDeal(atendente, vendas.id, c1, novo);
    await newDeal(atendente, vendas.id, c2, novo);
    await applyLabel(atendente, c2, vip.id);

    expect(await layout(atendente, vendas.id, `?label=${vip.id}`)).toEqual({ Novo: [P2], Proposta: [], Fechado: [] });
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards.find((c) => c.contactId === c2)!.labels).toMatchObject([{ name: "VIP" }]);
  });

  it("filtra o quadro pelo responsavel da conversa atual (eu, sem responsavel ou um membro)", async () => {
    const { admin, atendente, vendas, novo, c1, c2, c3 } = await cenario();
    for (const c of [c1, c2, c3]) await newDeal(atendente, vendas.id, c, novo);
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

  it("filtra o quadro por produto (e combina com os outros filtros)", async () => {
    const { admin, atendente, vendas, novo, c1, c2, c3 } = await cenario();
    const curso = await newProduct(admin, "Curso");
    const mentoria = await newProduct(admin, "Mentoria", 500000);
    await newDeal(atendente, vendas.id, c1, novo, { productId: curso.id });
    await newDeal(atendente, vendas.id, c2, novo, { productId: mentoria.id });
    await newDeal(atendente, vendas.id, c3, novo);

    expect(await layout(atendente, vendas.id, `?product=${curso.id}`)).toEqual({ Novo: [P1], Proposta: [], Fechado: [] });
    expect(await layout(atendente, vendas.id, `?product=${mentoria.id}`)).toEqual({ Novo: [P2], Proposta: [], Fechado: [] });
    expect(await layout(atendente, vendas.id, "?product=none")).toEqual({ Novo: [P3], Proposta: [], Fechado: [] });
    expect(await layout(atendente, vendas.id, `?product=${curso.id}&assignee=none`)).toMatchObject({ Novo: [P1] });
    expect(await layout(atendente, vendas.id, `?product=${curso.id}&assignee=me`)).toMatchObject({ Novo: [] });
  });

  it("o quadro mostra so negocios abertos; contato sem negocio nao aparece", async () => {
    const { atendente, vendas, novo, c1, c2 } = await cenario();
    await newDeal(atendente, vendas.id, c1, novo);
    const ganho = await newDeal(atendente, vendas.id, c1, novo);
    const perdido = await newDeal(atendente, vendas.id, c2, novo);
    await closeDeal(atendente, vendas.id, ganho, { status: "ganho", valueCents: 100 });
    await closeDeal(atendente, vendas.id, perdido, { status: "perdido", lostReason: "preco" });

    expect((await board(atendente, vendas.id)).body.stages.flatMap((s) => s.cards).map((c) => c.contactId)).toEqual([c1]);
  });

  it("a ficha lista todos os negocios do contato (abertos e fechados) com produto, valor, funil, etapa e situacao", async () => {
    const { admin, atendente, vendas, novo, proposta, c1, c2 } = await cenario();
    const suporte = await newFunnel(admin, "Suporte", ["Aberto"]);
    const curso = await newProduct(admin, "Curso", 99700);
    const d1 = await newDeal(atendente, vendas.id, c1, proposta, { productId: curso.id, originKind: "indicacao" });
    const d2 = await newDeal(atendente, suporte.id, c1, suporte.stages[0]!.id);
    const d3 = await newDeal(atendente, vendas.id, c1, novo, { valueCents: 500 });
    await closeDeal(atendente, vendas.id, d3, { status: "ganho", valueCents: 500 });

    expect((await ficha(atendente, c1)).deals).toEqual([
      { id: d1, funnelId: vendas.id, funnelName: "Vendas", stageId: proposta, stageName: "Proposta", productId: curso.id, productName: "Curso", valueCents: 99700, status: "aberto", originKind: "indicacao", originCampaignName: null },
      { id: d2, funnelId: suporte.id, funnelName: "Suporte", stageId: suporte.stages[0]!.id, stageName: "Aberto", productId: null, productName: null, valueCents: null, status: "aberto", originKind: null, originCampaignName: null },
      { id: d3, funnelId: vendas.id, funnelName: "Vendas", stageId: novo, stageName: "Novo", productId: null, productName: null, valueCents: 500, status: "ganho", originKind: null, originCampaignName: null },
    ]);
    expect((await ficha(atendente, c2)).deals).toEqual([]);
  });

  it("GET /api/contacts/:id/deals devolve so os negocios, sem ir buscar a foto na Uazapi (a faixa da conversa usa)", async () => {
    const { atendente, vendas, novo, c1 } = await cenario();
    const d1 = await newDeal(atendente, vendas.id, c1, novo, { valueCents: 500 });
    const before = (await uazapi.calls()).length;

    const res = await api(`/api/contacts/${c1}/deals`, { cookie: atendente });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deals: { id: string; status: string }[] };
    expect(body.deals.map((d) => [d.id, d.status])).toEqual([[d1, "aberto"]]);
    expect((await uazapi.calls()).slice(before)).toEqual([]);
    expect((await api(`/api/contacts/inexistente/deals`, { cookie: atendente })).status).toBe(404);
  });

  it("criar, editar, mover e remover negocio publicam evento em tempo real para os colegas", async () => {
    const { admin, atendente, vendas, novo, proposta, c1 } = await cenario();
    const ws = await connectRealtime(admin);

    const dealId = await newDeal(atendente, vendas.id, c1, novo);
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    await editDeal(atendente, vendas.id, dealId, { valueCents: 10 });
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    await moveDeal(atendente, vendas.id, dealId, proposta);
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    await removeDeal(atendente, vendas.id, dealId);
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

  it("atendente nao apaga etapa; apagar o funil leva os negocios", async () => {
    const { admin, atendente, vendas, novo, c1 } = await cenario();
    await newDeal(atendente, vendas.id, c1, novo);

    expect((await deleteStage(atendente, vendas.id, novo, novo)).status).toBe(403);
    expect((await deleteFunnel(admin, vendas.id)).status).toBe(200);

    expect(await listFunnels(admin)).toEqual([]);
    expect((await board(admin, vendas.id)).status).toBe(404);
    expect((await ficha(admin, c1)).deals).toEqual([]);
  });
});

describe("Funis: ganhou e perdeu", () => {
  async function cenario() {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const vendas = await newFunnel(admin, "Vendas", ["Novo", "Proposta"]);
    const [novo, proposta] = vendas.stages.map((s) => s.id) as [string, string];
    const c1 = await newClient(admin, P1);
    const dealId = await newDeal(atendente, vendas.id, c1, novo, { valueCents: 99700 });
    const closed = async (cookie: string, status: string) => (await board(cookie, vendas.id, `?status=${status}`)).body.stages.flatMap((s) => s.cards);
    return { admin, atendente, vendas, novo, proposta, c1, dealId, closed };
  }

  it("Ganhou grava o valor confirmado, quem fechou e quando; o negocio sai do quadro aberto e aparece em Ganhos", async () => {
    const { atendente, vendas, dealId, closed } = await cenario();
    const before = Date.now();

    expect((await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 90000 })).status).toBe(200);

    expect((await board(atendente, vendas.id)).body.stages.flatMap((s) => s.cards)).toEqual([]);
    const [card] = await closed(atendente, "ganho");
    expect(card).toMatchObject({ dealId, dealStatus: "ganho", valueCents: 90000, lostReason: null });
    expect(card!.closedAt).toBeGreaterThanOrEqual(before);
    expect(card!.closedById).toBeTruthy();
    expect(await closed(atendente, "perdido")).toEqual([]);
  });

  it("Perdeu grava o motivo e a observacao; aparece em Perdidos", async () => {
    const { atendente, vendas, dealId, closed } = await cenario();

    expect((await closeDeal(atendente, vendas.id, dealId, { status: "perdido", lostReason: "comprou_de_outro", lostNote: "foi para o concorrente" })).status).toBe(200);

    expect(await closed(atendente, "perdido")).toMatchObject([{ dealId, dealStatus: "perdido", lostReason: "comprou_de_outro", lostNote: "foi para o concorrente", valueCents: 99700 }]);
    expect(await closed(atendente, "ganho")).toEqual([]);
    expect((await board(atendente, vendas.id)).body.stages.flatMap((s) => s.cards)).toEqual([]);
  });

  it("Perdeu sem observacao grava so o motivo", async () => {
    const { atendente, vendas, dealId, closed } = await cenario();
    expect((await closeDeal(atendente, vendas.id, dealId, { status: "perdido", lostReason: "preco" })).status).toBe(200);
    expect(await closed(atendente, "perdido")).toMatchObject([{ lostReason: "preco", lostNote: null }]);
  });

  it("fechar recusa ganho sem valor (ou zero, negativo, quebrado), perdido sem motivo ou com motivo fora da lista, observacao longa demais e status invalido", async () => {
    const { atendente, vendas, dealId, closed } = await cenario();
    const bad = [
      { status: "ganho" },
      { status: "ganho", valueCents: 0 },
      { status: "ganho", valueCents: -5 },
      { status: "ganho", valueCents: 10.5 },
      { status: "ganho", valueCents: "100" },
      { status: "perdido" },
      { status: "perdido", lostReason: "nao_gostou" },
      { status: "perdido", lostReason: "preco", lostNote: "x".repeat(501) },
      { status: "perdido", lostReason: "preco", lostNote: 42 },
      { status: "aberto" },
      {},
    ];
    for (const body of bad) expect((await closeDeal(atendente, vendas.id, dealId, body)).status, JSON.stringify(body)).toBe(400);
    expect((await closeDeal(atendente, vendas.id, dealId, { status: "perdido", lostReason: "preco", lostNote: "x".repeat(500) })).status).toBe(200);
    expect(await closed(atendente, "perdido")).toHaveLength(1);
  });

  it("fechar negocio ja fechado responde 409 e nao muda nada; inexistente ou de outro funil responde 404", async () => {
    const { admin, atendente, vendas, dealId, closed } = await cenario();
    const outro = await newFunnel(admin, "Outro", ["A"]);
    expect((await closeDeal(atendente, outro.id, dealId, { status: "ganho", valueCents: 1 })).status).toBe(404);
    expect((await closeDeal(atendente, vendas.id, "nao-existe", { status: "ganho", valueCents: 1 })).status).toBe(404);

    await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 500 });
    expect((await closeDeal(atendente, vendas.id, dealId, { status: "perdido", lostReason: "preco" })).status).toBe(409);
    expect((await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 900 })).status).toBe(409);
    expect(await closed(atendente, "ganho")).toMatchObject([{ valueCents: 500 }]);
    expect(await closed(atendente, "perdido")).toEqual([]);
  });

  it("admin reabre: volta a aberto na mesma etapa, no fim dela, e limpa motivo, observacao e dados do fechamento", async () => {
    const { admin, atendente, vendas, novo, c1, dealId, closed } = await cenario();
    const c2 = await newClient(admin, P2);
    await closeDeal(atendente, vendas.id, dealId, { status: "perdido", lostReason: "preco", lostNote: "caro" });
    const outro = await newDeal(atendente, vendas.id, c2, novo);

    expect((await reopenDeal(admin, vendas.id, dealId)).status).toBe(200);

    expect(await closed(admin, "perdido")).toEqual([]);
    const [novoCol] = (await board(admin, vendas.id)).body.stages;
    expect(novoCol!.cards.map((c) => c.dealId)).toEqual([outro, dealId]);
    expect(novoCol!.cards[1]).toMatchObject({ dealStatus: "aberto", lostReason: null, lostNote: null, closedAt: null, closedById: null, contactId: c1 });
    expect((await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 1 })).status).toBe(200);
  });

  it("atendente nao reabre (403); negocio aberto ou inexistente nao reabre", async () => {
    const { admin, atendente, vendas, dealId, closed } = await cenario();
    await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 500 });

    expect((await reopenDeal(atendente, vendas.id, dealId)).status).toBe(403);
    expect(await closed(admin, "ganho")).toHaveLength(1);

    expect((await reopenDeal(admin, vendas.id, "nao-existe")).status).toBe(404);
    await reopenDeal(admin, vendas.id, dealId);
    expect((await reopenDeal(admin, vendas.id, dealId)).status).toBe(409);
  });

  it("negocio fechado nao e movido pelo quadro (409)", async () => {
    const { atendente, vendas, proposta, dealId } = await cenario();
    await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 500 });
    expect((await moveDeal(atendente, vendas.id, dealId, proposta)).status).toBe(409);
  });

  it("negocio fechado nao e editado (409) e o admin corrige reabrindo", async () => {
    const { admin, atendente, vendas, dealId, closed } = await cenario();
    await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 500 });

    const res = await editDeal(atendente, vendas.id, dealId, { valueCents: 1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "negocio_fechado" });
    expect((await closed(admin, "ganho"))[0]!.valueCents).toBe(500);

    await reopenDeal(admin, vendas.id, dealId);
    expect((await editDeal(atendente, vendas.id, dealId, { valueCents: 1 })).status).toBe(200);
  });

  it("negocio fechado nao e removido (409) e continua em Ganhos", async () => {
    const { admin, atendente, vendas, dealId, closed } = await cenario();
    await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 500 });

    const res = await removeDeal(atendente, vendas.id, dealId);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "negocio_fechado" });
    expect(await closed(admin, "ganho")).toHaveLength(1);
  });

  it("fechar e reabrir publicam evento de funil em tempo real", async () => {
    const { admin, atendente, vendas, dealId } = await cenario();
    const ws = await connectRealtime(admin);
    await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 500 });
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    await reopenDeal(admin, vendas.id, dealId);
    expect(await ws.next()).toMatchObject({ type: "funnel.changed", funnelId: vendas.id });
    ws.close();
  });

  it("a lista de Ganhos e Perdidos mostra o mais recente primeiro e respeita os filtros do quadro", async () => {
    const { admin, atendente, vendas, novo, dealId } = await cenario();
    const c2 = await newClient(admin, P2);
    const d2 = await newDeal(atendente, vendas.id, c2, novo);
    await closeDeal(atendente, vendas.id, dealId, { status: "ganho", valueCents: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await closeDeal(atendente, vendas.id, d2, { status: "ganho", valueCents: 2 });

    const ganhos = (await board(atendente, vendas.id, "?status=ganho")).body.stages[0]!.cards;
    expect(ganhos.map((c) => c.dealId)).toEqual([d2, dealId]);
    expect(await layout(atendente, vendas.id, "?status=ganho&product=none")).toMatchObject({ Novo: [P2, P1] });
  });
});
