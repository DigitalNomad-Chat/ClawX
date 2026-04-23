import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import {
  AVATAR_PREFERENCES_PATH,
  defaultAvatarPreferences,
  loadAvatarPreferences,
  saveAvatarPreferences,
} from "../src/runtime/avatar-preferences";

test("missing avatar preferences use defaults without first-run warnings", async () => {
  const original = await readMaybe(AVATAR_PREFERENCES_PATH);

  try {
    await rm(AVATAR_PREFERENCES_PATH, { force: true });

    const loaded = await loadAvatarPreferences();
    assert.deepEqual(loaded.preferences.agents, {});
    assert.equal(loaded.preferences.version, 1);
    assert.deepEqual(loaded.issues, []);
  } finally {
    if (original === undefined) {
      await rm(AVATAR_PREFERENCES_PATH, { force: true });
    } else {
      await writeFile(AVATAR_PREFERENCES_PATH, original, "utf8");
    }
  }
});

test("avatar preferences still persist after save and reload", async () => {
  const original = await readMaybe(AVATAR_PREFERENCES_PATH);

  try {
    await saveAvatarPreferences({
      ...defaultAvatarPreferences(),
      agents: {
        main: {
          mode: "pixel",
          animal: "panda",
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const loaded = await loadAvatarPreferences();
    assert.equal(loaded.preferences.agents.main?.mode, "pixel");
    assert.equal(loaded.preferences.agents.main?.animal, "panda");
  } finally {
    if (original === undefined) {
      await rm(AVATAR_PREFERENCES_PATH, { force: true });
    } else {
      await writeFile(AVATAR_PREFERENCES_PATH, original, "utf8");
    }
  }
});

async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}
