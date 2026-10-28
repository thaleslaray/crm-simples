import { signIn } from "./api";
import { createUser } from "./users";

/** Cria um admin e devolve o cookie de sessao dele. */
export async function loginAsAdmin(email = "admin@exemplo.com"): Promise<string> {
  await createUser({ email, password: "senha-segura-123", role: "admin" });
  const { cookie } = await signIn(email, "senha-segura-123");
  return cookie;
}

/** Cria um atendente e devolve o cookie de sessao dele. */
export async function loginAsAtendente(email = "atendente@exemplo.com"): Promise<string> {
  await createUser({ email, password: "senha-segura-123", role: "atendente" });
  const { cookie } = await signIn(email, "senha-segura-123");
  return cookie;
}
