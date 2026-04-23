import { mkdtemp, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const TEST_OPENCLAW_JSON = JSON.stringify({
  agents: {
    list: [
      { id: "main", name: "Main coordinator" },
      { id: "pandas", name: "pandas" },
      { id: "monkey", name: "monkey" },
      { id: "coq", name: "Coq-每日新闻" },
      { id: "otter", name: "Otter" },
      { id: "tiger", name: "Tiger" },
    ],
  },
});

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const testArgs = process.argv.slice(2);
  const targets = testArgs.length > 0 ? testArgs : await collectTestFiles(resolve(repoRoot, "test"));
  const runtimeDir = await mkdtemp(join(tmpdir(), "openclaw-control-center-test-"));

  try {
    const testOpenClawHome = join(runtimeDir, ".openclaw");
    await mkdir(testOpenClawHome, { recursive: true });
    await writeFile(join(testOpenClawHome, "openclaw.json"), TEST_OPENCLAW_JSON, "utf8");

    const exitCode = await runNodeTests(targets, runtimeDir, join(testOpenClawHome, "openclaw.json"));
    process.exitCode = exitCode;
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
}

async function collectTestFiles(rootDir: string): Promise<string[]> {
  const output: string[] = [];
  await walk(rootDir, output);
  return output.sort();
}

async function walk(dir: string, output: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, output);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      output.push(fullPath);
    }
  }
}

function runNodeTests(targets: string[], runtimeDir: string, openclawConfigPath: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "--test-concurrency=1", ...targets],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OPENCLAW_RUNTIME_DIR: runtimeDir,
          OPENCLAW_CONFIG_PATH: openclawConfigPath,
        },
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

void main();
