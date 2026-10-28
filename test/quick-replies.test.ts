import { describe, expect, it } from "vitest";
import { api, postJson } from "./helpers/api";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";

const json = (cookie: string, method: string, path: string, body: unknown) =>
  api(path, { method, cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function lista(cookie: string) {
  const res = await api("/api/quick-replies", { cookie });
  return ((await res.json()) as { quickReplies: { id: string; shortcut: string; text: string }[] }).quickReplies;
}

describe("respostas rapidas: acesso", () => {
  it("exige login para listar", async () => {
    expect((await api("/api/quick-replies")).status).toBe(401);
  });

  it("atendente nao cria, edita nem apaga", async () => {
    const admin = await loginAsAdmin();
    const criada = await postJson("/api/quick-replies", { shortcut: "oi", text: "Oi {nome}!" }, { cookie: admin });
    const { id } = ((await criada.json()) as { quickReply: { id: string } }).quickReply;
    const atendente = await loginAsAtendente();
    expect((await postJson("/api/quick-replies", { shortcut: "x", text: "y" }, { cookie: atendente })).status).toBe(403);
    expect((await json(atendente, "PATCH", `/api/quick-replies/${id}`, { text: "z" })).status).toBe(403);
    expect((await json(atendente, "DELETE", `/api/quick-replies/${id}`, {})).status).toBe(403);
    expect(await lista(admin)).toMatchObject([{ shortcut: "oi", text: "Oi {nome}!" }]);
  });
});

describe("respostas rapidas: CRUD do admin", () => {
  it("admin cria, edita e apaga; atendente ve as mesmas da equipe", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const res = await postJson("/api/quick-replies", { shortcut: "ola", text: "Olá {nome}" }, { cookie: admin });
    expect(res.status).toBe(201);
    const { id } = ((await res.json()) as { quickReply: { id: string } }).quickReply;
    expect(await lista(atendente)).toMatchObject([{ id, shortcut: "ola", text: "Olá {nome}" }]);

    const edit = await json(admin, "PATCH", `/api/quick-replies/${id}`, { shortcut: "oi", text: "Oi!" });
    expect(edit.status).toBe(200);
    expect(await lista(atendente)).toMatchObject([{ id, shortcut: "oi", text: "Oi!" }]);

    expect((await json(admin, "DELETE", `/api/quick-replies/${id}`, {})).status).toBe(200);
    expect(await lista(atendente)).toEqual([]);
  });

  it("recusa atalho ou texto vazio e atalho repetido", async () => {
    const admin = await loginAsAdmin();
    expect((await postJson("/api/quick-replies", { shortcut: " ", text: "x" }, { cookie: admin })).status).toBe(400);
    expect((await postJson("/api/quick-replies", { shortcut: "a", text: "" }, { cookie: admin })).status).toBe(400);
    expect((await postJson("/api/quick-replies", { shortcut: "a", text: "1" }, { cookie: admin })).status).toBe(201);
    expect((await postJson("/api/quick-replies", { shortcut: "A", text: "2" }, { cookie: admin })).status).toBe(409);
  });

  it("editar ou apagar inexistente responde 404", async () => {
    const admin = await loginAsAdmin();
    expect((await json(admin, "PATCH", "/api/quick-replies/nao", { text: "x" })).status).toBe(404);
    expect((await json(admin, "DELETE", "/api/quick-replies/nao", {})).status).toBe(404);
  });
});
