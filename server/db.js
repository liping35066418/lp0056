const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'study_room.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seat_code TEXT NOT NULL UNIQUE,
      area_id INTEGER NOT NULL,
      seat_type TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (area_id) REFERENCES areas(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seat_id INTEGER NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      reserve_start TEXT NOT NULL,
      reserve_end TEXT NOT NULL,
      status TEXT DEFAULT 'reserved',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (seat_id) REFERENCES seats(id)
    );

    CREATE TABLE IF NOT EXISTS check_ins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seat_id INTEGER NOT NULL,
      reservation_id INTEGER,
      customer_name TEXT,
      customer_phone TEXT,
      check_in_time TEXT NOT NULL,
      source TEXT DEFAULT 'walk_in',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (seat_id) REFERENCES seats(id),
      FOREIGN KEY (reservation_id) REFERENCES reservations(id)
    );

    CREATE TABLE IF NOT EXISTS check_outs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_in_id INTEGER NOT NULL UNIQUE,
      seat_id INTEGER NOT NULL,
      check_out_time TEXT NOT NULL,
      duration_minutes INTEGER,
      is_abnormal INTEGER DEFAULT 0,
      abnormal_reason TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (check_in_id) REFERENCES check_ins(id),
      FOREIGN KEY (seat_id) REFERENCES seats(id)
    );

    CREATE TABLE IF NOT EXISTS temp_occupations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seat_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      customer_name TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (seat_id) REFERENCES seats(id)
    );

    CREATE TABLE IF NOT EXISTS data_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      correction_type TEXT NOT NULL,
      target_id INTEGER,
      original_data TEXT,
      corrected_data TEXT,
      reason TEXT,
      operator TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_seats_area ON seats(area_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_seat ON reservations(seat_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_time ON reservations(reserve_start, reserve_end);
    CREATE INDEX IF NOT EXISTS idx_check_ins_seat ON check_ins(seat_id);
    CREATE INDEX IF NOT EXISTS idx_check_ins_time ON check_ins(check_in_time);
    CREATE INDEX IF NOT EXISTS idx_check_outs_time ON check_outs(check_out_time);
    CREATE INDEX IF NOT EXISTS idx_temp_occ_seat ON temp_occupations(seat_id);
  `);
}

initDatabase();

module.exports = db;
