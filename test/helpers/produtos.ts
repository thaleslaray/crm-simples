import { api, postJson } from "./api";

// Produtos pela API, como o front faz.

export interface ProductView {
  id: string;
  name: string;
  priceCents: number;
  archivedAt: number | null;
}

const json = (cookie: string, method: string, path: string, body: unknown) =>
  api(path, { method, cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const createProduct = (cookie: string, body: unknown) => postJson("/api/products", body, { cookie });

/** Cria e devolve o produto (arrange de teste feito pelo admin). */
export async function newProduct(adminCookie: string, name: string, priceCents = 99700): Promise<ProductView> {
  const res = await createProduct(adminCookie, { name, priceCents });
  return ((await res.json()) as { product: ProductView }).product;
}

export async function listProducts(cookie: string, all = false): Promise<ProductView[]> {
  const res = await api(`/api/products${all ? "?todos=1" : ""}`, { cookie });
  return ((await res.json()) as { products: ProductView[] }).products;
}

export const updateProduct = (cookie: string, id: string, body: Record<string, unknown>) => json(cookie, "PATCH", `/api/products/${id}`, body);
