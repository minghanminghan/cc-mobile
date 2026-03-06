import Database from 'better-sqlite3'
import path from 'path'
import type { PushSubscription } from 'web-push'

const DB_PATH = process.env.PUSH_DB_PATH ?? path.join(process.cwd(), 'push-subscriptions.db')

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    endpoint     TEXT    PRIMARY KEY,
    subscription TEXT    NOT NULL,
    last_used    INTEGER NOT NULL DEFAULT (unixepoch())
  )
`)

// Remove subscriptions unused for 90 days on startup
db.prepare(`DELETE FROM subscriptions WHERE last_used < unixepoch() - ?`).run(90 * 86400)

const stmtUpsert = db.prepare(`
  INSERT INTO subscriptions (endpoint, subscription)
  VALUES (?, ?)
  ON CONFLICT(endpoint) DO UPDATE SET
    subscription = excluded.subscription,
    last_used    = unixepoch()
`)
const stmtDelete = db.prepare(`DELETE FROM subscriptions WHERE endpoint = ?`)
const stmtAll    = db.prepare(`SELECT subscription FROM subscriptions`)
const stmtTouch  = db.prepare(`UPDATE subscriptions SET last_used = unixepoch() WHERE endpoint = ?`)

export function saveSub(sub: PushSubscription) {
  stmtUpsert.run(sub.endpoint, JSON.stringify(sub))
}

export function removeSub(endpoint: string) {
  stmtDelete.run(endpoint)
}

export function getAllSubs(): PushSubscription[] {
  return (stmtAll.all() as { subscription: string }[]).map(r => JSON.parse(r.subscription))
}

export function touchSub(endpoint: string) {
  stmtTouch.run(endpoint)
}
