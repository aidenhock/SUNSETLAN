import { contact } from '../../content/contact'
import { ModalShell } from './ModalShell'

export function ContactModal() {
  return (
    <ModalShell title="Contact">
      <p className="leading-relaxed">
        The mailbox works. Send a note and I'll write back.
      </p>
      <p className="mt-4">
        <a
          href={`mailto:${contact.email}`}
          className="inline-block touch-manipulation rounded-lg bg-lagoon px-4 py-2 font-display font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater"
        >
          Email me
        </a>
      </p>
      <ul className="mt-4 space-y-2">
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
