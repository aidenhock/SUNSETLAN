# sunset-lan — 3D planet portfolio

A personal portfolio that plays like a small game: a tiny low-poly planet at
golden hour. The avatar stands at the top of the sphere and never moves —
running rotates the whole planet underfoot (the Mario Galaxy illusion).
Currently **Phase 2**: planet blockout, all six interactables, every modal
type, and the `/classic` fallback.

See [CLAUDE.md](CLAUDE.md) for the full project brief, art direction, and phase plan.

## Develop

```sh
npm install
npm run dev            # local dev server
npm run dev -- --host  # expose on LAN to test on a phone
npm test               # vitest — planet quaternion math
npm run build          # typecheck + production build
```

## How the planet works

All movement rotates `<group>` quaternion in [Planet.tsx](src/scene/Planet.tsx);
the math lives in [planetMath.ts](src/controls/planetMath.ts) (unit-tested).
Triggers and prop blockers compare angular distance to the pole. The avatar
raycasts down for terrain height. No physics engine.

## Stack

Vite · React 19 · TypeScript (strict) · three.js via @react-three/fiber ·
zustand · Tailwind CSS · vitest. No physics engine (removed with the planet pivot).

## Deploy

Pushed to GitHub, auto-deployed on Vercel from `main`. `/classic` is a
code-split no-WebGL fallback rendered from the same content files.
