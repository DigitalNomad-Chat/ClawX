/**
 * Skill Loader - Scans and loads SKILL.md files from the skills directory
 *
 * Skill structure:
 *   kernel/skills/{skill-id}/SKILL.md
 *
 * SKILL.md frontmatter:
 *   ---
 *   name: skill-id
 *   description: What this skill does...
 *   category: writing | design | coding | research | media
 *   ---
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string; // Full SKILL.md content (without frontmatter)
}

const DEFAULT_CATEGORIES = ['writing', 'design', 'coding', 'research', 'media', 'productivity'];

function parseFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  const lines = match[1].split('\n');
  const frontmatter: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2].trim() };
}

export function scanSkills(skillsDir: string): SkillEntry[] {
  const skills: SkillEntry[] = [];

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = join(skillsDir, entry.name, 'SKILL.md');
      try {
        statSync(skillPath);
      } catch {
        continue;
      }

      const raw = readFileSync(skillPath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(raw);

      const category = frontmatter.category || 'general';
      const name = frontmatter.name || entry.name;
      const description = frontmatter.description || '';

      skills.push({
        id: entry.name,
        name,
        description,
        category,
        content: body,
      });
    }
  } catch (err) {
    console.error(`[SkillLoader] Failed to scan skills dir: ${(err as Error).message}`);
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export class SkillRegistry {
  private skills = new Map<string, SkillEntry>();
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    this.reload();
  }

  reload(): void {
    this.skills.clear();
    const list = scanSkills(this.skillsDir);
    for (const skill of list) {
      this.skills.set(skill.id, skill);
    }
    console.log(`[SkillRegistry] Loaded ${list.length} skills from ${this.skillsDir}`);
  }

  list(): SkillEntry[] {
    return Array.from(this.skills.values());
  }

  get(id: string): SkillEntry | undefined {
    return this.skills.get(id);
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  getByCategory(category: string): SkillEntry[] {
    return this.list().filter((s) => s.category === category);
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const skill of this.skills.values()) {
      cats.add(skill.category);
    }
    return Array.from(cats).sort();
  }
}
