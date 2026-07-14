# sunset-lan — 3D island portfolio

A personal portfolio that plays like a small game: a low-poly island at golden hour,
explored as a third-person avatar. Currently **Phase 1**: walkable gray box with one
interactable placeholder.

See [CLAUDE.md](CLAUDE.md) for the full project brief, art direction, and phase plan.

## Develop

```sh
npm install
npm run dev          # local dev server
npm run dev -- --host  # expose on LAN to test on a phone
npm run build        # typecheck + production build
```

## Stack

Vite · React 19 · TypeScript (strict) · three.js via @react-three/fiber ·
@react-three/rapier (physics) · ecctrl (character controller) · zustand · Tailwind CSS

## Deploy

Pushed to GitHub, auto-deployed on Vercel from `main`.
