// Lint mecanico da regra de testes: teste exercita so comportamento externo.
// Em test/**/*.test.ts (nao em test/helpers nem test/setup.ts) proibe SQL direto no D1 e import de db/drizzle.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REGRAS: { re: RegExp; motivo: string }[] = [
  { re: /\.prepare\(/, motivo: "consulta SQL direta ao D1 (.prepare); mova o arrange para test/helpers" },
  { re: /sqlite_master/, motivo: "inspecao do formato de tabelas (sqlite_master)" },
  { re: /(from\s+|import\s*\(\s*|import\s+)["'][^"']*src\/worker\/db[^"']*["']/, motivo: "import de src/worker/db" },
  { re: /(from\s+|import\s*\(\s*|import\s+|require\(\s*)["']drizzle-orm[^"']*["']/, motivo: "import de drizzle-orm" },
];

function* arquivos(dir: string): Generator<string> {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome !== "helpers") yield* arquivos(caminho);
    } else if (nome.endsWith(".test.ts")) yield caminho;
  }
}

let erros = 0;
for (const arquivo of arquivos("test")) {
  readFileSync(arquivo, "utf8").split("\n").forEach((linha, i) => {
    for (const { re, motivo } of REGRAS) {
      if (re.test(linha)) {
        console.error(`${arquivo}:${i + 1}: ${motivo}`);
        erros++;
      }
    }
  });
}
if (erros > 0) {
  console.error(`\nlint:tests falhou com ${erros} violacao(oes).`);
  process.exit(1);
}
console.log("lint:tests ok");
