export interface Photo {
  src: string
  alt: string
  caption?: string
  location?: string
}

/** Placeholder SVGs in the island palette until real WebP photos land (phase 4). */
const placeholder = (a: string, b: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="${a}"/><circle cx="1250" cy="230" r="150" fill="#FFB870"/><path d="M0 700 Q400 560 800 660 T1600 640 V1000 H0 Z" fill="${b}"/><text x="60" y="120" font-family="system-ui" font-size="64" fill="#14262B" opacity="0.55">${label}</text></svg>`,
  )}`

export const photos: Photo[] = [
  { src: placeholder('#E8D5A3', '#35A7A0', 'Placeholder 01'), alt: 'Placeholder: sand and lagoon gradient with a setting sun', caption: 'Golden hour placeholder', location: 'The island' },
  { src: placeholder('#FFB870', '#1D6E73', 'Placeholder 02'), alt: 'Placeholder: sunset over deep water', caption: 'Deep water placeholder' },
  { src: placeholder('#35A7A0', '#14262B', 'Placeholder 03'), alt: 'Placeholder: lagoon fading to ink', caption: 'Night swim placeholder' },
  { src: placeholder('#55A05F', '#E8D5A3', 'Placeholder 04'), alt: 'Placeholder: palm green over sand', caption: 'Palm grove placeholder' },
  { src: placeholder('#1D6E73', '#FFB870', 'Placeholder 05'), alt: 'Placeholder: dusk sky over water', caption: 'Dusk placeholder' },
  { src: placeholder('#E8D5A3', '#55A05F', 'Placeholder 06'), alt: 'Placeholder: dunes meeting grass', caption: 'Dunes placeholder' },
]
