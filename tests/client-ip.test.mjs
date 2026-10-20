// The client IP is the key of every public rate limit (quotes, captcha, chat).
// x-real-ip is set by Caddy from the TCP peer and cannot be chosen by the visitor;
// the left-most x-forwarded-for entry can be prepended by the client.
import test from "node:test";
import assert from "node:assert/strict";
import { clientIpFromHeaders } from "../lib/security/rateLimit.js";

const H = (o) => new Headers(o);

test("x-real-ip wins over a spoofed x-forwarded-for", () => {
  const ip = clientIpFromHeaders(H({ "x-forwarded-for": "6.6.6.6, 203.0.113.9", "x-real-ip": "203.0.113.9" }));
  assert.equal(ip, "203.0.113.9");
});

test("rotating the spoofed x-forwarded-for does not change the key", () => {
  const a = clientIpFromHeaders(H({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "198.51.100.7" }));
  const b = clientIpFromHeaders(H({ "x-forwarded-for": "2.2.2.2", "x-real-ip": "198.51.100.7" }));
  assert.equal(a, b);
});

test("falls back to the left-most x-forwarded-for entry when there is no x-real-ip", () => {
  assert.equal(clientIpFromHeaders(H({ "x-forwarded-for": " 192.0.2.5 , 10.0.0.1" })), "192.0.2.5");
});

test("trims values and ignores a blank x-real-ip", () => {
  assert.equal(clientIpFromHeaders(H({ "x-real-ip": "  203.0.113.1 " })), "203.0.113.1");
  assert.equal(clientIpFromHeaders(H({ "x-real-ip": "   ", "x-forwarded-for": "192.0.2.77" })), "192.0.2.77");
});

test("unknown when no proxy header is present or the headers object is broken", () => {
  assert.equal(clientIpFromHeaders(H({})), "unknown");
  assert.equal(clientIpFromHeaders(null), "unknown");
});
