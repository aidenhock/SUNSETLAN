// Parses docs/build-log.md (the Matrix room's content source) into
// docs/build-log.json. The format is strict on purpose — this script
// fails loudly on a malformed chapter, doubling as the format check.
// Run after every edit: node scripts/export-build-log.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'


/** ~14 lines of real source starting at the symbol's definition-ish
 * line (falls back to first mention). Null when the file/symbol is
 * missing — the verify step catches that separately. */
function excerptFor(path, symbol) {
  let src
  try {
    src = readFileSync(resolve(path), 'utf8')
  } catch {
    return null
  }
  const lines = src.split('\n')
  const defRe = new RegExp(`(function|const|let|class|interface|type)\\s+${symbol}\\b|${symbol}\\s*[=(:]`)
  let at = lines.findIndex((l) => defRe.test(l))
  if (at < 0) at = lines.findIndex((l) => l.includes(symbol))
  if (at < 0) return null
  const code = lines.slice(at, at + 14).join('\n')
  return { symbol, line: at + 1, code }
}

const src = readFileSync(resolve('docs/build-log.md'), 'utf8')
const chapterBlocks = src.split(/^## /m).slice(1)
if (chapterBlocks.length === 0) throw new Error('no chapters found')

const REQUIRED = ['hook', 'plain', 'technical', 'files', 'decisions']
const chapters = chapterBlocks.map((block) => {
  const [headingLine, ...rest] = block.split('\n')
  const heading = headingLine.trim()
  const idMatch = heading.match(/\{#([a-z0-9-]+)\}\s*$/)
  if (!idMatch) throw new Error(`chapter missing {#id}: "${heading}"`)
  const id = idMatch[1]
  const title = heading
    .replace(/\{#[a-z0-9-]+\}\s*$/, '')
    .replace(/^\d+\s*·\s*/, '')
    .trim()
  const body = rest.join('\n')

  const section = (name) => {
    const label = name[0].toUpperCase() + name.slice(1)
    const re = new RegExp(`\\*\\*${label}:\\*\\*([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|$)`)
    const m = body.match(re)
    if (!m) throw new Error(`chapter "${id}" missing **${label}:** section`)
    return m[1].trim()
  }

  const filesRaw = section('files')
  const files = [...filesRaw.matchAll(/^- `([^`]+)`\s*—\s*(.+)$/gm)].map(([, path, symbolsRaw]) => {
    const symbols = [...symbolsRaw.matchAll(/`([^`]+)`/g)].map(([, s]) => s)
    return {
      path,
      symbols,
      // REAL code excerpts captured at export time (the Matrix room
      // renders these — never hand-copied prose about code).
      excerpts: symbols.map((sym) => excerptFor(path, sym)).filter(Boolean),
      note: symbolsRaw.replace(/`[^`]+`,?\s*/g, '').trim() || undefined,
    }
  })
  if (files.length === 0) throw new Error(`chapter "${id}" has no parseable Files lines`)

  const decisions = [...section('decisions').matchAll(/^- ([\s\S]*?)(?=\n- |$)/gm)].map(([, d]) =>
    d.replace(/\n\s+/g, ' ').trim(),
  )
  if (decisions.length === 0) throw new Error(`chapter "${id}" has no Decisions bullets`)

  for (const r of REQUIRED) section(r) // presence check for all five

  return {
    id,
    title,
    hook: section('hook'),
    plain: section('plain').replace(/\n(?!\n)/g, ' ').replace(/\n\n/g, '\n'),
    technical: section('technical').replace(/\n(?!\n)/g, ' ').replace(/\n\n/g, '\n'),
    files,
    decisions,
  }
})

const ids = new Set(chapters.map((c) => c.id))
if (ids.size !== chapters.length) throw new Error('duplicate chapter ids')

writeFileSync(
  resolve('docs/build-log.json'),
  JSON.stringify({ chapters }, null, 2) + '\n',
)
console.log(`exported ${chapters.length} chapters -> docs/build-log.json`)
for (const c of chapters) console.log(`  ${c.id}: ${c.files.length} files, ${c.decisions.length} decisions`)
