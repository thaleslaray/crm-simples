// Grava um corpo HTTP no R2 sem carregar o arquivo inteiro na memoria.

const PART_SIZE = 5 * 1024 * 1024; // minimo do R2 para partes de um upload multipart (exceto a ultima)

/**
 * Com `content-length` o R2 recebe o stream direto (FixedLengthStream). Sem ele (resposta chunked), usa upload
 * multipart: guarda no maximo uma parte de 5 MiB por vez. Devolve o tamanho gravado.
 */
export async function streamToR2(bucket: R2Bucket, key: string, res: Response, contentType: string | null): Promise<number> {
  const options = { httpMetadata: contentType ? { contentType } : undefined };
  const length = Number(res.headers.get("content-length"));
  if (Number.isInteger(length) && length > 0 && res.headers.get("content-length") !== null) {
    const fixed = new FixedLengthStream(length);
    const copy = res.body!.pipeTo(fixed.writable);
    const [stored] = await Promise.all([bucket.put(key, fixed.readable, options), copy]);
    return stored.size;
  }

  const upload = await bucket.createMultipartUpload(key, options);
  try {
    const parts: R2UploadedPart[] = [];
    let buffer = new Uint8Array(PART_SIZE);
    let filled = 0;
    let size = 0;
    const flush = async () => {
      parts.push(await upload.uploadPart(parts.length + 1, buffer.slice(0, filled)));
      size += filled;
      filled = 0;
    };
    const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let offset = 0;
      while (offset < value.length) {
        const n = Math.min(PART_SIZE - filled, value.length - offset);
        buffer.set(value.subarray(offset, offset + n), filled);
        filled += n;
        offset += n;
        if (filled === PART_SIZE) await flush();
      }
    }
    if (filled > 0 || parts.length === 0) await flush();
    await upload.complete(parts);
    return size;
  } catch (err) {
    await upload.abort().catch(() => {});
    throw err;
  }
}
