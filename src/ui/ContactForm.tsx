import { useId, useState } from 'react'
import { contact } from '../content/contact'

/**
 * The Formspree contact form — SHARED between the mailbox modal and
 * /classic (mirror rule: every content surface in the world exists on
 * the classic page too; one component means they can never drift).
 * Plain fetch, idle → sending → sent/failed states, client-side
 * validation gating Send, hidden _gotcha honeypot dropped silently,
 * and a disabled-with-explanation render when the endpoint env is
 * unset. See CLAUDE.md's stack notes.
 */

const ENDPOINT: string | undefined = import.meta.env.VITE_FORMSPREE_ENDPOINT

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SendStatus = 'idle' | 'sending' | 'sent' | 'failed'

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [gotcha, setGotcha] = useState('')
  const [status, setStatus] = useState<SendStatus>('idle')
  const [touched, setTouched] = useState({ name: false, email: false, message: false })
  const uid = useId()
  const id = (f: string) => `${uid}-${f}`

  const configured = Boolean(ENDPOINT)
  const errors = {
    name: name.trim() ? null : 'Please add your name.',
    email: EMAIL_RE.test(email) ? null : 'That email does not look right.',
    message: message.trim() ? null : 'Write me a note first.',
  }
  const valid = !errors.name && !errors.email && !errors.message
  const locked = !configured || status === 'sending' || status === 'sent'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ENDPOINT || !valid || status === 'sending' || status === 'sent') return
    // Honeypot: humans never see the field; a filled value is a bot.
    // Drop silently — pretend success so the bot moves along.
    if (gotcha) {
      setStatus('sent')
      return
    }
    setStatus('sending')
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })
      setStatus(res.ok ? 'sent' : 'failed')
    } catch {
      setStatus('failed')
    }
  }

  const field =
    'w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink placeholder:text-ink/40 focus-visible:outline-2 focus-visible:outline-deepwater disabled:opacity-50'
  const errText = 'mt-1 text-sm font-semibold text-[#b4432f]'

  return (
    <>
    {!configured && (
      <p role="status" className="mt-3 rounded-lg bg-sand/60 px-3 py-2 text-sm leading-relaxed">
        This build has no contact endpoint configured (`VITE_FORMSPREE_ENDPOINT`), so the form is
        off — email me directly below instead.
      </p>
    )}

    <form onSubmit={submit} noValidate className="mt-4 space-y-3">
      <div>
        <label htmlFor={id('name')} className="mb-1 block font-display text-sm font-semibold">
          Name
        </label>
        <input
          id={id('name')}
          name="name"
          type="text"
          autoComplete="name"
          disabled={locked}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          aria-invalid={touched.name && !!errors.name}
          aria-describedby={touched.name && errors.name ? id('name-err') : undefined}
          className={field}
        />
        {touched.name && errors.name && (
          <p id={id('name-err')} role="alert" className={errText}>
            {errors.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={id('email')} className="mb-1 block font-display text-sm font-semibold">
          Email
        </label>
        <input
          id={id('email')}
          name="email"
          type="email"
          autoComplete="email"
          disabled={locked}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          aria-invalid={touched.email && !!errors.email}
          aria-describedby={touched.email && errors.email ? id('email-err') : undefined}
          className={field}
        />
        {touched.email && errors.email && (
          <p id={id('email-err')} role="alert" className={errText}>
            {errors.email}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={id('message')} className="mb-1 block font-display text-sm font-semibold">
          Message
        </label>
        <textarea
          id={id('message')}
          name="message"
          rows={4}
          disabled={locked}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, message: true }))}
          aria-invalid={touched.message && !!errors.message}
          aria-describedby={touched.message && errors.message ? id('message-err') : undefined}
          className={field}
        />
        {touched.message && errors.message && (
          <p id={id('message-err')} role="alert" className={errText}>
            {errors.message}
          </p>
        )}
      </div>

      {/* Honeypot — visually removed, skipped by tab order and screen
          readers; bots autofill it and get silently dropped. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={id('gotcha')}>Leave this field empty</label>
        <input
          id={id('gotcha')}
          name="_gotcha"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={gotcha}
          onChange={(e) => setGotcha(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={locked || !valid}
          className="touch-manipulation rounded-lg bg-lagoon px-4 py-2 font-display font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deepwater disabled:opacity-40"
        >
          {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : 'Send'}
        </button>
        <p role="status" aria-live="polite" className="text-sm leading-snug">
          {status === 'sent' && "Message sent — I'll get back to you."}
          {status === 'failed' && (
            <>
              That didn't send. You can email me directly at{' '}
              <a href={`mailto:${contact.email}`} className="font-semibold text-deepwater underline">
                {contact.email}
              </a>
              .
            </>
          )}
        </p>
      </div>
    </form>
    </>
  )
}
