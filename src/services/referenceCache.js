// Only a complete cache of this exact published snapshot can skip table reads.
// Legacy caches lack snapshotId and must be refreshed once.
export function matchesReferenceSnapshot(cached, snapshot, tables) {
  return Boolean(snapshot?.id && cached?.syncStatus?.snapshotId === snapshot.id
    && cached.syncStatus.source === 'Studio Cloud'
    && cached.database?.players?.length && cached.database?.fixtures?.length
    && Object.entries(tables).every(([key, table]) =>
      Number.isInteger(snapshot.counts?.[table])
      && Array.isArray(cached.database[key])
      && cached.database[key].length === snapshot.counts[table]))
}
