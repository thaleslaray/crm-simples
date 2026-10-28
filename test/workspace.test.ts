import { describe, expect, it } from "vitest";
import { signIn } from "./helpers/api";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";
import { createUser, setUserRole } from "./helpers/users";
import { getWorkspace, setCompanyName } from "./helpers/workspace";

describe("Empresa: nome", () => {
  it("sem nome salvo o padrao e Atendimento, e a leitura e publica (ate sem login)", async () => {
    expect(await getWorkspace()).toEqual({ status: 200, companyName: "Atendimento" });
  });

  it("o admin troca o nome e qualquer um le o novo, ate sem login", async () => {
    const admin = await loginAsAdmin();

    const res = await setCompanyName(admin, "  Loja da Ana ");

    expect(res.status).toBe(200);
    expect(await getWorkspace()).toEqual({ status: 200, companyName: "Loja da Ana" });
  });

  it("a troca do nome avisa os clientes conectados pelo hub", async () => {
    const admin = await loginAsAdmin();
    const atendente = await loginAsAtendente();
    const socket = await connectRealtime(atendente);

    await setCompanyName(admin, "Loja da Ana");

    expect(await socket.next()).toEqual({ type: "workspace.changed", companyName: "Loja da Ana" });
    socket.close();
  });

  it("atendente recebe 403 e o nome nao muda", async () => {
    const atendente = await loginAsAtendente();

    expect((await setCompanyName(atendente, "Invasor")).status).toBe(403);
    expect((await getWorkspace()).companyName).toBe("Atendimento");
  });

  it("sem sessao recebe 401", async () => {
    expect((await setCompanyName("", "X")).status).toBe(401);
  });

  it("admin rebaixado recebe 403 mesmo com o cookie ainda valido", async () => {
    const id = await createUser({ email: "ex-admin@exemplo.com", password: "senha-segura-123", role: "admin" });
    const { cookie } = await signIn("ex-admin@exemplo.com", "senha-segura-123");
    expect((await setCompanyName(cookie, "Antes")).status).toBe(200);

    await setUserRole(id, "atendente");

    expect((await setCompanyName(cookie, "Depois")).status).toBe(403);
    expect((await getWorkspace()).companyName).toBe("Antes");
  });

  it("recusa nome vazio, so espacos, nao texto ou grande demais", async () => {
    const admin = await loginAsAdmin();
    for (const bad of ["", "   ", 42, null, "x".repeat(61)]) {
      const res = await setCompanyName(admin, bad);
      expect(res.status).toBe(400);
    }
    expect((await getWorkspace()).companyName).toBe("Atendimento");
  });
});
