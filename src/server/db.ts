import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, '../../data/music.db')

const db = new Database(dbPath)

// Offset used to shift ranks to a temp range so bulk updates never create duplicate rank values
const RANK_OFFSET = 30000

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rank INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    year INTEGER,
    last_played TEXT
  )
`)

export interface Favorite {
  id: number
  rank: number
  title: string
  artist: string
  year: number | null
  last_played: string | null
}

export function getAllFavorites(): Favorite[] {
  return db.prepare('SELECT * FROM favorites ORDER BY rank').all() as Favorite[]
}

export function getFavoritesByRecent(): Favorite[] {
  return db.prepare(`
    SELECT * FROM favorites
    ORDER BY last_played DESC NULLS LAST, rank
  `).all() as Favorite[]
}

export function getFavoriteById(id: number): Favorite | undefined {
  return db.prepare('SELECT * FROM favorites WHERE id = ?').get(id) as Favorite | undefined
}

export function addFavorite(data: { rank: number; title: string; artist: string; year?: number; last_played?: string }): Favorite {
  const insertRank = data.rank
  const transaction = db.transaction(() => {
    // Move rows at or above insert position to temp range (avoids UNIQUE violation during shift)
    db.prepare('UPDATE favorites SET rank = rank + ? WHERE rank >= ?').run(RANK_OFFSET, insertRank)
    // Insert new row at desired rank
    const result = db.prepare(`
      INSERT INTO favorites (rank, title, artist, year, last_played)
      VALUES (?, ?, ?, ?, ?)
    `).run(insertRank, data.title, data.artist, data.year ?? null, data.last_played ?? null)
    // Move temp rows back: rank 10003 -> 4, 10004 -> 5, etc. (rank - OFFSET + 1)
    db.prepare('UPDATE favorites SET rank = rank - ? WHERE rank > ?').run(RANK_OFFSET - 1, RANK_OFFSET)
    return result.lastInsertRowid as number
  })
  const lastId = transaction()
  return getFavoriteById(lastId)!
}

export function updateFavorite(id: number, data: { rank?: number; title?: string; artist?: string; year?: number | null; last_played?: string | null }): Favorite | undefined {
  const current = getFavoriteById(id)
  if (!current) return undefined

  // Handle rank change - use temp offset so bulk shift never creates duplicate ranks
  if (data.rank !== undefined && data.rank !== current.rank) {
    const newRank = data.rank
    const transaction = db.transaction(() => {
      db.prepare('UPDATE favorites SET rank = -1 WHERE id = ?').run(id)

      if (newRank < current.rank) {
        // Moving up: shift [newRank, current.rank) down by 1 via temp range
        db.prepare('UPDATE favorites SET rank = rank + ? WHERE rank >= ? AND rank < ?').run(RANK_OFFSET, newRank, current.rank)
        db.prepare(`
          UPDATE favorites SET rank = ?, title = ?, artist = ?, year = ?, last_played = ? WHERE id = ?
        `).run(newRank, data.title ?? current.title, data.artist ?? current.artist, data.year !== undefined ? data.year : current.year, data.last_played !== undefined ? data.last_played : current.last_played, id)
        db.prepare('UPDATE favorites SET rank = rank - ? WHERE rank > ?').run(RANK_OFFSET - 1, RANK_OFFSET)
      } else {
        // Moving down: shift (current.rank, newRank] up by 1 via temp range
        db.prepare('UPDATE favorites SET rank = rank + ? WHERE rank > ? AND rank <= ?').run(RANK_OFFSET, current.rank, newRank)
        db.prepare(`
          UPDATE favorites SET rank = ?, title = ?, artist = ?, year = ?, last_played = ? WHERE id = ?
        `).run(newRank, data.title ?? current.title, data.artist ?? current.artist, data.year !== undefined ? data.year : current.year, data.last_played !== undefined ? data.last_played : current.last_played, id)
        db.prepare('UPDATE favorites SET rank = rank - ? WHERE rank > ?').run(RANK_OFFSET + 1, RANK_OFFSET)
      }
    })
    transaction()
  } else {
    // No rank change, just update other fields
    db.prepare(`
      UPDATE favorites
      SET rank = ?, title = ?, artist = ?, year = ?, last_played = ?
      WHERE id = ?
    `).run(
      data.rank ?? current.rank,
      data.title ?? current.title,
      data.artist ?? current.artist,
      data.year !== undefined ? data.year : current.year,
      data.last_played !== undefined ? data.last_played : current.last_played,
      id
    )
  }

  return getFavoriteById(id)
}

export function deleteFavorite(id: number): boolean {
  const current = getFavoriteById(id)
  if (!current) return false

  db.prepare('DELETE FROM favorites WHERE id = ?').run(id)

  // Shift ranks up for albums below the deleted one
  db.prepare('UPDATE favorites SET rank = rank - 1 WHERE rank > ?').run(current.rank)

  return true
}

export function markPlayed(id: number): Favorite | undefined {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  db.prepare('UPDATE favorites SET last_played = ? WHERE id = ?').run(today, id)
  return getFavoriteById(id)
}

export function getMaxRank(): number {
  const result = db.prepare('SELECT MAX(rank) as maxRank FROM favorites').get() as { maxRank: number | null }
  return result.maxRank ?? 0
}

export default db
