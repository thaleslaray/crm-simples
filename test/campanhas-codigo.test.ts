import { describe, expect, it } from "vitest";
import { codePrefix, nextCode } from "../src/worker/campaign-code";

describe("Campanhas: gerador de codigo", () => {
  it("prefixo: 3 letras maiusculas sem acento + letra do canal", () => {
    expect(codePrefix("Curso de Inglês", "meta")).toBe("CUR-M");
    expect(codePrefix("Ação Imediata", "google")).toBe("ACA-G");
    expect(codePrefix("Mentoria", "instagram")).toBe("MEN-I");
    expect(codePrefix("Mentoria", "tiktok")).toBe("MEN-T");
    expect(codePrefix("Mentoria", "outro")).toBe("MEN-O");
  });

  it("ignora digitos, simbolos e espacos; completa com X quando faltam letras", () => {
    expect(codePrefix("1º Curso!", "meta")).toBe("CUR-M");
    expect(codePrefix("Go", "meta")).toBe("GOX-M");
    expect(codePrefix("A", "meta")).toBe("AXX-M");
    expect(codePrefix("2024 !!", "meta")).toBe("XXX-M");
  });

  it("sequencia por prefixo: comeca em 01 e segue o maior ja usado", () => {
    expect(nextCode("CUR-M", [])).toBe("CUR-M01");
    expect(nextCode("CUR-M", ["CUR-M01", "CUR-M02"])).toBe("CUR-M03");
    expect(nextCode("CUR-M", ["CUR-M01", "CUR-M07"])).toBe("CUR-M08");
  });

  it("outros prefixos nao entram na conta", () => {
    expect(nextCode("CUR-M", ["CUR-G05", "CUS-M09"])).toBe("CUR-M01");
  });

  it("colisao: nunca devolve codigo ja usado e esgota em 99", () => {
    const used = Array.from({ length: 98 }, (_, i) => `CUR-M${String(i + 1).padStart(2, "0")}`);
    expect(nextCode("CUR-M", used)).toBe("CUR-M99");
    expect(nextCode("CUR-M", [...used, "CUR-M99"])).toBeNull();
  });
});
