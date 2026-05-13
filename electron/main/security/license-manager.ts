import { app } from 'electron';
const Store = require('electron-store').default;
import crypto from 'crypto';
import path from 'path';

let LicenseVerifier: any;
try {
  const nativeModule = require(path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'native',
    'build',
    'Release',
    'license.node'
  ));
  LicenseVerifier = nativeModule.LicenseVerifier;
} catch (e) {
  try {
    const nativeModule = require(path.join(app.getAppPath(), '..', '..', 'native', 'build', 'Release', 'license.node'));
    LicenseVerifier = nativeModule.LicenseVerifier;
  } catch (devErr) {
    console.warn('Native license module not found, running in dev mode without license check');
    LicenseVerifier = null;
  }
}

// Binary payload schema (20 bytes, parsed by C++ native module):
// Byte 0:     version (uint8) = 0x01
// Byte 1-2:   product_id (uint16 BE) = 0x0001
// Byte 3:     edition (uint8) = 0x01 standard, 0x02 pro, 0x03 enterprise
// Byte 4-7:   expiry_days (uint32 BE, days since 2024-01-01, 0 = perpetual)
// Byte 8-15:  machine_fingerprint (8 bytes, first 8 bytes of SHA256 masterFp)
// Byte 16-19: serial (uint32 BE, random nonce)
// License format: <payload_base58>.<signature_base58> (~115 chars)
interface LicensePayload {
  _binarySchema: string; // documentation only; payload parsed in C++
}

function deriveStorageKey(machineFingerprint: string): string {
  const salt = 'ClawX-Fixed-Salt-v1';
  return crypto.pbkdf2Sync(machineFingerprint + salt, salt, 100000, 32, 'sha256').toString('hex');
}

class LicenseManager {
  private store: Store;
  private verifier: any;
  private cachedFingerprint: any = null;

  constructor() {
    this.initStore();
    if (LicenseVerifier) {
      this.verifier = new LicenseVerifier();
    }
  }

  private initStore() {
    const fingerprint = this.getMachineFingerprint();
    const encryptionKey = deriveStorageKey(fingerprint.fingerprint);

    this.store = new Store({
      name: 'license',
      encryptionKey,
    });
  }

  getMachineFingerprint(): { fingerprint: string; displayCode: string; factors: Record<string, string> } {
    if (this.cachedFingerprint) return this.cachedFingerprint;

    if (!this.verifier) {
      return {
        fingerprint: 'dev-mode-fingerprint',
        displayCode: 'DEV-MODE-XXXX',
        factors: {},
      };
    }

    this.cachedFingerprint = this.verifier.getMachineFingerprint();
    return this.cachedFingerprint;
  }

  getMachineFactors(): Record<string, string> {
    return this.getMachineFingerprint().factors;
  }

  activateLicense(licenseString: string): { success: boolean; reason?: string } {
    if (!this.verifier) {
      return { success: true };
    }

    const machine = this.getMachineFingerprint();

    try {
      const isValid = this.verifier.verify(licenseString, machine.factors);
      if (!isValid) {
        return { success: false, reason: 'INVALID_LICENSE' };
      }

      this.store.set('license', licenseString);
      this.store.set('activated_at', Date.now());
      this.store.set('last_check', Date.now());

      return { success: true };
    } catch (err: any) {
      return { success: false, reason: err.message || 'VERIFICATION_ERROR' };
    }
  }

  checkLicense(): { valid: boolean; reason?: string; machineCode?: string } {
    if (!this.verifier) {
      return { valid: true };
    }

    const license = this.store.get('license') as string | undefined;
    if (!license) {
      return { valid: false, reason: 'NO_LICENSE', machineCode: this.getMachineFingerprint().displayCode };
    }

    const machine = this.getMachineFingerprint();

    try {
      const isValid = this.verifier.verify(license, machine.factors);
      if (!isValid) {
        return { valid: false, reason: 'LICENSE_INVALID', machineCode: machine.displayCode };
      }

      this.store.set('last_check', Date.now());
      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: err.message || 'CHECK_ERROR', machineCode: machine.displayCode };
    }
  }

  clearLicense(): void {
    this.store.clear();
  }
}

export const licenseManager = new LicenseManager();
