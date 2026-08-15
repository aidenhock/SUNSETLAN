import { contact } from '../../content/contact'
import { ContactForm } from '../ContactForm'
import { ModalShell } from './ModalShell'

/** The mailbox: shared ContactForm (also rendered on /classic — the
 * mirror rule) plus the mailto/social fallback path. */
export function ContactModal() {
  return (
    <ModalShell title="Contact">
      <p className="leading-relaxed">The mailbox works. Send a note and I'll write back.</p>
      <ContactForm />
      <p className="mt-5 border-t border-ink/10 pt-4">
        <a
          href={`mailto:${contact.email}`}
          className="inline-block touch-manipulation rounded-lg bg-lagoon/20 px-4 py-2 font-display font-semibold text-deepwater focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
        >
          Or email me
        </a>
      </p>
      <ul className="mt-3 space-y-2">
        {contact.links.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-deepwater underline focus-visible:outline-2 focus-visible:outline-deepwater"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </ModalShell>
  )
}
