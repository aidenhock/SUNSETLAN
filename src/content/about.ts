export interface CardContent {
  title: string
  body: string[]
}

export const about: CardContent = {
  title: "Hey, I'm Aiden",
  body: [
    'Data analyst / developer — Python, SQL, ETL, Flask, and some React.',
    'This island is the gray-box version of my portfolio. Real props, photos, projects, and music are on the way.',
  ],
}

/** Lookup used by CardModal. Add new card-style content here. */
export const cards: Record<string, CardContent> = {
  about,
}
