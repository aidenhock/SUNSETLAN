export interface Photo {
  id: string
  /** Web-sized image (longest edge ~1800 px, WebP via the pipeline). */
  full: string
  /** Grid thumbnail (~480 px, cover-cropped by the tile). */
  thumb: string
  /** Intrinsic dimensions of `full` — layout never guesses ratios. */
  width: number
  height: number
  alt: string
  title: string
  caption?: string
}

/*
 * REAL PHOTOS — READY TO PASTE (Phase 4 gallery).
 * The 13 attached originals never landed on disk (only in chat), so:
 *   1. Drop the originals into staging/photos/ — name each file with
 *      the slug below (e.g. la-skyline-hollywood-trail.png).
 *   2. Run: node scripts/optimize-images.mjs
 *   3. Replace the placeholder array below with the printed imports +
 *      entries, then merge in this drafted copy (edit freely):
 *
 * la-skyline-hollywood-trail — title "LA from the Hollywood sign trail"
 *   alt "The Los Angeles skyline rising out of golden haze, seen from a
 *        hillside trail under a dark band of cloud"
 * sun-breaks-over-la — title "The sun breaks through"
 *   alt "A brilliant sun bursting through heavy cloud above the hazy LA
 *        basin, hills silhouetted below"
 * sunset-watchers — title "Sunset watchers"
 *   alt "People silhouetted against an orange sky at a hilltop
 *        overlook, framed by a tree and a palm"
 * trail-crowd-sunset — title "Golden hour on the ridge"
 *   alt "Hikers silhouetted on a ridgeline as the sun flares through
 *        clouds over the hazy city far below"
 * signal-hill-dusk — title "Signal Hill after sundown"
 *   alt "City lights coming on under a deep orange dusk horizon"
 * long-beach-bridge — title "The bridge at dusk"
 *   alt "The cable-stayed bridge at the Port of Long Beach silhouetted
 *        against a pink-orange dusk, harbor cranes and city lights below"
 * long-beach-panorama — title "Dusk over Long Beach"
 *   alt "A wide violet-to-orange dusk panorama with a jet contrail
 *        overhead and city lights below"
 * tower-and-lake — title "Dusk tower"
 *   alt "A radio tower silhouetted against an orange-to-blue dusk
 *        gradient, a distant lake mirroring the last light"
 * idyllwild-contrails — title "Idyllwild sky"
 *   alt "Crisscrossing contrails over mountain silhouettes, the low sun
 *        flaring at the ridgeline"
 * anza-sunset — title "Anza sunset"
 *   alt "Fiery orange clouds streaking over dark desert mountains,
 *        boulders and brush in the foreground"
 * sunset-through-trees — title "Sunset through the trees"
 *   alt "A molten orange sky and backlit clouds behind bare winter
 *        trees"
 * the-370z — title "The 370Z"
 *   alt "A silver Nissan 370Z on a mountain pullout, a hand shading the
 *        lens from the sun flaring over the roofline"
 * work-truck-golden-hour — title "Golden hour haul"
 *   alt "A white Chevy pickup towing a trailer on a desert road,
 *        backlit by a blazing afternoon sun"
 * the-moon — title "The moon"
 *   alt "A near-full moon filling the frame, craters sharp against a
 *        black sky"
 * motorcycle-vista — title "The overlook"
 *   alt "A motorcyclist rounding a stone-walled mountain overlook under
 *        heavy evening clouds"
 * pigeon-on-wires — title "The pigeon"
 *   alt "A dove perched dead-center on crossing power lines against a
 *        soft blue sky"
 * cat-in-snow — title "Snow cat"
 *   alt "A fluffy grey cat standing in patchy snow by a white rail
 *        fence, looking straight at the camera"
 *
 * (Drafted from the attached set — more slugs than the quoted count of
 * 13 because the attachment thread showed more frames; keep whichever
 * you stage.)
 */

/** Placeholder SVGs in the island palette until the real WebP photos land. */
const placeholder = (a: string, b: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="${a}"/><circle cx="1250" cy="230" r="150" fill="#FFB870"/><path d="M0 700 Q400 560 800 660 T1600 640 V1000 H0 Z" fill="${b}"/><text x="60" y="120" font-family="system-ui" font-size="64" fill="#14262B" opacity="0.55">${label}</text></svg>`,
  )}`

const ph = (a: string, b: string, label: string, alt: string, title: string): Photo => ({
  id: label.toLowerCase().replace(/\s+/g, '-'),
  full: placeholder(a, b, label),
  thumb: placeholder(a, b, label),
  width: 1600,
  height: 1000,
  alt,
  title,
})

export const photos: Photo[] = [
  ph('#E8D5A3', '#35A7A0', 'Placeholder 01', 'Placeholder: sand and lagoon gradient with a setting sun', 'Golden hour placeholder'),
  ph('#FFB870', '#1D6E73', 'Placeholder 02', 'Placeholder: sunset over deep water', 'Deep water placeholder'),
  ph('#35A7A0', '#14262B', 'Placeholder 03', 'Placeholder: lagoon fading to ink', 'Night swim placeholder'),
  ph('#55A05F', '#E8D5A3', 'Placeholder 04', 'Placeholder: palm green over sand', 'Palm grove placeholder'),
  ph('#1D6E73', '#FFB870', 'Placeholder 05', 'Placeholder: dusk sky over water', 'Dusk placeholder'),
  ph('#E8D5A3', '#55A05F', 'Placeholder 06', 'Placeholder: dunes meeting grass', 'Dunes placeholder'),
  ph('#FFB870', '#35A7A0', 'Placeholder 07', 'Placeholder: sun over the lagoon', 'Lagoon placeholder'),
  ph('#14262B', '#1D6E73', 'Placeholder 08', 'Placeholder: ink sky over deep water', 'Midnight placeholder'),
  ph('#55A05F', '#1D6E73', 'Placeholder 09', 'Placeholder: grass meeting deep water', 'Shoreline placeholder'),
  ph('#E8D5A3', '#FFB870', 'Placeholder 10', 'Placeholder: sand under a warm sky', 'Warm sand placeholder'),
  ph('#1D6E73', '#55A05F', 'Placeholder 11', 'Placeholder: deep water meeting grass', 'Cove placeholder'),
  ph('#35A7A0', '#FFB870', 'Placeholder 12', 'Placeholder: lagoon under a warm sky', 'Warm lagoon placeholder'),
  ph('#14262B', '#E8D5A3', 'Placeholder 13', 'Placeholder: ink sky over sand', 'Night beach placeholder'),
]
