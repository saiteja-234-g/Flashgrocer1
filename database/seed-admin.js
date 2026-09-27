/* ================================================================
   FlashGrocer – database/seed-admin.js
   Creates/updates the admin account from .env credentials.
   Run: node database/seed-admin.js
   ================================================================ */

'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./db');

async function seedAdmin() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@flashgrocer.in';
  const password = process.env.ADMIN_PASSWORD || 'Admin@Flash2026';
  const name     = 'FlashGrocer Admin';

  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);

  if (existing) {
    // Promote to admin if not already
    if (existing.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE id = ?").run(existing.id);
      console.log(`✅ User "${email}" promoted to admin (id: ${existing.id})`);
    } else {
      // Update password
      const hash = await bcrypt.hash(password, 12);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, existing.id);
      console.log(`🔑 Admin password updated for "${email}" (id: ${existing.id})`);
    }
  } else {
    const hash   = await bcrypt.hash(password, 12);
    const result = db.prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
    ).run(name, email, hash);
    console.log(`✅ Admin account created → email: ${email} | id: ${result.lastInsertRowid}`);
  }

  console.log('');
  console.log('  🔐 Admin Credentials');
  console.log('  ─────────────────────────────');
  console.log(`  Email   : ${email}`);
  console.log(`  Password: ${password}`);
  console.log('  ─────────────────────────────');
  console.log('  Login at: http://localhost:3000/login.html');
  console.log('');
}

seedAdmin().catch(console.error);
