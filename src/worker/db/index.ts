import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** Drizzle sobre o binding D1. Criado por requisicao (o binding so existe dentro do handler). */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
export type Db = ReturnType<typeof createDb>;
export { schema };
