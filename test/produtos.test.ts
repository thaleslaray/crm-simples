import { describe, expect, it } from "vitest";
import { createProduct, listProducts, newProduct, updateProduct } from "./helpers/produtos";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";

describe("Produtos", () => {
  it("admin cria produto e todo membro o ve na lista", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();

    const res = await createProduct(admin, { name: "Curso", priceCents: 99700 });

    expect(res.status).toBe(201);
    expect(await listProducts(atendente)).toMatchObject([{ name: "Curso", priceCents: 99700, archivedAt: null }]);
  });

  it("atendente nao cria nem edita", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const curso = await newProduct(admin, "Curso");

    expect((await createProduct(atendente, { name: "Novo", priceCents: 100 })).status).toBe(403);
    expect((await updateProduct(atendente, curso.id, { name: "X" })).status).toBe(403);
    expect(await listProducts(admin)).toMatchObject([{ name: "Curso" }]);
  });

  it("recusa nome vazio ou acima de 80, preco negativo, quebrado ou ausente", async () => {
    const admin = await loginAsAdmin();

    expect((await createProduct(admin, { name: "  ", priceCents: 100 })).status).toBe(400);
    expect((await createProduct(admin, { name: "a".repeat(81), priceCents: 100 })).status).toBe(400);
    expect((await createProduct(admin, { name: "A", priceCents: -1 })).status).toBe(400);
    expect((await createProduct(admin, { name: "A", priceCents: 10.5 })).status).toBe(400);
    expect((await createProduct(admin, { name: "A" })).status).toBe(400);
    expect((await createProduct(admin, { name: "a".repeat(80), priceCents: 0 })).status).toBe(201);
  });

  it("nome repetido responde 409 sem diferenciar maiusculas", async () => {
    const admin = await loginAsAdmin();
    expect((await createProduct(admin, { name: "Curso", priceCents: 100 })).status).toBe(201);
    expect((await createProduct(admin, { name: "curso", priceCents: 200 })).status).toBe(409);
  });

  it("admin muda nome e preco; inexistente responde 404; edicao vazia ou invalida responde 400", async () => {
    const admin = await loginAsAdmin();
    const curso = await newProduct(admin, "Curso");

    expect((await updateProduct(admin, curso.id, { name: "Mentoria", priceCents: 0 })).status).toBe(200);

    expect(await listProducts(admin)).toMatchObject([{ id: curso.id, name: "Mentoria", priceCents: 0 }]);
    expect((await updateProduct(admin, "nao", { name: "x" })).status).toBe(404);
    expect((await updateProduct(admin, curso.id, {})).status).toBe(400);
    expect((await updateProduct(admin, curso.id, { priceCents: -5 })).status).toBe(400);
  });

  it("renomear para nome de outro produto responde 409", async () => {
    const admin = await loginAsAdmin();
    await newProduct(admin, "Curso");
    const mentoria = await newProduct(admin, "Mentoria");

    expect((await updateProduct(admin, mentoria.id, { name: "CURSO" })).status).toBe(409);
  });

  it("arquivar tira da lista de escolha, mas ele continua existindo (todos=1) e pode voltar", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const curso = await newProduct(admin, "Curso");
    await newProduct(admin, "Mentoria");

    expect((await updateProduct(admin, curso.id, { archived: true })).status).toBe(200);

    expect(await listProducts(atendente)).toMatchObject([{ name: "Mentoria" }]);
    const all = await listProducts(atendente, true);
    expect(all.map((p) => p.name).sort()).toEqual(["Curso", "Mentoria"]);
    expect(all.find((p) => p.id === curso.id)?.archivedAt).toEqual(expect.any(Number));

    expect((await updateProduct(admin, curso.id, { archived: false })).status).toBe(200);
    expect((await listProducts(atendente)).map((p) => p.name).sort()).toEqual(["Curso", "Mentoria"]);
  });

  it("atendente nao arquiva", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const curso = await newProduct(admin, "Curso");

    expect((await updateProduct(atendente, curso.id, { archived: true })).status).toBe(403);
    expect(await listProducts(admin)).toMatchObject([{ name: "Curso", archivedAt: null }]);
  });
});
