import { describe, expect, it } from "vitest";
import { newCampaign, updateCampaign } from "./helpers/campanhas";
import { events, history, inbox } from "./helpers/conversations";
import { newClient, newFunnel, board, newDeal, closeDeal, type CardView } from "./helpers/funis";
import { newProduct, updateProduct } from "./helpers/produtos";
import { loginAsAdmin } from "./helpers/session";
import { mediaMessageEvent, postWebhook, textMessageEvent } from "./helpers/webhook";

const PHONE = "5511999990001";
const sender = `${PHONE}@s.whatsapp.net`;

/** Funil com etapas "Novo" e "Proposta", produto "Curso" (R$ 997) e a campanha dele. */
async function cenario() {
  const admin = await loginAsAdmin();
  const funil = await newFunnel(admin, "Vendas", ["Novo", "Proposta"]);
  const produto = await newProduct(admin, "Curso", 99700);
  const campanha = await newCampaign(admin, produto.id, { name: "Black Friday" });
  return { admin, funil, produto, campanha };
}

/** Id da conversa do cliente do teste. */
const conversaDe = async (admin: string): Promise<string> => (await inbox(admin)).find((c) => c.contact.phone === PHONE)!.id;

const cards = async (admin: string, funnelId: string): Promise<CardView[]> =>
  (await board(admin, funnelId)).body.stages.flatMap((s) => s.cards);

describe("Campanha: o codigo na mensagem cria o negocio", () => {
  it("cria o negocio no funil principal, 1a etapa, com produto, valor e campanha", async () => {
    const { admin, funil, produto, campanha } = await cenario();
    await postWebhook(textMessageEvent({ sender, text: `Oi! Quero o curso #${campanha.code}` }));

    const { body } = await board(admin, funil.id);
    expect(body.stages[0]!.cards).toMatchObject([
      {
        dealStatus: "aberto",
        phone: PHONE,
        productId: produto.id,
        valueCents: 99700,
        originKind: "campanha",
        originCampaignId: campanha.id,
        originCampaignName: "Black Friday",
      },
    ]);
    expect(body.stages[1]!.cards).toHaveLength(0);
  });

  it("reprocessar a mesma mensagem nao duplica o negocio", async () => {
    const { admin, funil, campanha } = await cenario();
    const evento = textMessageEvent({ id: "owner:REP1", sender, text: `#${campanha.code}` });
    await postWebhook(evento);
    await postWebhook(evento);
    expect(await cards(admin, funil.id)).toHaveLength(1);
  });

  it("grava na conversa 'negocio criado pela campanha' uma vez", async () => {
    const { admin, campanha } = await cenario();
    await postWebhook(textMessageEvent({ sender, text: `#${campanha.code}` }));
    const lista = await events(admin, await conversaDe(admin));
    expect(lista).toMatchObject([{ type: "campanha", campaignName: "Black Friday", campaignAction: "criou" }]);
  });

  it("negocio aberto do mesmo produto: nao cria outro e grava 'voltou pela campanha' uma vez", async () => {
    const { admin, funil, produto, campanha } = await cenario();
    const contactId = await newClient(admin, PHONE);
    await newDeal(admin, funil.id, contactId, funil.stages[1]!.id, { productId: produto.id });

    const evento = textMessageEvent({ id: "owner:RET1", sender, text: `#${campanha.code}` });
    await postWebhook(evento);
    await postWebhook(evento);

    expect(await cards(admin, funil.id)).toHaveLength(1);
    const lista = await events(admin, await conversaDe(admin));
    expect(lista).toMatchObject([{ type: "campanha", campaignName: "Black Friday", campaignAction: "voltou" }]);
  });

  it("negocio aberto de outro produto: cria um novo", async () => {
    const { admin, funil, campanha } = await cenario();
    const outro = await newProduct(admin, "Mentoria", 50000);
    const contactId = await newClient(admin, PHONE);
    await newDeal(admin, funil.id, contactId, funil.stages[1]!.id, { productId: outro.id });

    await postWebhook(textMessageEvent({ sender, text: `#${campanha.code}` }));
    expect(await cards(admin, funil.id)).toHaveLength(2);
  });

  it("negocio do mesmo produto ja fechado: cria um novo", async () => {
    const { admin, funil, produto, campanha } = await cenario();
    const contactId = await newClient(admin, PHONE);
    const dealId = await newDeal(admin, funil.id, contactId, funil.stages[0]!.id, { productId: produto.id });
    await closeDeal(admin, funil.id, dealId, { status: "perdido", lostReason: "preco" });

    await postWebhook(textMessageEvent({ sender, text: `#${campanha.code}` }));
    expect(await cards(admin, funil.id)).toMatchObject([{ originKind: "campanha" }]);
  });

  it("campanha arquivada e ignorada", async () => {
    const { admin, funil, campanha } = await cenario();
    await updateCampaign(admin, campanha.id, { archived: true });
    await postWebhook(textMessageEvent({ sender, text: `#${campanha.code}` }));
    expect(await cards(admin, funil.id)).toHaveLength(0);
  });

  it("sem funil com etapa: nao cria e a mensagem e gravada", async () => {
    const admin = await loginAsAdmin();
    const produto = await newProduct(admin, "Curso", 99700);
    const campanha = await newCampaign(admin, produto.id);
    await newFunnel(admin, "Vazio", []);
    await postWebhook(textMessageEvent({ sender, text: `#${campanha.code}` }));
    const conversa = await conversaDe(admin);
    expect((await history(admin, conversa)).messages).toHaveLength(1);
    expect(await events(admin, conversa)).toHaveLength(0);
  });

  it("sem codigo na mensagem: nao cria", async () => {
    const { admin, funil, campanha } = await cenario();
    await postWebhook(textMessageEvent({ sender, text: `Oi, vi a campanha ${campanha.code} sem o jogo da velha` }));
    await postWebhook(textMessageEvent({ sender, text: "Oi, tudo bem? #promo" }));
    expect(await cards(admin, funil.id)).toHaveLength(0);
  });

  it("codigo em minusculas, no meio do texto, funciona", async () => {
    const { admin, funil, campanha } = await cenario();
    await postWebhook(textMessageEvent({ sender, text: `Quero saber mais #${campanha.code.toLowerCase()} obrigado` }));
    expect(await cards(admin, funil.id)).toHaveLength(1);
  });

  it("legenda de midia funciona", async () => {
    const { admin, funil, campanha } = await cenario();
    await postWebhook(mediaMessageEvent({ sender, kind: "image", caption: `Olha #${campanha.code}` }));
    expect(await cards(admin, funil.id)).toHaveLength(1);
  });

  it("produto arquivado: usa o produto e o preco da campanha mesmo assim", async () => {
    const { admin, funil, produto, campanha } = await cenario();
    await updateProduct(admin, produto.id, { archived: true });
    await postWebhook(textMessageEvent({ sender, text: `#${campanha.code}` }));
    expect(await cards(admin, funil.id)).toMatchObject([{ productId: produto.id, valueCents: 99700 }]);
  });

  it("varios codigos: usa o primeiro que existir e fica no fim da etapa", async () => {
    const { admin, funil, campanha } = await cenario();
    const outro = await newClient(admin, "5511988880000");
    await newDeal(admin, funil.id, outro, funil.stages[0]!.id);
    await postWebhook(textMessageEvent({ sender, text: `#ZZZ-M99 e #${campanha.code}` }));
    expect((await cards(admin, funil.id)).map((c) => c.phone)).toEqual(["5511988880000", PHONE]);
  });
});
