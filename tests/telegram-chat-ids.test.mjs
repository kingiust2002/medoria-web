// Helper that finds the Telegram group ids: pure parsing + it must never print the token.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractChats, readToken } from "../scripts/telegram-chat-ids.mjs";

const run = promisify(execFile);
const TOKEN = "123456789:AAH-testtoken_testtoken_testtoken_1234";

test("extractChats finds groups from messages and from 'bot was added' events, once each", () => {
  const chats = extractChats([
    { update_id: 1, my_chat_member: { chat: { id: -1001111111111, type: "supergroup", title: "Medoria Health Inquiries" } } },
    { update_id: 2, message: { chat: { id: -1001111111111, type: "supergroup", title: "Medoria Health Inquiries" }, text: "/start" } },
    { update_id: 3, message: { chat: { id: -1002222222222, type: "group", title: "Medoria Beauty Inquiries" } } },
    { update_id: 4, message: { chat: { id: 555, type: "private", first_name: "Sam", last_name: "K" } } },
    { update_id: 5, poll: {} },
  ]);
  assert.deepEqual(chats.map((c) => c.id), ["-1001111111111", "-1002222222222", "555"]);
  assert.equal(chats[0].title, "Medoria Health Inquiries");
  assert.equal(chats[2].title, "Sam K");
  assert.deepEqual(extractChats(undefined), []);
});

test("readToken reads the shared bot token from an env file, quotes removed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgenv-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, `A=1\nTELEGRAM_BOT_TOKEN="${TOKEN}"\nTELEGRAM_CHAT_ID_HEALTH=-100\n`);
  try {
    assert.equal(readToken(file, {}), TOKEN);
    assert.equal(readToken(path.join(dir, "missing"), { TELEGRAM_BOT_TOKEN: ` ${TOKEN} ` }), TOKEN);
    assert.equal(readToken(undefined, {}), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("without a token the command exits 2 and prints no secret", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgenv-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, "SOMETHING=else\n");
  try {
    await assert.rejects(
      () => run(process.execPath, ["scripts/telegram-chat-ids.mjs", file], { env: { PATH: process.env.PATH } }),
      (err) => err.code === 2 && /No TELEGRAM_BOT_TOKEN found/.test(err.stderr) && !err.stderr.includes("AAH")
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
