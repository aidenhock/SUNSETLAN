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

// Aiden's photos (owner-provided; originals live in staging/photos/,
// processed by scripts/optimize-images.mjs). Array order is the
// gallery order — curated as: the LA arc, then skies, then wheels &
// friends.

import anzaSunsetFull from '../assets/photos/anza-sunset.webp'
import anzaSunsetThumb from '../assets/photos/anza-sunset.thumb.webp'
import chevyTruckFull from '../assets/photos/chevy-truck.webp'
import chevyTruckThumb from '../assets/photos/chevy-truck.thumb.webp'
import idyllwild370zFull from '../assets/photos/idyllwild-370z.webp'
import idyllwild370zThumb from '../assets/photos/idyllwild-370z.thumb.webp'
import idyllwildSunsetFull from '../assets/photos/idyllwild-sunset.webp'
import idyllwildSunsetThumb from '../assets/photos/idyllwild-sunset.thumb.webp'
import laAngelsHwSignFull from '../assets/photos/la-angels-hw-sign.webp'
import laAngelsHwSignThumb from '../assets/photos/la-angels-hw-sign.thumb.webp'
import laBridgeDeHollywoodSignFull from '../assets/photos/la-bridge-de-hollywood-sign.webp'
import laBridgeDeHollywoodSignThumb from '../assets/photos/la-bridge-de-hollywood-sign.thumb.webp'
import laHollywoodSignPeopleOnCliffFull from '../assets/photos/la-hollywood-sign-people-on-cliff.webp'
import laHollywoodSignPeopleOnCliffThumb from '../assets/photos/la-hollywood-sign-people-on-cliff.thumb.webp'
import laSunsetDeHollywoodSignP2Full from '../assets/photos/la-sunset-de-hollywood-sign-p2.webp'
import laSunsetDeHollywoodSignP2Thumb from '../assets/photos/la-sunset-de-hollywood-sign-p2.thumb.webp'
import moonshotFull from '../assets/photos/moonshot.webp'
import moonshotThumb from '../assets/photos/moonshot.thumb.webp'
import motorcycleVistaPointFull from '../assets/photos/motorcycle-vista-point.webp'
import motorcycleVistaPointThumb from '../assets/photos/motorcycle-vista-point.thumb.webp'
import pigeonFull from '../assets/photos/pigeon.webp'
import pigeonThumb from '../assets/photos/pigeon.thumb.webp'
import signalHillMusicFull from '../assets/photos/signal-hill-music.webp'
import signalHillMusicThumb from '../assets/photos/signal-hill-music.thumb.webp'
import signalHillSunsetFull from '../assets/photos/signal-hill-sunset.webp'
import signalHillSunsetThumb from '../assets/photos/signal-hill-sunset.thumb.webp'
import sunriseIdyllwildFull from '../assets/photos/sunrise-idyllwild.webp'
import sunriseIdyllwildThumb from '../assets/photos/sunrise-idyllwild.thumb.webp'
import sunsetAndLaFull from '../assets/photos/sunset-and-la.webp'
import sunsetAndLaThumb from '../assets/photos/sunset-and-la.thumb.webp'
import sunsetFull from '../assets/photos/sunset.webp'
import sunsetThumb from '../assets/photos/sunset.thumb.webp'
import vendettoOnASnowyDayFull from '../assets/photos/vendetto-on-a-snowy-day.webp'
import vendettoOnASnowyDayThumb from '../assets/photos/vendetto-on-a-snowy-day.thumb.webp'

export const photos: Photo[] = [
  // — The LA arc —
  {
    id: 'la-angels-hw-sign',
    full: laAngelsHwSignFull,
    thumb: laAngelsHwSignThumb,
    width: 1440,
    height: 1080,
    alt: 'The Los Angeles skyline rising out of golden haze, seen from a hillside on the Hollywood sign trail',
    title: 'LA from the trail',
    caption: 'Hollywood sign trail, golden hour',
  },
  {
    id: 'la-hollywood-sign-people-on-cliff',
    full: laHollywoodSignPeopleOnCliffFull,
    thumb: laHollywoodSignPeopleOnCliffThumb,
    width: 1440,
    height: 1080,
    alt: 'Hikers silhouetted on a ridgeline as the sun flares over the hazy city far below',
    title: 'Golden hour on the ridge',
    caption: 'Everyone stops for this one',
  },
  {
    id: 'sunset-and-la',
    full: sunsetAndLaFull,
    thumb: sunsetAndLaThumb,
    width: 1440,
    height: 1080,
    alt: 'A brilliant sun bursting through a dark band of cloud above the hazy LA basin, hills silhouetted below',
    title: 'The sun breaks through',
  },
  {
    id: 'la-sunset-de-hollywood-sign-p2',
    full: laSunsetDeHollywoodSignP2Full,
    thumb: laSunsetDeHollywoodSignP2Thumb,
    width: 1440,
    height: 1080,
    alt: 'City lights coming on across the basin under a deep orange-to-violet dusk',
    title: 'City lights at dusk',
    caption: 'The walk back down',
  },
  {
    id: 'signal-hill-sunset',
    full: signalHillSunsetFull,
    thumb: signalHillSunsetThumb,
    width: 1800,
    height: 1013,
    alt: 'A wide violet-to-orange dusk panorama over Long Beach, a jet contrail overhead and city lights below',
    title: 'Dusk over Long Beach',
    caption: 'From Signal Hill',
  },
  {
    id: 'la-bridge-de-hollywood-sign',
    full: laBridgeDeHollywoodSignFull,
    thumb: laBridgeDeHollywoodSignThumb,
    width: 1440,
    height: 1080,
    alt: 'The cable-stayed bridge at the Port of Long Beach silhouetted against a peach dusk, harbor cranes and city lights below',
    title: 'The bridge at dusk',
  },
  // — Skies —
  {
    id: 'signal-hill-music',
    full: signalHillMusicFull,
    thumb: signalHillMusicThumb,
    width: 1440,
    height: 1080,
    alt: 'People silhouetted against an orange sky at a hilltop overlook, one playing guitar, framed by a tree and a palm',
    title: 'Music at the overlook',
    caption: 'Signal Hill, somebody brought a guitar',
  },
  {
    id: 'anza-sunset',
    full: anzaSunsetFull,
    thumb: anzaSunsetThumb,
    width: 1440,
    height: 1080,
    alt: 'A molten orange sky and backlit clouds behind bare winter trees',
    title: 'Anza sunset',
  },
  {
    id: 'sunset',
    full: sunsetFull,
    thumb: sunsetThumb,
    width: 1440,
    height: 1080,
    alt: 'Fiery orange clouds streaking over dark desert mountains, boulders and brush in the foreground',
    title: 'Fire in the sky',
  },
  {
    id: 'idyllwild-sunset',
    full: idyllwildSunsetFull,
    thumb: idyllwildSunsetThumb,
    width: 1440,
    height: 1080,
    alt: 'A radio tower silhouetted against an orange-to-blue dusk, a distant lake mirroring the last light',
    title: 'The tower and the lake',
    caption: 'Idyllwild, looking down at Lake Hemet',
  },
  {
    id: 'sunrise-idyllwild',
    full: sunriseIdyllwildFull,
    thumb: sunriseIdyllwildThumb,
    width: 1800,
    height: 1013,
    alt: 'Crisscrossing contrails over mountain silhouettes, the low sun flaring at the ridgeline',
    title: 'Idyllwild sunrise',
  },
  {
    id: 'moonshot',
    full: moonshotFull,
    thumb: moonshotThumb,
    width: 1800,
    height: 1013,
    alt: 'A near-full moon filling the frame, craters sharp against a black sky',
    title: 'The moon',
    caption: 'Full zoom, steady hands',
  },
  // — Wheels & friends —
  {
    id: 'idyllwild-370z',
    full: idyllwild370zFull,
    thumb: idyllwild370zThumb,
    width: 1440,
    height: 1080,
    alt: 'A silver Nissan 370Z on a mountain pullout, a hand shading the lens from the sun flaring over the roofline',
    title: 'The 370Z',
    caption: 'Idyllwild run',
  },
  {
    id: 'chevy-truck',
    full: chevyTruckFull,
    thumb: chevyTruckThumb,
    width: 1440,
    height: 1080,
    alt: 'A white Chevy pickup towing a trailer on a desert road, backlit by a blazing afternoon sun',
    title: 'Golden hour haul',
  },
  {
    id: 'motorcycle-vista-point',
    full: motorcycleVistaPointFull,
    thumb: motorcycleVistaPointThumb,
    width: 1440,
    height: 1080,
    alt: 'A motorcyclist rounding a stone-walled mountain overlook under heavy evening clouds',
    title: 'Vista point',
  },
  {
    id: 'pigeon',
    full: pigeonFull,
    thumb: pigeonThumb,
    width: 1440,
    height: 1080,
    alt: 'A dove perched dead-center on crossing power lines against a soft blue sky',
    title: 'The pigeon',
  },
  {
    id: 'vendetto-on-a-snowy-day',
    full: vendettoOnASnowyDayFull,
    thumb: vendettoOnASnowyDayThumb,
    width: 1800,
    height: 1013,
    alt: 'A fluffy grey cat standing in patchy snow by a white rail fence, looking straight at the camera',
    title: 'Vendetto in the snow',
  },
]
