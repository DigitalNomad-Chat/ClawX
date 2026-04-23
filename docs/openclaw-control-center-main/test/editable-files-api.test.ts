import assert from "node:assert/strict";
import test from "node:test";
import { ReadonlyToolClient } from "../src/clients/tool-client";
import { startUiServer } from "../src/ui/server";

test("editable file API returns 404 instead of trying to read a directory path", async () => {
  const server = startUiServer(0, new ReadonlyToolClient());
  try {
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
    }
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind ephemeral UI port.");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const directoryPath = process.cwd();

    const response = await fetch(
      `${baseUrl}/api/files/content?scope=workspace&path=${encodeURIComponent(directoryPath)}`,
    );
    assert.equal(response.status, 404);
    const payload = await response.json() as {
      error?: { code?: string; message?: string };
    };
    assert.equal(payload.error?.code, "NOT_FOUND");
    assert.match(payload.error?.message ?? "", /Editable file not found/i);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
});
