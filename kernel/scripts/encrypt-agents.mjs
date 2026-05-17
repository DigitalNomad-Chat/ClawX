/**
 * Agent Configuration Encryption Tool
 * Converts OpenClaw file-based agents into encrypted Agent packages
 * Usage: node scripts/encrypt-agents.mjs <source-dir> <output-dir>
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { createCipheriv } from 'crypto';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ALGORITHM = 'aes-256-gcm';

function deriveKey() {
  const envKey = process.env.CLAWX_KERNEL_KEY;
  if (envKey) {
    return Buffer.from(envKey.padEnd(32, '0').slice(0, 32));
  }
  const machineId = process.env.MACHINE_ID || 'clawx-default-key-32bytes-long';
  return Buffer.from(machineId.padEnd(32, '0').slice(0, 32));
}

function encryptAgentConfig(config, key) {
  const iv = Buffer.from('clawx-kernel'); // 12 bytes — AES-GCM standard IV length
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(config);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    encrypted,
    iv,
    authTag: cipher.getAuthTag(),
  };
}

function parseMarkdown(content) {
  // Extract YAML frontmatter if present
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match) {
    return { frontmatter: match[1], body: match[2].trim() };
  }
  return { frontmatter: null, body: content.trim() };
}

function loadAgentFromDirectory(agentDir) {
  const files = {};
  const fileList = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'TOOLS.md', 'USER.md', 'HEARTBEAT.md'];

  for (const filename of fileList) {
    const filepath = join(agentDir, filename);
    if (existsSync(filepath)) {
      files[filename] = readFileSync(filepath, 'utf8');
    }
  }

  // Parse IDENTITY.md
  const identity = { name: '', nickname: '', emoji: '', creature: '', vibe: '', department: '' };
  if (files['IDENTITY.md']) {
    const lines = files['IDENTITY.md'].split('\n');
    for (const line of lines) {
      const nameMatch = line.match(/^-\s*\*\*Name:\*\*\s*(.+)/);
      if (nameMatch) {
        const parts = nameMatch[1].split('/').map(s => s.trim());
        identity.name = parts[0];
        identity.nickname = parts[1] || parts[0];
      }
      const creatureMatch = line.match(/^-\s*\*\*Creature:\*\*\s*(.+)/);
      if (creatureMatch) identity.creature = creatureMatch[1];
      const vibeMatch = line.match(/^-\s*\*\*Vibe:\*\*\s*(.+)/);
      if (vibeMatch) identity.vibe = vibeMatch[1];
      const emojiMatch = line.match(/^-\s*\*\*Emoji:\*\*\s*(.+)/);
      if (emojiMatch) identity.emoji = emojiMatch[1];
      const deptMatch = line.match(/^-\s*\*\*Department:\*\*\s*(.+)/);
      if (deptMatch) identity.department = deptMatch[1];
    }
  }

  return { identity, files };
}

function main() {
  const sourceDir = process.argv[2] || resolve(fileURLToPath(new URL('../agents-source', import.meta.url)));
  const outputDir = process.argv[3] || resolve(fileURLToPath(new URL('../agents', import.meta.url)));

  const key = deriveKey();

  console.log(`[Encrypt] Source: ${sourceDir}`);
  console.log(`[Encrypt] Output: ${outputDir}`);

  mkdirSync(outputDir, { recursive: true });

  const entries = readdirSync(sourceDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const manifest = { version: '1.0.0', agents: [] };

  for (const agentId of entries) {
    const agentDir = join(sourceDir, agentId);
    console.log(`[Encrypt] Processing ${agentId}...`);

    const { identity, files } = loadAgentFromDirectory(agentDir);

    const config = {
      id: agentId,
      version: '1.0.0',
      identity,
      soul: files['SOUL.md'] || '',
      agents: files['AGENTS.md'] || '',
      tools: files['TOOLS.md'] || '',
      user: files['USER.md'] || undefined,
      heartbeat: files['HEARTBEAT.md'] || undefined,
      maxTurns: 64,
    };

    const pkg = encryptAgentConfig(config, key);

    // Write encrypted package: [iv(12)][authTag(16)][encrypted...]
    const data = Buffer.concat([pkg.iv, pkg.authTag, pkg.encrypted]);
    writeFileSync(join(outputDir, `${agentId}.enc`), data);

    // Build manifest entry
    const description = extractDescription(files['SOUL.md'] || '');
    const tags = extractTags(files['SOUL.md'] || '', files['AGENTS.md'] || '', identity.department);
    const scenarios = extractScenarios(files['SOUL.md'] || '');

    manifest.agents.push({
      id: agentId,
      name: identity.name,
      nickname: identity.nickname,
      emoji: identity.emoji,
      creature: identity.creature,
      vibe: identity.vibe,
      description,
      tags,
      scenarios,
      version: '1.0.0',
      department: identity.department || undefined,
    });

    console.log(`[Encrypt] ✓ ${agentId} encrypted`);
  }

  writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[Encrypt] Manifest written with ${manifest.agents.length} agents`);
}

function extractDescription(soul) {
  const match = soul.match(/## 核心身份[\s\S]*?\*\*我是谁：\*\*\s*(.+)/);
  if (match) return match[1].trim();
  const firstLine = soul.split('\n')[0];
  return firstLine.replace(/^#+\s*/, '').slice(0, 100);
}

const CATEGORY_MAP = {
  engineering: '工程',
  marketing: '营销',
  'paid-media': '营销',
  design: '设计',
  product: '产品',
  'project-management': '产品',
  sales: '商务',
  finance: '商务',
  hr: '商务',
  legal: '商务',
  'supply-chain': '商务',
  support: '运营',
  testing: '运营',
  specialized: '专项',
  academic: '专项',
  'game-development': '创意',
  'spatial-computing': '创意',
};

function extractTags(soul, agents, department) {
  const tags = [];
  // Use department-based category mapping (preferred)
  if (department && CATEGORY_MAP[department]) {
    tags.push(CATEGORY_MAP[department]);
  }
  // Fallback to keyword matching for legacy agents without department
  if (tags.length === 0) {
    if (soul.includes('管理')) tags.push('管理');
    if (soul.includes('创作')) tags.push('创作');
    if (soul.includes('运营')) tags.push('运营');
    if (soul.includes('效率')) tags.push('效率');
    if (soul.includes('文案')) tags.push('文案');
    if (agents.includes('巡检') || soul.includes('巡检')) tags.push('巡检');
  }
  if (tags.length === 0) tags.push('通用');
  return tags;
}

function extractScenarios(soul) {
  const scenarios = [];
  const lines = soul.split('\n');
  for (const line of lines) {
    const match = line.match(/^-\s+\*\*(.+?)：\*\*/);
    if (match) scenarios.push(match[1]);
    if (scenarios.length >= 5) break;
  }
  return scenarios;
}

main();
