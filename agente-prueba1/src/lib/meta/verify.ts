import crypto from "node:crypto";
export function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice(7); const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  if (!/^[a-f0-9]+$/i.test(provided) || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}
