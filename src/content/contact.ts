export interface Contact {
  email: string
  links: { label: string; url: string }[]
}

export const contact: Contact = {
  email: 'aiden.hock@gmail.com',
  links: [{ label: 'GitHub', url: 'https://github.com/aidenhock' }],
}
