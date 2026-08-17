import data from '../../docs/build-log.json'

/**
 * The build log as content: docs/build-log.md is the source of truth
 * (see the standing documentation step), exported to JSON by
 * scripts/export-build-log.mjs with REAL code excerpts captured at
 * build time. The Matrix room renders these chapters in-world; the
 * /classic Build log section mirrors them (mirror rule).
 */

export interface BuildLogExcerpt {
  symbol: string
  line: number
  code: string
}

export interface BuildLogFile {
  path: string
  symbols: string[]
  excerpts: BuildLogExcerpt[]
}

export interface BuildLogChapter {
  id: string
  /** Implementation step: this chapter's position in the build log. */
  step: number
  title: string
  hook: string
  plain: string
  technical: string
  files: BuildLogFile[]
  decisions: string[]
}

export const buildLogChapters: BuildLogChapter[] = data.chapters
