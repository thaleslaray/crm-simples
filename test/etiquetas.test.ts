import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { conversationWithClient, inbox } from "./helpers/conversations";
import { applyLabel, contactList, createLabel, deleteLabel, inboxByLabel, listLabels, newLabel, removeLabel, updateLabel } from "./helpers/etiquetas";
import { ficha } from "./helpers/ficha";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";

describe("Etiquetas: cadastro", () => {
  it("admin cria etiqueta e todo membro a ve na lista", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();

    const res = await createLabel(admin, "VIP", "#16a34a");

    expect(res.status).toBe(201);
    expect(await listLabels(atendente)).toMatchObject([{ name: "VIP", color: "#16a34a" }]);
  });

  it("atendente nao cria, renomeia nem apaga", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const vip = await newLabel(admin, "VIP");

    expect((await createLabel(atendente, "Nova")).status).toBe(403);
    expect((await updateLabel(atendente, vip.id, { name: "X" })).status).toBe(403);
    expect((await deleteLabel(atendente, vip.id)).status).toBe(403);
    expect(await listLabels(admin)).toMatchObject([{ name: "VIP" }]);
  });

  it("recusa nome vazio, cor invalida e nome repetido (sem diferenciar maiusculas)", async () => {
    const admin = await loginAsAdmin();
    expect((await createLabel(admin, "  ")).status).toBe(400);
    expect((await createLabel(admin, "A", "vermelho")).status).toBe(400);
    expect((await createLabel(admin, "Lead")).status).toBe(201);
    expect((await createLabel(admin, "lead")).status).toBe(409);
  });

  it("admin renomeia e muda a cor; inexistente responde 404", async () => {
    const admin = await loginAsAdmin();
    const lead = await newLabel(admin, "Lead");

    expect((await updateLabel(admin, lead.id, { name: "Quente", color: "#dc2626" })).status).toBe(200);

    expect(await listLabels(admin)).toMatchObject([{ id: lead.id, name: "Quente", color: "#dc2626" }]);
    expect((await updateLabel(admin, "nao", { name: "x" })).status).toBe(404);
    expect((await deleteLabel(admin, "nao")).status).toBe(404);
  });
});

describe("Etiquetas: no contato", () => {
  async function cenario() {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    await conversationWithClient(admin);
    const contactId = (await inbox(admin))[0]!.contact.id;
    return { admin, atendente, contactId };
  }

  it("atendente aplica e remove etiqueta existente; a ficha mostra", async () => {
    const { admin, atendente, contactId } = await cenario();
    const vip = await newLabel(admin, "VIP");

    expect((await applyLabel(atendente, contactId, vip.id)).status).toBe(200);
    expect((await ficha(atendente, contactId)).contact).toMatchObject({ labels: [{ id: vip.id, name: "VIP" }] });

    expect((await removeLabel(atendente, contactId, vip.id)).status).toBe(200);
    expect((await ficha(atendente, contactId)).contact).toMatchObject({ labels: [] });
  });

  it("aplicar duas vezes nao duplica; etiqueta ou contato inexistente responde 404", async () => {
    const { admin, contactId } = await cenario();
    const vip = await newLabel(admin, "VIP");

    await applyLabel(admin, contactId, vip.id);
    await applyLabel(admin, contactId, vip.id);

    expect((await ficha(admin, contactId)).contact.labels).toHaveLength(1);
    expect((await applyLabel(admin, contactId, "nao")).status).toBe(404);
    expect((await applyLabel(admin, "nao", vip.id)).status).toBe(404);
  });

  it("apagar a etiqueta a remove de todos os contatos", async () => {
    const { admin, contactId } = await cenario();
    const vip = await newLabel(admin, "VIP");
    await applyLabel(admin, contactId, vip.id);

    expect((await deleteLabel(admin, vip.id)).status).toBe(200);

    expect((await ficha(admin, contactId)).contact.labels).toEqual([]);
    expect((await inbox(admin))[0]!.contact).toMatchObject({ labels: [] });
  });

  it("renomear aparece no contato", async () => {
    const { admin, contactId } = await cenario();
    const vip = await newLabel(admin, "VIP");
    await applyLabel(admin, contactId, vip.id);

    await updateLabel(admin, vip.id, { name: "Ouro" });

    expect((await ficha(admin, contactId)).contact.labels).toMatchObject([{ name: "Ouro" }]);
  });

  it("a caixa de entrada mostra as etiquetas e filtra por etiqueta", async () => {
    const { admin, contactId } = await cenario();
    await conversationWithClient(admin, "5511900000020");
    const vip = await newLabel(admin, "VIP");
    await applyLabel(admin, contactId, vip.id);

    const filtradas = await inboxByLabel(admin, vip.id);

    expect(filtradas.map((c) => c.contact.id)).toEqual([contactId]);
    expect(filtradas[0]!.contact.labels).toMatchObject([{ name: "VIP" }]);
    expect(await inbox(admin)).toHaveLength(2);
  });

  it("aplicar etiqueta publica evento em tempo real", async () => {
    const { admin, contactId } = await cenario();
    const vip = await newLabel(admin, "VIP");
    const ws = await connectRealtime(admin);

    await applyLabel(admin, contactId, vip.id);

    expect(await ws.next()).toMatchObject({ type: "contact.updated", contact: { id: contactId, labels: [{ name: "VIP" }] } });
    ws.close();
  });
});

describe("Lista de contatos", () => {
  it("exige login", async () => {
    expect((await api("/api/contacts")).status).toBe(401);
  });

  it("busca por nome ou telefone e filtra por etiqueta", async () => {
    const admin = await loginAsAdmin();
    await conversationWithClient(admin, "5511900000031");
    await conversationWithClient(admin, "5511900000032");
    const todos = (await contactList(admin)).contacts;
    expect(todos).toHaveLength(2);
    const alvo = todos.find((c) => c.phone === "5511900000032")!;
    const vip = await newLabel(admin, "VIP");
    await applyLabel(admin, alvo.id, vip.id);

    expect((await contactList(admin, { q: "0032" })).contacts.map((c) => c.phone)).toEqual(["5511900000032"]);
    expect((await contactList(admin, { q: "Client" })).contacts).toHaveLength(2);
    expect((await contactList(admin, { label: vip.id })).contacts).toMatchObject([{ phone: "5511900000032", labels: [{ name: "VIP" }] }]);
    expect((await contactList(admin, { q: "0031", label: vip.id })).contacts).toEqual([]);
    expect(alvo.conversationId).toBeTruthy();
  });
});
