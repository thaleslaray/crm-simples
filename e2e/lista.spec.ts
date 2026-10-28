import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";
import { E2E_ADMIN, E2E_WEBHOOK } from "./e2e-env";

async function clientWrites(
  request: APIRequestContext,
  id: string,
  phone: string,
) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `lista-${id}`,
        messageid: `WALI${id}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${id}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: `Oi, aqui é ${id}`,
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

/** Número no chip (zero quando o chip não mostra contagem). */
async function countOf(chip: Locator): Promise<number> {
  const badge = chip.getByTestId("chip-count");
  return (await badge.count()) === 0 ? 0 : Number(await badge.innerText());
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test("chips filtram, contagens batem e a terceira linha mostra status, responsável e etiquetas", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = (n: number) =>
    `55119${String(Date.now()).slice(-7)}${n}`.slice(0, 13);
  const names = { a: `A${run}`, b: `B${run}`, c: `C${run}` };

  await signInAsAdmin(page);
  const semDono = page.getByRole("button", { name: /^Sem dono/ });
  const naoLidas = page.getByRole("button", { name: /^Não lidas/ });
  await expect(page.getByRole("button", { name: "Tudo" })).toBeVisible();
  // Contagens de partida vêm da API (o banco do E2E não começa vazio); os chips têm de chegar nelas.
  const before = (await (await page.request.get("/api/conversations")).json()) as {
    conversations: { assigneeId: string | null; status: string; unreadCount: number }[];
  };
  const semDono0 = before.conversations.filter(
    (c) => c.assigneeId === null && c.status !== "resolvida",
  ).length;
  const naoLidas0 = before.conversations.filter((c) => c.unreadCount > 0).length;
  await expect.poll(() => countOf(semDono)).toBe(semDono0);
  await expect.poll(() => countOf(naoLidas)).toBe(naoLidas0);

  // A: aberta, sem dono, 3 etiquetas. B: assumida pelo admin. C: assumida e resolvida.
  const phones = { a: phone(1), b: phone(2), c: phone(3) };
  await clientWrites(request, names.a, phones.a);
  await clientWrites(request, names.b, phones.b);
  await clientWrites(request, names.c, phones.c);
  const list = (await (
    await page.request.get("/api/conversations")
  ).json()) as {
    conversations: { id: string; contact: { id: string; phone: string } }[];
  };
  const byPhone = (p: string) =>
    list.conversations.find((c) => c.contact.phone === p)!;
  expect(
    (
      await page.request.post(
        `/api/conversations/${byPhone(phones.b).id}/assume`,
      )
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(
        `/api/conversations/${byPhone(phones.c).id}/assume`,
      )
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(
        `/api/conversations/${byPhone(phones.c).id}/resolve`,
      )
    ).ok(),
  ).toBe(true);
  const tags: string[] = [];
  for (const n of [1, 2, 3]) {
    const name = `Tag${n}${run}`;
    const res = await page.request.post("/api/labels", {
      data: { name, color: ["#e91e63", "#2196f3", "#4caf50"][n - 1] },
    });
    expect(res.status()).toBe(201);
    const { label } = (await res.json()) as { label: { id: string } };
    expect(
      (
        await page.request.put(
          `/api/contacts/${byPhone(phones.a).contact.id}/labels/${label.id}`,
        )
      ).ok(),
    ).toBe(true);
    tags.push(name);
  }

  await page.reload();
  const row = (n: string) =>
    page.getByRole("link", { name: new RegExp(`Cliente ${n}`) });

  // Contagens: sem filtro, só A é "sem dono" (C está resolvida); as três têm não lidas
  await expect.poll(() => countOf(semDono)).toBe(semDono0 + 1);
  await expect.poll(() => countOf(naoLidas)).toBe(naoLidas0 + 3);

  // Terceira linha: status, responsável (ou "sem dono") e até 2 etiquetas + "+N"
  await expect(row(names.a)).toContainText("Aberta");
  await expect(row(names.a)).toContainText("sem dono");
  await expect(row(names.a)).toContainText(tags[0]!);
  await expect(row(names.a)).toContainText(tags[1]!);
  await expect(row(names.a)).not.toContainText(tags[2]!);
  await expect(row(names.a)).toContainText("+1");
  await expect(row(names.b)).toContainText("Em andamento");
  await expect(row(names.b)).toContainText(E2E_ADMIN.name);
  await expect(row(names.c)).toContainText("Resolvida");
  await noHorizontalOverflow(page);

  // Minhas: B e C são do admin
  await page.getByRole("button", { name: "Minhas" }).click();
  await expect(row(names.b)).toBeVisible();
  await expect(row(names.c)).toBeVisible();
  await expect(row(names.a)).toHaveCount(0);

  // Sem dono: só A (resolvidas ficam de fora)
  await semDono.click();
  await expect(row(names.a)).toBeVisible();
  await expect(row(names.b)).toHaveCount(0);
  await expect(row(names.c)).toHaveCount(0);

  // Não lidas: filtrado no cliente
  await naoLidas.click();
  for (const n of Object.values(names)) await expect(row(n)).toBeVisible();

  // Tudo volta com as três
  await page.getByRole("button", { name: "Tudo" }).click();
  for (const n of Object.values(names)) await expect(row(n)).toBeVisible();

  // Prints da revisão visual (só com E2E_PRINTS): lista, ▾ e ⋮ nos dois temas
  const dir = process.env.E2E_PRINTS;
  if (dir) {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const shot = (name: string) =>
        page.screenshot({
          path: `${dir}/lista-${name}-${scheme}-${info.project.name}.png`,
        });
      await shot("lista");
      await page.getByRole("button", { name: "Mais filtros" }).click();
      await shot("filtros");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Mais opções" }).click();
      await shot("menu");
      await page.keyboard.press("Escape");
    }
    await page.emulateMedia({ colorScheme: "light" });
  }

  // ▾: status e etiqueta; o filtro ativo aparece no chip
  await page.getByRole("button", { name: "Mais filtros" }).click();
  await page.getByRole("button", { name: "Em andamento", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mais filtros: Em andamento" }),
  ).toBeVisible();
  await expect(row(names.b)).toBeVisible();
  await expect(row(names.a)).toHaveCount(0);
  await page.getByRole("button", { name: /^Mais filtros/ }).click();
  await page.getByRole("button", { name: "Em andamento", exact: true }).click();
  await page.getByRole("button", { name: /^Mais filtros/ }).click();
  await page.getByRole("button", { name: tags[2]!, exact: true }).click();
  await expect(row(names.a)).toBeVisible();
  await expect(row(names.b)).toHaveCount(0);
  await page.getByRole("button", { name: /^Mais filtros/ }).click();
  await page.getByRole("button", { name: tags[2]!, exact: true }).click();

  // Estado vazio à direita (só no computador; no celular a lista ocupa a tela)
  if (info.project.name !== "mobile")
    await expect(
      page.getByText("Escolha uma conversa à esquerda"),
    ).toBeVisible();

  // "+" abre a nova conversa
  await page.getByRole("button", { name: "Nova conversa" }).click();
  await expect(
    page.getByRole("dialog", { name: "Nova conversa" }),
  ).toBeVisible();
});
