# Contributing to Helix

Thanks for wanting to contribute! Helix is built in the open and contributions are what make it better.

---

## Before You Start

- Check [open issues](https://github.com/gourav-shokeen/helix/issues) before starting work
- For big features, open an issue first to discuss — avoids wasted effort
- For bugs, a clear reproduction steps + screenshot goes a long way

---

## Local Setup

```bash
git clone https://github.com/gourav-shokeen/helix
cd helix
npm install
cp .env.example .env.local
# Fill in your own Supabase, Groq, Gemini keys
npm run dev
```

For real-time collab to work locally, also run the WebSocket server:

```bash
cd ws-server
node index.mjs
```

---

## Branch Naming

```
feat/your-feature-name
fix/bug-description
chore/what-you-did
docs/what-you-documented
```

---

## PR Rules

- One thing per PR — don't bundle unrelated changes
- Keep PRs small and reviewable
- Write a clear description of what changed and why
- If it's a UI change, include a screenshot
- Make sure `npm run lint` passes before opening a PR

---

## Code Style

- TypeScript everywhere (no `any` unless unavoidable)
- Tailwind for styling — no inline styles
- Components go in `/components`, hooks in `/hooks`, utils in `/lib`
- Keep components focused — one responsibility per file

---

## What To Work On

Good first issues are tagged [`good first issue`](https://github.com/gourav-shokeen/helix/labels/good%20first%20issue).

Areas where help is always welcome:
- Bug fixes
- Performance improvements
- Documentation
- Supabase migration scripts
- Mobile responsiveness
- Tests

---

## Questions

Open a [GitHub Discussion](https://github.com/gourav-shokeen/helix/discussions) — not an issue — for questions or ideas.
