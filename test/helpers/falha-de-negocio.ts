import { env } from "cloudflare:workers";

// Simula o banco recusando a criacao de negocio (a mensagem do cliente continua sendo gravada).

export async function breakDealCreation() {
  await env.DB.exec("CREATE TRIGGER teste_sem_negocio BEFORE INSERT ON deal BEGIN SELECT RAISE(ABORT, 'falha simulada'); END");
}

export async function fixDealCreation() {
  await env.DB.exec("DROP TRIGGER IF EXISTS teste_sem_negocio");
}
