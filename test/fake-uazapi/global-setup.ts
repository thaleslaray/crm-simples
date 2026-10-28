import type { TestProject } from "vitest/node";
import { startFakeUazapi } from "./server";

declare module "vitest" {
  export interface ProvidedContext {
    fakeUazapiUrl: string;
  }
}

/** Sobe a Uazapi falsa uma vez por execucao do vitest e expoe a URL ao config do pool (via inject). */
export default async function setup(project: TestProject) {
  const fake = await startFakeUazapi();
  project.provide("fakeUazapiUrl", fake.url);
  return () => fake.close();
}
