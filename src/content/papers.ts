export interface Paper {
  id: string
  title: string
  blurb: string
  /** Public path (files live in public/, e.g. '/aiden-hock-resume.pdf'). */
  file: string
  type: 'pdf'
}

/**
 * Documents pinned to the bulletin board (and mirrored on /classic).
 * NOTE: /aiden-hock-resume.pdf is currently a PLACEHOLDER — the real
 * resume's header contains a phone number, which must not ship
 * (CLAUDE.md privacy rule). Aiden: strip the phone from the docx (or
 * approve shipping it), then the converted PDF in staging/ replaces
 * the placeholder.
 */
export const papers: Paper[] = [
  {
    id: 'resume',
    title: 'Resume',
    blurb: 'Education, skills, and experience — one page.',
    file: '/aiden-hock-resume.pdf',
    type: 'pdf',
  },
]
