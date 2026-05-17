/**
 * Agent Configuration Conversion Tool
 * Converts agency-agents-zh single-file .md agents into ClawX multi-file directory structure
 * Usage: node scripts/convert-agency-agents.mjs
 */
import {
  readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── paths ──────────────────────────────────────────────────────────
const SOURCE_DIR = join(__dirname, '../../external/agency-agents-zh');
const OUTPUT_DIR = join(__dirname, '../agents-source');
const CATEGORY_MAP_PATH = join(__dirname, '../agents/category-map.json');

// ── excluded files / dirs ──────────────────────────────────────────
const EXCLUDED_DIRS = new Set([
  '.git', '.github', 'examples', 'strategy', 'integrations', 'scripts',
]);
const EXCLUDED_FILES = new Set([
  'README.md', 'AGENT-LIST.md', 'CATALOG.md',
  'CONTRIBUTING.md', 'LICENSE', 'UPSTREAM.md',
  'README.zh-TW.md', '.gitignore', '.gitattributes',
]);

// ── SOUL section keywords ──────────────────────────────────────────
// headers that go into SOUL.md (identity / personality / rules)
const SOUL_KEYWORDS = [
  '身份', '记忆', '个性', '性格', '沟通风格', '风格',
  '关键规则', '规则', '纪律', '约束',
  'identity', 'memory', 'personality', 'style', 'rules', 'discipline',
];

// ── AGENTS section keywords ────────────────────────────────────────
// headers that go into AGENTS.md (mission / workflow / deliverables)
const AGENTS_KEYWORDS = [
  '核心使命', '使命', '交付物', '工作流程', '流程',
  '技术交付物', '设计系统交付物',
  'mission', 'deliverable', 'workflow', 'process',
];

// ── helpers ────────────────────────────────────────────────────────
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content.trim() };

  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
  return { frontmatter: fm, body: match[2].trim() };
}

function loadCategoryMap() {
  if (!existsSync(CATEGORY_MAP_PATH)) {
    console.warn('[Convert] category-map.json not found, using defaults');
    return {
      departmentMapping: {},
      categories: [],
    };
  }
  return JSON.parse(readFileSync(CATEGORY_MAP_PATH, 'utf8'));
}

function deriveNickname(name) {
  if (!name || typeof name !== 'string') return 'Agent';
  // Try to extract a short nickname (first 2-3 chars + title)
  const clean = name.trim();
  if (clean.length <= 3) return clean;
  // Common patterns: "XX工程师" -> "XX", "XX专家" -> "XX", "XX师" -> "XX"
  const titlePatterns = /(工程师|专家|师|顾问|经理|总监|设计师|开发者|运营|作家)$/;
  const withoutTitle = clean.replace(titlePatterns, '');
  if (withoutTitle.length >= 2 && withoutTitle.length <= 4) return withoutTitle;
  return clean.slice(0, 3);
}

function deriveCreature(description) {
  if (!description) return 'AI 专家';
  // Extract first meaningful phrase before comma/period
  let creature = description.split(/[,，。\.]/)[0].trim();
  // Remove leading articles
  creature = creature.replace(/^(精通|专注|一位|一个|专业)/, '').trim();
  // Limit length
  if (creature.length > 30) creature = creature.slice(0, 30);
  return creature || 'AI 专家';
}

function deriveVibe(body) {
  // Search for personality/vibe descriptions
  const patterns = [
    /[\*\-]\s*个性[：:]\s*(.+)/,
    /[\*\-]\s*性格[：:]\s*(.+)/,
    /[\*\-]\s*沟通风格[：:]\s*(.+)/,
    /[\*\-]\s*风格[：:]\s*(.+)/,
    /个性[：:]\s*(.+)/,
    /性格[：:]\s*(.+)/,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    if (m) return m[1].trim().slice(0, 50);
  }
  return '专业、高效、可靠';
}

function deriveScenarios(body) {
  const scenarios = [];
  // Try to extract from "适用场景" or similar sections
  const sectionMatch = body.match(/##\s*(?:适用场景|应用场景|使用场景|场景)[\s\S]*?(?=## |$)/);
  if (sectionMatch) {
    const lines = sectionMatch[0].split('\n');
    for (const line of lines) {
      const m = line.match(/[\*\-]\s*(.+)/);
      if (m) scenarios.push(m[1].trim());
      if (scenarios.length >= 5) break;
    }
  }
  // Fallback: extract from mission sub-headers
  if (scenarios.length === 0) {
    const missionMatch = body.match(/##\s*(?:核心使命|你的核心使命|使命)[\s\S]*?(?=## (?:关键规则|规则|技术交付物|交付物)|$)/);
    if (missionMatch) {
      const lines = missionMatch[0].split('\n');
      for (const line of lines) {
        const m = line.match(/###\s*(.+)/);
        if (m) scenarios.push(m[1].trim());
        if (scenarios.length >= 5) break;
      }
    }
  }
  return scenarios;
}

function splitContent(body) {
  const lines = body.split('\n');
  const soulSections = [];
  const agentsSections = [];
  let currentSection = null;
  let currentContent = [];

  function flushSection() {
    if (!currentSection) return;
    const text = currentContent.join('\n').trim();
    if (!text) return;
    const lower = currentSection.toLowerCase();
    const isSoul = SOUL_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
    const isAgents = AGENTS_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
    if (isSoul && !isAgents) {
      soulSections.push(`## ${currentSection}\n\n${text}`);
    } else if (isAgents && !isSoul) {
      agentsSections.push(`## ${currentSection}\n\n${text}`);
    } else if (isSoul && isAgents) {
      // ambiguous — put in AGENTS as it's more action-oriented
      agentsSections.push(`## ${currentSection}\n\n${text}`);
    } else {
      // neither matched — default to SOUL for early sections, AGENTS for later
      // Use a heuristic: if section contains "交付" or "workflow" it's agents
      if (lower.includes('交付') || lower.includes('workflow') || lower.includes('模板') || lower.includes('example')) {
        agentsSections.push(`## ${currentSection}\n\n${text}`);
      } else {
        soulSections.push(`## ${currentSection}\n\n${text}`);
      }
    }
  }

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      flushSection();
      currentSection = h1Match[1];
      currentContent = [];
    } else if (h2Match) {
      flushSection();
      currentSection = h2Match[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  flushSection();

  return {
    soul: soulSections.join('\n\n'),
    agents: agentsSections.join('\n\n'),
  };
}

// ── main ───────────────────────────────────────────────────────────
function main() {
  const categoryMap = loadCategoryMap();
  const deptMapping = categoryMap.departmentMapping || {};

  console.log(`[Convert] Source: ${SOURCE_DIR}`);
  console.log(`[Convert] Output: ${OUTPUT_DIR}`);

  if (!existsSync(SOURCE_DIR)) {
    console.error(`[Convert] ERROR: Source directory not found: ${SOURCE_DIR}`);
    console.error('[Convert] Please run: git clone https://github.com/jnMetaCode/agency-agents-zh.git external/agency-agents-zh');
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Recursively collect all .md files
  const mdFiles = [];
  function collect(dir, relPath = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        collect(join(dir, entry.name), rel);
      } else if (entry.name.endsWith('.md') && !EXCLUDED_FILES.has(entry.name)) {
        mdFiles.push({ path: join(dir, entry.name), rel, name: entry.name });
      }
    }
  }
  collect(SOURCE_DIR);

  console.log(`[Convert] Found ${mdFiles.length} agent files`);

  let success = 0;
  let failed = 0;

  for (const { path: filePath, rel, name } of mdFiles) {
    const agentId = name.replace(/\.md$/, '');
    const department = rel.split('/')[0];
    const category = deptMapping[department] || '通用';

    try {
      const raw = readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(raw);

      const nameValue = frontmatter.name || agentId;
      const description = frontmatter.description || '';
      const emoji = frontmatter.emoji || '🤖';

      const nickname = deriveNickname(nameValue);
      const creature = deriveCreature(description);
      const vibe = deriveVibe(body);
      const scenarios = deriveScenarios(body);
      const tags = [category];

      const { soul, agents } = splitContent(body);

      // Build SOUL.md
      const soulMd = `# ${nameValue}\n\n${description}\n\n${soul}`.trim();

      // Build AGENTS.md with session rules boilerplate
      const agentsMd = `# ${nameValue} - 会话规则\n\n你是 **${nameValue}**，${description}\n\n${agents}`.trim();

      // Build IDENTITY.md
      const identityMd = [
        `- **Name:** ${nameValue}/${nickname}`,
        `- **Nickname:** ${nickname}`,
        `- **Emoji:** ${emoji}`,
        `- **Creature:** ${creature}`,
        `- **Vibe:** ${vibe}`,
        `- **Department:** ${department}`,
      ].join('\n');

      // Write output
      const agentDir = join(OUTPUT_DIR, agentId);
      mkdirSync(agentDir, { recursive: true });

      writeFileSync(join(agentDir, 'IDENTITY.md'), identityMd, 'utf8');
      writeFileSync(join(agentDir, 'SOUL.md'), soulMd, 'utf8');
      writeFileSync(join(agentDir, 'AGENTS.md'), agentsMd, 'utf8');

      success++;
      if (success % 50 === 0) {
        console.log(`[Convert] ${success} agents converted...`);
      }
    } catch (err) {
      console.error(`[Convert] ✗ Failed to convert ${rel}: ${err.message}`);
      failed++;
    }
  }

  console.log(`[Convert] Done: ${success} succeeded, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
