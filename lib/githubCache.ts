// lib/githubCache.ts — Simple in-memory TTL cache for GitHub API responses
// Prevents hitting GitHub rate-limits on repeated calls within a server process.

const cache = new Map<string, { value: unknown; expires: number }>()

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) { cache.delete(key); return null }
  return entry.value as T
}

export function setCached(key: string, value: unknown, ttlMs = 5 * 60 * 1000): void {
  cache.set(key, { value, expires: Date.now() + ttlMs })
}
