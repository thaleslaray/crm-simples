/** Nome do erro para log: nunca a mensagem nem o conteudo (podem trazer token ou dados de cliente). */
export function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "desconhecido";
}
