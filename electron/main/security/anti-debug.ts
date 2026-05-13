import { app } from 'electron';

export function initAntiDebug() {
  // 时间差检测 debugger
  setInterval(() => {
    const start = Date.now();
    let dummy = 0;
    for (let i = 0; i < 1000000; i++) dummy++;
    const elapsed = Date.now() - start;

    if (elapsed > 1000) {
      console.error('Security violation: debugger detected');
      app.quit();
    }
  }, 3000);

  // Windows: 检测可疑进程
  if (process.platform === 'win32') {
    checkSuspiciousProcesses();
    setInterval(checkSuspiciousProcesses, 5000);
  }
}

function checkSuspiciousProcesses() {
  if (process.platform !== 'win32') return;

  try {
    const { execSync } = require('child_process');
    const processes = execSync('tasklist /FO CSV').toString().toLowerCase();
    const suspicious = [
      'x64dbg', 'cheatengine', 'frida',
      'dnspy', 'ilspy', 'processhacker',
    ];

    for (const name of suspicious) {
      if (processes.includes(name)) {
        console.error(`Security violation: suspicious process ${name} detected`);
        app.quit();
      }
    }
  } catch (e) {
    // ignore
  }
}
