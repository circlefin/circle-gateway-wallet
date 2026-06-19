import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { checkSignature } from "./verify-signature.ts";

const SECRET = "test-signing-key";

function sign(body: Buffer, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

describe("checkSignature", () => {
  it("accepts a valid signature", () => {
    const body = Buffer.from('{"event":"test"}');
    assert.equal(checkSignature(body, SECRET, sign(body)), true);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const body = Buffer.from('{"event":"test"}');
    assert.equal(checkSignature(body, SECRET, sign(body, "wrong-secret")), false);
  });

  it("rejects a signature when the body has been tampered", () => {
    const body = Buffer.from('{"event":"test"}');
    const tamperedBody = Buffer.from('{"event":"tampered"}');
    assert.equal(checkSignature(tamperedBody, SECRET, sign(body)), false);
  });

  it("rejects a hex-encoded signature", () => {
    const body = Buffer.from('{"event":"test"}');
    const hexSig = createHmac("sha256", SECRET).update(body).digest("hex");
    assert.equal(checkSignature(body, SECRET, hexSig), false);
  });

  it("rejects an empty signature header", () => {
    const body = Buffer.from('{"event":"test"}');
    assert.equal(checkSignature(body, SECRET, ""), false);
  });
});
