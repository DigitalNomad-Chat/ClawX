import { app, utilityProcess } from 'electron';
import path from 'path';
import { existsSync } from 'fs';
import { getOpenClawDir, getOpenClawEntryPath } from './paths';
import { getUvMirrorEnv } from './uv-env';
import { prependPathEntry } from './env-path';
import { logger } from './logger';

export interface DoctorResult {
  success: boolean;
  exitCode: number;
}

async function forkOpenClawDoctor(args: string[]): Promise<DoctorResult> {
  const openclawDir = getOpenClawDir();
  const entryScript = getOpenClawEntryPath();
  if (!existsSync(entryScript)) {
    logger.error(`Cannot run OpenClaw doctor: entry script not found at ${entryScript}`);
    return { success: false, exitCode: -1 };
  }

  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(process.cwd(), 'resources', 'bin', target);
  const binPathExists = existsSync(binPath);
  const baseProcessEnv = process.env as Record<string, string | undefined>;
  const baseEnvPatched = binPathExists
    ? prependPathEntry(baseProcessEnv, binPath).env
    : baseProcessEnv;

  const uvEnv = await getUvMirrorEnv();
  logger.info(
    `Running OpenClaw doctor (entry="${entryScript}", args="${args.join(' ')}", cwd="${openclawDir}", bundledBin=${binPathExists ? 'yes' : 'no'})`,
  );

  return await new Promise<DoctorResult>((resolve) => {
    const forkEnv: Record<string, string | undefined> = {
      ...baseEnvPatched,
      ...uvEnv,
      OPENCLAW_NO_RESPAWN: '1',
    };

    const child = utilityProcess.fork(entryScript, args, {
      cwd: openclawDir,
      stdio: 'pipe',
      env: forkEnv as NodeJS.ProcessEnv,
    });

    let settled = false;
    const finish = (result: DoctorResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timeout = setTimeout(() => {
      logger.error(`OpenClaw doctor timed out after 120000ms (args=${args.join(' ')})`);
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish({ success: false, exitCode: -1 });
    }, 120000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      logger.error('Failed to spawn OpenClaw doctor process:', err);
      finish({ success: false, exitCode: -1 });
    });

    child.stdout?.on('data', (data) => {
      const raw = data.toString();
      for (const line of raw.split(/\r?\n/)) {
        const normalized = line.trim();
        if (!normalized) continue;
        logger.debug(`[OpenClaw doctor stdout] ${normalized}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const raw = data.toString();
      for (const line of raw.split(/\r?\n/)) {
        const normalized = line.trim();
        if (!normalized) continue;
        logger.warn(`[OpenClaw doctor stderr] ${normalized}`);
      }
    });

    child.on('exit', (code: number) => {
      clearTimeout(timeout);
      const success = code === 0;
      if (success) {
        logger.info(`OpenClaw doctor exited successfully (args=${args.join(' ')})`);
      } else {
        logger.warn(`OpenClaw doctor exited (args=${args.join(' ')}, code=${code})`);
      }
      finish({ success, exitCode: code });
    });
  });
}

export async function runOpenClawDoctor(): Promise<DoctorResult> {
  return forkOpenClawDoctor(['doctor', '--non-interactive']);
}

export async function runOpenClawDoctorFix(): Promise<DoctorResult> {
  return forkOpenClawDoctor(['doctor', '--fix', '--yes', '--non-interactive']);
}
