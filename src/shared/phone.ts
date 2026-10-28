/**
 * Normaliza um numero digitado pelo atendente para so digitos com codigo do pais (ex.: 5511988887777).
 * Aceita mascara (espaco, hifen, parenteses, ponto) e "+". Sem "+", numero de 10 ou 11 digitos e tratado como
 * brasileiro (ganha o 55). Devolve null se tem outro caractere ou o tamanho nao fecha (12 a 15 digitos com o pais).
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  const full = !raw.startsWith("+") && digits.length >= 10 && digits.length <= 11 ? `55${digits}` : digits;
  return full.length >= 12 && full.length <= 15 ? full : null;
}
