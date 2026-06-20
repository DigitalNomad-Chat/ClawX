# Upgrade openclaw 5.19 baseline

> Snapshot taken before applying upstream #1063 changes.  
> Date: 2026-06-20

- Worktree: `/Users/a1-6/办公/GitHub/ClawX/.claude/worktrees/upgrade-openclaw-5-19`
- Branch: `worktree-upgrade-openclaw-5-19`
- Pre-upgrade HEAD: `57ebdf63` (branch point before Task 1 commit)
- Post-Task-1 HEAD: `d7da4975`
- Baseline: `pnpm vitest run tests/unit/`
  - 3 failed / 1005 passed / 1 skipped
  - Failures limited to `tests/unit/title-bar.test.tsx` and `tests/unit/main-layout.test.tsx` (pre-existing, unrelated)
- Note on version strategy: upstream #1063 intentionally bumps `@larksuite/openclaw-lark` to `2026.5.13` and `@wecom/wecom-openclaw-plugin` to `^2026.5.14`; only `@openclaw/discord/qqbot/whatsapp` and `openclaw` itself go to `2026.5.19`.
