# UI Beautification Design — NiceAI Style Theme Overlay

**Date:** 2026-04-26
**Status:** Approved
**Approach:** CSS Override Layer + Minimal Wrapper Components (Option B)

---

## 1. Background

ClawX is a fork of [ValueCell-ai/ClawX](https://github.com/ValueCell-ai/ClawX) that tracks upstream via `upstream` remote. The upstream project frequently updates UI components (recent commits heavily modify Chat and navigation), making direct component-level modifications risky for merge compatibility.

The current UI uses default shadcn/ui styling with minimal visual identity. This design introduces a NiceAI-inspired visual layer that:

- Maintains upstream merge compatibility
- Uses CSS-first approach with minimal component changes
- Provides a toggleable theme (`.theme-niceai` class)
- Covers both light and dark modes

## 2. Design Goals

1. **NiceAI-style color palette** — Blue primary (`#165DFF`) with radial gradient decorations
2. **Frosted glass (glassmorphism) cards** — Semi-transparent, blurred background cards
3. **Enhanced sidebar** — Blue highlight for active items, NiceAI-style session cards
4. **Dark mode parity** — Synchronized dark theme with NiceAI's deep-black palette
5. **Upstream compatibility** — CSS-level changes only; minimal component file edits

## 3. Color System

### 3.1 Light Mode CSS Variables

| Variable | Current Value | New Value | Notes |
|----------|--------------|-----------|-------|
| `--background` | `45 36.4% 91.4%` (warm) | `210 20% 97%` → `#F5F7FA` | Cool white-gray |
| `--foreground` | `222.2 84% 4.9%` | `225 30% 8%` | Slightly cooler |
| `--primary` | `221.2 83.2% 53.3%` | `221 100% 55%` → `#165DFF` | NiceAI primary |
| `--primary-foreground` | `210 40% 98%` | `0 0% 100%` | Pure white |
| `--card` | `0 0% 100%` | `0 0% 100%` | Unchanged |
| `--muted` | `210 40% 96.1%` | `210 30% 95%` | Cooler gray |
| `--border` | `214.3 31.8% 91.4%` | `215 20% 90%` | Softer border |

### 3.2 Dark Mode CSS Variables

| Variable | Current Value | New Value | Notes |
|----------|--------------|-----------|-------|
| `--background` | `240 4% 11%` | `240 6% 5%` → `#0C0B10` | NiceAI deep black |
| `--card` | `240 3% 14%` | `240 3% 12%` → `#1C1D29` | NiceAI card color |
| `--secondary` | `240 3% 18%` | `240 3% 15%` | Darker secondary |
| `--border` | `240 3% 24%` | `240 3% 18%` | Softer dark border |
| `--accent` | `240 3% 22%` | `240 3% 18%` | More subtle accent |

### 3.3 Radial Gradient Background

Light mode content area:
```css
.theme-niceai main {
  background:
    radial-gradient(circle at 12% 55%, rgba(22, 93, 255, 0.06), transparent 25%),
    radial-gradient(circle at 85% 33%, rgba(108, 99, 255, 0.05), transparent 25%),
    hsl(var(--background));
}
```

Dark mode:
```css
.dark.theme-niceai main {
  background:
    radial-gradient(circle at 12% 55%, rgba(33,150,243,0.08), transparent 25%),
    radial-gradient(circle at 85% 33%, rgba(108,99,255,0.08), transparent 25%),
    hsl(var(--background));
}
```

## 4. Frosted Glass Cards

### 4.1 CSS Definition

```css
/* Light */
.glass-card {
  background: linear-gradient(0deg, rgba(255,255,255,0.9), rgba(243,245,248,0.8));
  border: 1px solid rgba(255,255,255,0.6);
  box-shadow: 0 4px 16px rgba(55, 99, 170, 0.08);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  transition: box-shadow 0.3s, transform 0.2s;
}
.glass-card:hover {
  box-shadow: 0 8px 24px rgba(55, 99, 170, 0.12);
  transform: translateY(-1px);
}

/* Dark */
.dark .glass-card {
  background: linear-gradient(135deg, rgba(44,44,44,0.9), rgba(24,24,24,0.9));
  border: 1px solid rgba(63,63,63,0.5);
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
}
```

### 4.2 Auto-application to shadcn Cards

shadcn `<Card>` renders as `<div class="rounded-lg border bg-card ...">` without `data-slot`. Two approaches combined:

**A) CSS class-based matching** — targets existing shadcn Card classes:
```css
.theme-niceai .bg-card.rounded-lg.border {
  background: linear-gradient(0deg, rgba(255,255,255,0.95), rgba(248,250,252,0.9)) !important;
  border: 1px solid rgba(255,255,255,0.6) !important;
  box-shadow: 0 4px 16px rgba(55, 99, 170, 0.08) !important;
  border-radius: 12px !important;
}
.dark .theme-niceai .bg-card.rounded-lg.border {
  background: linear-gradient(135deg, rgba(44,44,44,0.9), rgba(24,24,24,0.9)) !important;
  border: 1px solid rgba(63,63,63,0.5) !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2) !important;
}
```

**B) Manual `.glass-card` class** — for non-Card elements that need the effect (e.g. custom panels, welcome screen). Uses the same visual style but includes hover animation not applied to auto-matched cards.

> Note: `!important` is required because Tailwind utilities (`@layer utilities`) would otherwise override custom CSS due to specificity rules.

## 5. Sidebar Enhancement

### 5.1 Strategy

Add data attributes to existing `Sidebar.tsx` elements for CSS targeting. Changes span approximately 10-15 lines across:

- `NavItem` component: add `data-nav-item` and `data-active={isActive}` to the `<NavLink>` wrapper
- Settings NavLink (footer): add `data-nav-item` and `data-active={isActive}`
- Session list items: add `data-session-item` and `data-active` based on `currentSessionKey === s.key`
- "New Chat" button: add `data-nav-item`

No structural DOM changes — only attribute additions to existing elements.

### 5.2 Sidebar Background

The current sidebar uses hardcoded `bg-[#eae8e1]/60` (warm tone). Override via CSS:

```css
.theme-niceai aside[data-testid="sidebar"] {
  background: #FFFFFF !important;
  border-right-color: #F0F0F0 !important;
}
.dark .theme-niceai aside[data-testid="sidebar"] {
  background: #202329 !important;
}
```

This avoids modifying the Tailwind class in `Sidebar.tsx` — the `!important` CSS override handles it.

### 5.3 Navigation Item Styling

Active state — NiceAI left-radial-gradient highlight:
```css
.theme-niceai [data-nav-item][data-active="true"] {
  background: radial-gradient(circle at left, rgba(22,93,255,0.12) 0%, transparent 100%);
  color: #165DFF;
  font-weight: 600;
}
```

Hover state:
```css
.theme-niceai [data-nav-item]:hover {
  background: rgba(22, 93, 255, 0.05);
}
```

### 5.4 Session Card Styling

Active session card:
```css
.theme-niceai [data-session-item][data-active="true"] {
  background: radial-gradient(circle at left, rgba(22,93,255,0.15) 0%, rgba(255,255,255,0.95) 100%);
  border: 1px solid rgba(22,93,255,0.2);
  border-radius: 12px;
}
```

## 6. Tailwind Config Extensions

```js
// tailwind.config.js additions
theme: {
  extend: {
    colors: {
      niceai: {
        primary: '#165DFF',
        'primary-light': '#409EFF',
        'bg-light': '#F5F7FA',
        'bg-dark': '#0C0B10',
        'card-dark': '#1C1D29',
      },
    },
    boxShadow: {
      glass: '0 4px 16px rgba(55, 99, 170, 0.08)',
      'glass-hover': '0 8px 24px rgba(55, 99, 170, 0.12)',
      'glass-dark': '0 4px 16px rgba(0, 0, 0, 0.2)',
    },
    borderRadius: {
      glass: '12px',
    },
  },
},
```

## 7. File Changes Summary

| File | Change Type | Merge Risk | Description |
|------|------------|------------|-------------|
| `src/styles/globals.css` | Modify | Medium | Rewrite CSS variables for both themes |
| `src/styles/theme-niceai.css` | **New** | None | Independent theme override stylesheet |
| `tailwind.config.js` | Modify | Low | Extend theme with NiceAI colors/shadows |
| `src/components/layout/Sidebar.tsx` | Minor | Medium | Add data-attributes to NavItem, Settings nav, session list (~10-15 lines) |
| `src/components/layout/MainLayout.tsx` | Minor | Low | Add `.theme-niceai` class conditionally |
| `src/main.tsx` | Minor | Low | Import `theme-niceai.css` |
| `src/stores/settings.ts` | Minor | Low | Add `niceaiTheme: boolean` state |

## 7.1 Theme Toggle Mechanism

**Storage:** Add `niceaiTheme` boolean to `useSettingsStore` (Zustand with `electron-store` persistence).

**Application:** In `MainLayout.tsx`, conditionally add the `.theme-niceai` class:

```tsx
const niceaiTheme = useSettingsStore((s) => s.niceaiTheme);
// ...
<div className={cn('flex h-screen flex-col overflow-hidden bg-background', niceaiTheme && 'theme-niceai')}>
```

**Dark mode compatibility:** The project uses `darkMode: ['class']` in Tailwind. The `dark` class is applied to `<html>` by the theme system. Since `.theme-niceai` is on the layout root `<div>` (child of `<html>`), CSS selectors use descendant combinators: `.dark .theme-niceai` (not `.dark.theme-niceai`).

**Default:** `niceaiTheme` defaults to `true` for new installations. Existing users keep their current state via `electron-store` persistence.

**Settings UI:** A toggle switch in Settings > General to enable/disable the NiceAI theme. (Can be implemented as a follow-up task if needed.)

## 8. Upstream Merge Compatibility

### Low-risk items (no conflict expected):
- New files: `theme-niceai.css`
- Tailwind config extensions (additive)
- `main.tsx` import addition

### Medium-risk items (easy manual resolution):
- `globals.css` — CSS variable values differ, but resolution is straightforward (choose which palette)
- `Sidebar.tsx` — only data-attribute additions, easily re-applied after upstream changes
- `MainLayout.tsx` — single class addition, trivial to merge

### Theme toggle:
All beautification styles are scoped under `.theme-niceai` class, allowing users to revert to original styling via settings.

## 9. Implementation Order

1. Create `theme-niceai.css` with all visual overrides
2. Update `globals.css` CSS variables
3. Extend `tailwind.config.js`
4. Add data-attributes to `Sidebar.tsx`
5. Add `.theme-niceai` to `MainLayout.tsx`
6. Import in `main.tsx`
7. Test light and dark modes across all pages
8. Verify upstream merge compatibility with dry-run

## 10. Accessibility

- All `.glass-card:hover` transforms respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  .glass-card:hover { transform: none; }
}
```
- Gradient backgrounds maintain sufficient contrast ratios (WCAG AA minimum)
- No `backdrop-filter` usage on text-bearing elements (cards only)

## 11. CSS Layer Strategy

`theme-niceai.css` uses `@layer components` to ensure proper specificity:

```css
@layer components {
  .theme-niceai .bg-card.rounded-lg.border { ... }
  .theme-niceai [data-nav-item][data-active="true"] { ... }
}
```

Where Tailwind utilities must be overridden, `!important` is used explicitly with a comment explaining why.

## 12. Acceptance Criteria

- [ ] All pages display NiceAI-inspired color scheme
- [ ] Cards show frosted glass effect in both light and dark modes
- [ ] Sidebar navigation items show blue gradient highlight when active
- [ ] Session list items show NiceAI-style active state
- [ ] Dark mode is fully synchronized with new palette
- [ ] Content area has subtle radial gradient background
- [ ] No changes to component logic or state management
- [ ] Theme toggle works via `useSettingsStore.niceaiTheme`
- [ ] `prefers-reduced-motion` disables hover transforms
- [ ] CSS增量 gzip 后 < 5KB
- [ ] 无新增 TypeScript 编译错误
- [ ] `git merge --no-commit --no-ff upstream/main` succeeds with at most manual CSS conflict resolution
