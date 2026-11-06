import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { createCampaign, listCampaigns, newCampaign, updateCampaign } from "./helpers/campanhas";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { ficha } from "./helpers/ficha";
import { addDeal, board, editDeal, newClient, newDeal, newFunnel } from "./helpers/funis";
import { newProduct, updateProduct } from "./helpers/produtos";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";

describe("Campanhas", () => {
  it("admin cria campanha: o CRM gera o codigo e a mensagem padrao; todo membro a ve", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const curso = await newProduct(admin, "Curso de Inglês");

    const res = await createCampaign(admin, { name: "Black Friday", productId: curso.id, channel: "meta" });

    expect(res.status).toBe(201);
    expect((await listCampaigns(atendente)).campaigns).toMatchObject([
      {
        name: "Black Friday",
        productId: curso.id,
        productName: "Curso de Inglês",
        channel: "meta",
        code: "CUR-M01",
        message: "Oi! Quero saber do Curso de Inglês #CUR-M01",
        archivedAt: null,
      },
    ]);
  });

  it("o codigo segue a sequencia por produto e canal", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");

    const a = await newCampaign(admin, curso.id, { channel: "meta" });
    const b = await newCampaign(admin, curso.id, { channel: "meta" });
    const c = await newCampaign(admin, curso.id, { channel: "google" });

    expect([a.code, b.code, c.code]).toEqual(["CUR-M01", "CUR-M02", "CUR-G01"]);
  });

  it("codigo de campanha arquivada nao e reaproveitado", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");
    const a = await newCampaign(admin, curso.id);
    await updateCampaign(admin, a.id, { archived: true });

    expect((await newCampaign(admin, curso.id)).code).toBe("CUR-M02");
  });

  it("atendente nao cria nem edita", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const curso = await newProduct(admin, "Curso");
    const camp = await newCampaign(admin, curso.id);

    expect((await createCampaign(atendente, { name: "X", productId: curso.id, channel: "meta" })).status).toBe(403);
    expect((await updateCampaign(atendente, camp.id, { archived: true })).status).toBe(403);
    expect((await listCampaigns(admin)).campaigns).toHaveLength(1);
  });

  it("valida nome (1 a 80), canal e produto", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");
    const old = await newProduct(admin, "Antigo");
    await updateProduct(admin, old.id, { archived: true });

    expect((await createCampaign(admin, { name: " ", productId: curso.id, channel: "meta" })).status).toBe(400);
    expect((await createCampaign(admin, { name: "a".repeat(81), productId: curso.id, channel: "meta" })).status).toBe(400);
    expect((await createCampaign(admin, { name: "A", productId: curso.id, channel: "orkut" })).status).toBe(400);
    expect((await createCampaign(admin, { name: "A", channel: "meta" })).status).toBe(400);
    expect((await createCampaign(admin, { name: "A", productId: "nao", channel: "meta" })).status).toBe(404);
    expect((await createCampaign(admin, { name: "A", productId: old.id, channel: "meta" })).status).toBe(404);
  });

  it("mensagem editavel ate 300 caracteres e sempre com o codigo", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");
    const camp = await newCampaign(admin, curso.id);

    expect((await updateCampaign(admin, camp.id, { message: "Quero o curso, oi! #cur-m01" })).status).toBe(200);
    expect((await listCampaigns(admin)).campaigns[0]!.message).toBe("Quero o curso, oi! #cur-m01");
    expect((await updateCampaign(admin, camp.id, { message: "Quero o curso" })).status).toBe(400);
    expect((await updateCampaign(admin, camp.id, { message: "CUR-M01 sem cerquilha" })).status).toBe(400);
    expect((await updateCampaign(admin, camp.id, { message: `${"a".repeat(292)} #CUR-M01` })).status).toBe(400);
    expect((await updateCampaign(admin, camp.id, { message: `${"a".repeat(291)} #CUR-M01` })).status).toBe(200);
    expect((await createCampaign(admin, { name: "B", productId: curso.id, channel: "google", message: "sem codigo" })).status).toBe(400);
    const ok = await newCampaign(admin, curso.id, { channel: "tiktok", message: "Oi #CUR-T01!" });
    expect(ok.message).toBe("Oi #CUR-T01!");
  });

  it("renomear e arquivar; arquivada sai da lista, ?todos=1 traz de volta; inexistente 404; edicao vazia 400", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");
    const camp = await newCampaign(admin, curso.id);

    expect((await updateCampaign(admin, camp.id, { name: "Nova" })).status).toBe(200);
    expect((await updateCampaign(admin, camp.id, { archived: true })).status).toBe(200);

    expect((await listCampaigns(admin)).campaigns).toEqual([]);
    expect((await listCampaigns(admin, true)).campaigns).toMatchObject([{ name: "Nova", code: "CUR-M01" }]);
    expect((await updateCampaign(admin, camp.id, { archived: false })).status).toBe(200);
    expect((await listCampaigns(admin)).campaigns).toHaveLength(1);
    expect((await updateCampaign(admin, "nao", { name: "x" })).status).toBe(404);
    expect((await updateCampaign(admin, camp.id, {})).status).toBe(400);
  });

  it("avisa quando nao ha funil com etapa, mas deixa criar a campanha", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");

    expect((await newCampaign(admin, curso.id)).code).toBe("CUR-M01");
    expect((await listCampaigns(admin)).hasFunnel).toBe(false);

    await newFunnel(admin, "Vendas", ["Novo"]);
    expect((await listCampaigns(admin)).hasFunnel).toBe(true);
  });

  it("avisa quando o funil principal (o primeiro criado) nao tem etapa, mesmo que outro funil tenha", async () => {
    const admin = await loginAsAdmin();
    await newFunnel(admin, "Principal vazio", []);
    await newFunnel(admin, "Outro", ["Novo"]);

    expect((await listCampaigns(admin)).hasFunnel).toBe(false);
  });
});

describe("Campanhas: link do WhatsApp", () => {
  const uazapi = fakeUazapi();
  const statusWith = (instance: Record<string, unknown>) => uazapi.program("GET", "/instance/status", [{ body: { instance } }]);

  it("sem numero conectado: sem link e sem numero", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");
    await newCampaign(admin, curso.id);

    expect(await listCampaigns(admin)).toMatchObject({ whatsappNumber: null, campaigns: [{ link: null }] });
  });

  it("o numero vem do dono da instancia (status da Uazapi) e monta o link com a mensagem codificada", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");
    await newCampaign(admin, curso.id);
    await statusWith({ status: "connected", owner: "5511999998888" });
    await api("/api/connection/status", { cookie: admin });

    expect(await listCampaigns(admin)).toMatchObject({
      whatsappNumber: "5511999998888",
      campaigns: [{ link: "https://wa.me/5511999998888?text=Oi!%20Quero%20saber%20do%20Curso%20%23CUR-M01" }],
    });
  });

  it("guarda so os digitos do dono (jid, +, espacos)", async () => {
    const admin = await loginAsAdmin();
    await statusWith({ status: "connected", owner: "+55 (11) 99999-8888@s.whatsapp.net" });
    await api("/api/connection/status", { cookie: admin });

    expect((await listCampaigns(admin)).whatsappNumber).toBe("5511999998888");
  });

  it("sem numero guardado, a lista pergunta a instancia na hora", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    await statusWith({ status: "connected", owner: "5521988887777" });

    expect((await listCampaigns(atendente)).whatsappNumber).toBe("5521988887777");
  });

  it("o numero continua guardado quando a instancia cai e a Uazapi nao informa o dono", async () => {
    const admin = await loginAsAdmin();
    await statusWith({ status: "connected", owner: "5511999998888" });
    await api("/api/connection/status", { cookie: admin });
    await statusWith({ status: "disconnected" });
    await api("/api/connection/status", { cookie: admin });

    expect((await listCampaigns(admin)).whatsappNumber).toBe("5511999998888");
  });

  it("dono sem digitos e ignorado", async () => {
    const admin = await loginAsAdmin();
    await statusWith({ status: "connected", owner: "abc" });
    await api("/api/connection/status", { cookie: admin });

    expect((await listCampaigns(admin)).whatsappNumber).toBeNull();
  });
});

describe("Campanhas: origem manual do negocio", () => {
  async function cenario() {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const vendas = await newFunnel(admin, "Vendas", ["Novo"]);
    const curso = await newProduct(admin, "Curso");
    const camp = await newCampaign(admin, curso.id, { name: "Black Friday" });
    const c1 = await newClient(atendente, "5511911110001");
    return { admin, atendente, vendas, novo: vendas.stages[0]!.id, curso, camp, c1 };
  }

  it("atendente cria negocio com campanha ativa de origem; cartao e ficha mostram o nome", async () => {
    const { atendente, vendas, novo, camp, c1 } = await cenario();

    const res = await addDeal(atendente, vendas.id, c1, novo, { originKind: "campanha", originCampaignId: camp.id });

    expect(res.status).toBe(201);
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards[0]).toMatchObject({ originKind: "campanha", originCampaignId: camp.id, originCampaignName: "Black Friday" });
    expect((await ficha(atendente, c1)).deals).toMatchObject([{ originKind: "campanha", originCampaignName: "Black Friday" }]);
  });

  it("recusa campanha ausente, inexistente ou arquivada, e id de campanha com outra origem", async () => {
    const { admin, atendente, vendas, novo, camp, c1 } = await cenario();
    await updateCampaign(admin, camp.id, { archived: true });
    const ativa = await newCampaign(admin, (await newProduct(admin, "Outro")).id);

    expect((await addDeal(atendente, vendas.id, c1, novo, { originKind: "campanha" })).status).toBe(400);
    expect((await addDeal(atendente, vendas.id, c1, novo, { originKind: "campanha", originCampaignId: "nao" })).status).toBe(400);
    expect((await addDeal(atendente, vendas.id, c1, novo, { originKind: "campanha", originCampaignId: camp.id })).status).toBe(400);
    expect((await addDeal(atendente, vendas.id, c1, novo, { originKind: "indicacao", originCampaignId: ativa.id })).status).toBe(400);
    expect((await addDeal(atendente, vendas.id, c1, novo, { originCampaignId: ativa.id })).status).toBe(400);
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards).toEqual([]);
  });

  it("editar origem: troca para campanha ativa e, ao sair de campanha, limpa o vinculo", async () => {
    const { atendente, vendas, novo, camp, c1 } = await cenario();
    const dealId = await newDeal(atendente, vendas.id, c1, novo);

    expect((await editDeal(atendente, vendas.id, dealId, { originKind: "campanha", originCampaignId: camp.id })).status).toBe(200);
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards[0]).toMatchObject({ originCampaignName: "Black Friday" });
    expect((await editDeal(atendente, vendas.id, dealId, { originKind: "campanha" })).status).toBe(400);
    expect((await editDeal(atendente, vendas.id, dealId, { originKind: "organico" })).status).toBe(200);
    expect((await board(atendente, vendas.id)).body.stages[0]!.cards[0]).toMatchObject({ originKind: "organico", originCampaignId: null, originCampaignName: null });
  });

  it("campanha arquivada depois continua com o nome no negocio antigo, e segue valendo ali, mas nao serve para um negocio novo", async () => {
    const { admin, atendente, vendas, novo, camp, c1 } = await cenario();
    const dealId = await newDeal(atendente, vendas.id, c1, novo, { originKind: "campanha", originCampaignId: camp.id });
    await updateCampaign(admin, camp.id, { archived: true });

    expect((await board(atendente, vendas.id)).body.stages[0]!.cards[0]).toMatchObject({ originCampaignName: "Black Friday" });
    expect((await editDeal(atendente, vendas.id, dealId, { valueCents: 500 })).status).toBe(200);
    expect((await editDeal(atendente, vendas.id, dealId, { originKind: "campanha", originCampaignId: camp.id })).status).toBe(200);
    expect((await addDeal(atendente, vendas.id, c1, novo, { originKind: "campanha", originCampaignId: camp.id })).status).toBe(400);
  });
});
