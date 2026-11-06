import { describe, expect, it } from "vitest";
import { newCampaign, updateCampaign } from "./helpers/campanhas";
import { closeDeal, newClient, newDeal, newFunnel, reopenDeal } from "./helpers/funis";
import { newProduct, updateProduct } from "./helpers/produtos";
import { report, reportRows, setDealDates } from "./helpers/relatorio";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";

describe("Relatório de campanhas: acesso e período", () => {
  it("atendente recebe 403; sem login, 401", async () => {
    const atendente = await loginAsAtendente();
    expect((await report(atendente, "?from=0&to=10")).status).toBe(403);
    expect((await report("", "?from=0&to=10")).status).toBe(401);
  });

  it("período inválido é 400: faltando, não inteiro ou from maior que to", async () => {
    const admin = await loginAsAdmin();
    for (const q of ["", "?from=1", "?from=a&to=2", "?from=1.5&to=2", "?from=5&to=1", "?from=-1&to=2"]) {
      expect((await report(admin, q)).status, q).toBe(400);
    }
    expect((await report(admin, "?from=5&to=5")).status).toBe(200);
  });
});

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1); // 1 de outubro de 2026
const FROM = T0;
const TO = T0 + 30 * DAY; // limite superior inclusivo

let seq = 0;
/** Cria um negocio pela API e depois ajusta datas/situacao. */
async function deal(
  admin: string,
  funnel: { id: string; stages: { id: string }[] },
  extra: Record<string, unknown>,
  f: { createdAt: number; closed?: { at: number; status: "ganho" | "perdido"; valueCents?: number } },
): Promise<string> {
  const contact = await newClient(admin, `5511977${String(100000 + ++seq)}`);
  const id = await newDeal(admin, funnel.id, contact, funnel.stages[0]!.id, extra);
  if (f.closed) {
    const body = f.closed.status === "ganho" ? { status: "ganho", valueCents: f.closed.valueCents ?? 1000 } : { status: "perdido", lostReason: "preco" };
    await closeDeal(admin, funnel.id, id, body);
    await setDealDates(id, { createdAt: f.createdAt, closedAt: f.closed.at });
  } else await setDealDates(id, { createdAt: f.createdAt });
  return id;
}

describe("Relatório de campanhas: números por origem", () => {
  it("conta criados, ganhos, perdidos e faturado por campanha; conversão = ganhos / criados; total no fim", async () => {
    const admin = await loginAsAdmin();
    const funnel = await newFunnel(admin, "Vendas", ["Novo"]);
    const curso = await newProduct(admin, "Curso");
    const camp = await newCampaign(admin, curso.id, { name: "Black Friday" });
    const origin = { originKind: "campanha", originCampaignId: camp.id, productId: curso.id };
    await deal(admin, funnel, origin, { createdAt: FROM + DAY, closed: { at: FROM + 2 * DAY, status: "ganho", valueCents: 50000 } });
    await deal(admin, funnel, origin, { createdAt: FROM + DAY, closed: { at: FROM + 3 * DAY, status: "ganho", valueCents: 25000 } });
    await deal(admin, funnel, origin, { createdAt: FROM + DAY, closed: { at: FROM + 3 * DAY, status: "perdido" } });
    await deal(admin, funnel, origin, { createdAt: FROM + DAY });

    const { rows, total } = await reportRows(admin, FROM, TO);

    expect(rows).toEqual([{ key: `campanha:${camp.id}`, label: "Black Friday", created: 4, won: 2, lost: 1, revenueCents: 75000, conversion: 0.5 }]);
    expect(total).toEqual({ created: 4, won: 2, lost: 1, revenueCents: 75000, conversion: 0.5 });
  });

  it("origens fixas e Sem origem têm linha própria, na ordem Indicação, Orgânico, Cliente antigo, Outro, Sem origem; linhas zeradas não aparecem", async () => {
    const admin = await loginAsAdmin();
    const funnel = await newFunnel(admin, "Vendas", ["Novo"]);
    const inP = { createdAt: FROM + DAY };
    await deal(admin, funnel, { originKind: "outro" }, inP);
    await deal(admin, funnel, {}, inP);
    await deal(admin, funnel, { originKind: "indicacao" }, { createdAt: FROM + DAY, closed: { at: FROM + 2 * DAY, status: "ganho", valueCents: 10000 } });
    await deal(admin, funnel, { originKind: "cliente_antigo" }, inP);
    // organico nao tem nada no periodo: nao aparece
    await deal(admin, funnel, { originKind: "organico" }, { createdAt: FROM - 10 * DAY });

    const { rows, total } = await reportRows(admin, FROM, TO);

    expect(rows.map((r) => [r.key, r.label, r.created, r.won, r.revenueCents])).toEqual([
      ["indicacao", "Indicação", 1, 1, 10000],
      ["cliente_antigo", "Cliente antigo", 1, 0, 0],
      ["outro", "Outro", 1, 0, 0],
      ["sem_origem", "Sem origem", 1, 0, 0],
    ]);
    expect(total).toMatchObject({ created: 4, won: 1, revenueCents: 10000, conversion: 0.25 });
  });

  it("limites do período são inclusivos; criado fora do período mas fechado dentro conta só em ganhos e faturado", async () => {
    const admin = await loginAsAdmin();
    const funnel = await newFunnel(admin, "Vendas", ["Novo"]);
    const ind = { originKind: "indicacao" };
    await deal(admin, funnel, ind, { createdAt: FROM }); // no limite inferior: conta
    await deal(admin, funnel, ind, { createdAt: TO }); // no limite superior: conta
    await deal(admin, funnel, ind, { createdAt: FROM - 1 }); // um ms antes: nao conta
    await deal(admin, funnel, ind, { createdAt: TO + 1 }); // um ms depois: nao conta
    // criado em setembro, ganho em outubro: nao e "criado", mas e ganho e faturado
    await deal(admin, funnel, ind, { createdAt: FROM - 5 * DAY, closed: { at: FROM + DAY, status: "ganho", valueCents: 7000 } });
    // criado em outubro, ganho depois do periodo: criado sim, ganho nao
    await deal(admin, funnel, ind, { createdAt: FROM + DAY, closed: { at: TO + DAY, status: "ganho", valueCents: 9000 } });

    const { rows } = await reportRows(admin, FROM, TO);

    expect(rows).toEqual([{ key: "indicacao", label: "Indicação", created: 3, won: 1, lost: 0, revenueCents: 7000, conversion: 1 / 3 }]);
  });

  it("negócio reaberto não conta como ganho nem perdido", async () => {
    const admin = await loginAsAdmin();
    const funnel = await newFunnel(admin, "Vendas", ["Novo"]);
    const id = await deal(admin, funnel, { originKind: "outro" }, { createdAt: FROM + DAY, closed: { at: FROM + 2 * DAY, status: "ganho", valueCents: 5000 } });
    await reopenDeal(admin, funnel.id, id);

    const { rows } = await reportRows(admin, FROM, TO);

    expect(rows).toMatchObject([{ key: "outro", created: 1, won: 0, lost: 0, revenueCents: 0 }]);
  });

  it("campanha arquivada continua na linha, com o nome", async () => {
    const admin = await loginAsAdmin();
    const funnel = await newFunnel(admin, "Vendas", ["Novo"]);
    const curso = await newProduct(admin, "Curso");
    const camp = await newCampaign(admin, curso.id, { name: "Lançamento antigo" });
    await deal(admin, funnel, { originKind: "campanha", originCampaignId: camp.id }, { createdAt: FROM + DAY });
    await updateCampaign(admin, camp.id, { archived: true });

    const { rows } = await reportRows(admin, FROM, TO);

    expect(rows).toMatchObject([{ label: "Lançamento antigo", created: 1 }]);
  });

  it("filtro de produto vale para todos os números: um produto, sem produto e produto arquivado", async () => {
    const admin = await loginAsAdmin();
    const funnel = await newFunnel(admin, "Vendas", ["Novo"]);
    const curso = await newProduct(admin, "Curso");
    const mentoria = await newProduct(admin, "Mentoria");
    const ind = { originKind: "indicacao" };
    await deal(admin, funnel, { ...ind, productId: curso.id }, { createdAt: FROM + DAY, closed: { at: FROM + 2 * DAY, status: "ganho", valueCents: 10000 } });
    await deal(admin, funnel, { ...ind, productId: mentoria.id }, { createdAt: FROM + DAY, closed: { at: FROM + 2 * DAY, status: "perdido" } });
    await deal(admin, funnel, ind, { createdAt: FROM + DAY });
    await updateProduct(admin, mentoria.id, { archived: true });

    const doCurso = await reportRows(admin, FROM, TO, curso.id);
    const daMentoria = await reportRows(admin, FROM, TO, mentoria.id);
    const semProduto = await reportRows(admin, FROM, TO, "none");
    const todos = await reportRows(admin, FROM, TO);

    expect(doCurso.total).toMatchObject({ created: 1, won: 1, lost: 0, revenueCents: 10000 });
    expect(daMentoria.total).toMatchObject({ created: 1, won: 0, lost: 1, revenueCents: 0 });
    expect(semProduto.total).toMatchObject({ created: 1, won: 0, lost: 0 });
    expect(todos.total).toMatchObject({ created: 3, won: 1, lost: 1 });
  });

  it("período sem negócios: sem linhas e total zerado com conversão nula", async () => {
    const admin = await loginAsAdmin();

    expect(await reportRows(admin, FROM, TO)).toEqual({ rows: [], total: { created: 0, won: 0, lost: 0, revenueCents: 0, conversion: null } });
  });
});
