const playerImages = import.meta.glob(
  ['../assets/Players/*.{png,jpg,jpeg,webp}', '!../assets/Players/20260288.webp'],
  {
    eager: true,
    import: 'default',
  },
)

export function getPlayerImage(fileName) {
  if (!fileName) {
    return null
  }

  const normalizedFileName =
    String(fileName)
      .trim()
      .toLowerCase()

  if (normalizedFileName === '20260288.webp') return playerImages['../assets/Players/placeholder.png']

  const matchingPath =
    Object.keys(playerImages).find(
      (path) =>
        path
          .toLowerCase()
          .endsWith(
            `/${normalizedFileName}`,
          ),
    )

  return matchingPath
    ? playerImages[matchingPath]
    : null
}
