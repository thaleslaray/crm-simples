import { describe, expect, it } from "vitest";
import { signIn } from "./helpers/api";
import { assume, assign, conversationOf, conversationWithClient, history, search } from "./helpers/conversations";
import { addNote, ageAvatar, editContact, ficha, listNotes, refreshAvatar } from "./helpers/ficha";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { connectRealtime } from "./helpers/realtime";
import { createUser } from "./helpers/users";

async function login(email: string, name: string) {
  const id = await createUser({ email, password: "senha-segura-123", name, role: "atendente" });
  return { id, cookie: (await signIn(email, "senha-segura-123")).cookie };
}

describe("Notas internas", () => {
  const uazapi = fakeUazapi();

  it("a nota aparece na lista com autor e horario e nunca gera chamada a Uazapi", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    const antes = Date.now();

    const res = await addNote(ana.cookie, conversa, "Cliente prefere ligar de manha");

    expect(res.status).toBe(201);
    const notas = await listNotes(ana.cookie, conversa);
    expect(notas).toMatchObject([{ text: "Cliente prefere ligar de manha", authorName: "Ana", conversationId: conversa }]);
    expect(notas[0]!.createdAt).toBeGreaterThanOrEqual(antes);
    expect(await uazapi.calls()).toEqual([]);
  });

  it("a nota nao entra no historico de mensagens nem muda o status da conversa", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);

    await addNote(ana.cookie, conversa, "so da equipe");

    expect((await history(ana.cookie, conversa)).messages.map((m) => m.text)).toEqual(["oi"]);
    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({ status: "aberta", assigneeId: null });
  });

  it("recusa nota vazia e conversa inexistente", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);

    expect((await addNote(ana.cookie, conversa, "   ")).status).toBe(400);
    expect((await addNote(ana.cookie, "nao-existe", "oi")).status).toBe(404);
  });

  it("publica a nota no tempo real para as outras sessoes", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(ana.cookie);
    const conn = await connectRealtime(beto.cookie);

    await addNote(ana.cookie, conversa, "combinado: desconto de 10%");

    expect(await conn.next()).toMatchObject({
      type: "note.created",
      conversationId: conversa,
      note: { text: "combinado: desconto de 10%", authorName: "Ana" },
    });
    conn.close();
  });

  it("a ficha agrega as notas do contato", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    const contactId = (await conversationOf(ana.cookie, conversa)).contact.id;
    await addNote(ana.cookie, conversa, "primeira");
    await addNote(ana.cookie, conversa, "segunda");

    const f = await ficha(ana.cookie, contactId);

    expect(f.notes.map((n) => n.text)).toEqual(["primeira", "segunda"]);
  });
});

async function contatoDe(cookie: string) {
  const conversa = await conversationWithClient(cookie);
  return { conversa, contactId: (await conversationOf(cookie, conversa)).contact.id };
}

describe("Ficha do contato", () => {
  const uazapi = fakeUazapi();

  it("mostra o contato com telefone e nome do WhatsApp, e campos vazios", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);

    const f = await ficha(ana.cookie, contactId);

    expect(f.contact).toMatchObject({ name: "Cliente", phone: "5511900000010", email: null, company: null, notes: null });
  });

  it("edita nome, e-mail, empresa e observacao e publica no tempo real", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const { contactId } = await contatoDe(ana.cookie);
    const conn = await connectRealtime(beto.cookie);

    const res = await editContact(ana.cookie, contactId, {
      name: "Maria Souza",
      email: "maria@loja.com",
      company: "Loja Maria",
      notes: "Prefere atendimento a tarde",
    });

    expect(res.status).toBe(200);
    expect((await ficha(ana.cookie, contactId)).contact).toMatchObject({
      name: "Maria Souza",
      email: "maria@loja.com",
      company: "Loja Maria",
      notes: "Prefere atendimento a tarde",
      phone: "5511900000010",
    });
    expect(await conn.next()).toMatchObject({ type: "contact.updated", contact: { id: contactId, name: "Maria Souza" } });
    expect(await conn.next()).toMatchObject({ type: "conversation.updated", conversation: { contact: { name: "Maria Souza" } } });
    conn.close();
  });

  it("o telefone nao e editavel", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);

    const res = await editContact(ana.cookie, contactId, { phone: "5511911111111" });

    expect(res.status).toBe(400);
    expect((await ficha(ana.cookie, contactId)).contact.phone).toBe("5511900000010");
  });

  it("recusa e-mail invalido e contato inexistente", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);

    expect((await editContact(ana.cookie, contactId, { email: "isso-nao-e-email" })).status).toBe(400);
    expect((await editContact(ana.cookie, "nao-existe", { name: "X" })).status).toBe(404);
  });

  it("o nome editado passa a valer na busca", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);

    await editContact(ana.cookie, contactId, { name: "Rosalvo Prado" });

    expect((await search(ana.cookie, "Rosalvo")).body.contacts).toHaveLength(1);
  });

  it("lista o historico de conversas com status e responsaveis", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const { conversa, contactId } = await contatoDe(ana.cookie);
    await assume(ana.cookie, conversa);
    await assign(ana.cookie, conversa, beto.id);

    const f = await ficha(ana.cookie, contactId);

    expect(f.conversations).toMatchObject([{ id: conversa, status: "em_andamento", assigneeName: "Beto", assignees: ["Ana", "Beto"] }]);
  });

  it("busca a foto na Uazapi ao abrir a ficha e nao repete enquanto a URL e recente", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);
    await uazapi.program("POST", "/chat/details", [{ body: { image: "https://pps.whatsapp.net/foto-1.jpg" } }]);

    const primeira = await ficha(ana.cookie, contactId);
    const segunda = await ficha(ana.cookie, contactId);

    expect(primeira.contact.avatarUrl).toBe("https://pps.whatsapp.net/foto-1.jpg");
    expect(segunda.contact.avatarUrl).toBe("https://pps.whatsapp.net/foto-1.jpg");
    expect(await uazapi.calls()).toMatchObject([{ method: "POST", path: "/chat/details", body: { number: "5511900000010" } }]);
  });

  it("renova a foto quando a URL temporaria expirou", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);
    await uazapi.program("POST", "/chat/details", [{ body: { image: "https://pps.whatsapp.net/foto-1.jpg" } }]);
    await ficha(ana.cookie, contactId);
    await uazapi.program("POST", "/chat/details", [{ body: { image: "https://pps.whatsapp.net/foto-2.jpg" } }]);
    await ageAvatar(contactId, 13 * 60 * 60 * 1000);

    expect((await ficha(ana.cookie, contactId)).contact.avatarUrl).toBe("https://pps.whatsapp.net/foto-2.jpg");
  });

  it("renova a foto sob demanda quando ela quebra no navegador", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);
    await uazapi.program("POST", "/chat/details", [{ body: { image: "https://pps.whatsapp.net/foto-1.jpg" } }]);
    await ficha(ana.cookie, contactId);
    await uazapi.program("POST", "/chat/details", [{ body: { image: "https://pps.whatsapp.net/foto-2.jpg" } }]);

    const res = await refreshAvatar(ana.cookie, contactId);

    expect(((await res.json()) as { contact: { avatarUrl: string } }).contact.avatarUrl).toBe("https://pps.whatsapp.net/foto-2.jpg");
  });

  it("se a Uazapi falha, a ficha abre com a foto que ja existia", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);
    await uazapi.program("POST", "/chat/details", [{ body: { image: "https://pps.whatsapp.net/foto-1.jpg" } }]);
    await ficha(ana.cookie, contactId);
    await uazapi.program("POST", "/chat/details", [{ status: 500, body: {} }]);
    await ageAvatar(contactId, 13 * 60 * 60 * 1000);

    expect((await ficha(ana.cookie, contactId)).contact.avatarUrl).toBe("https://pps.whatsapp.net/foto-1.jpg");
  });

  it("sem login, a ficha responde 401", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const { contactId } = await contatoDe(ana.cookie);

    expect((await ficha("", contactId)) as unknown).toEqual({ error: "nao_autenticado" });
  });
});
