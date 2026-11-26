// Database logic for the first-administrator bootstrap script (Phase 7).
// Kept separate from the interactive script so it can be tested.

const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

function validateEmail(email) {
  const cleaned = String(email || '').trim().toLowerCase();

  if (cleaned.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new Error('Please enter a valid email address.');
  }

  return cleaned;
}

// Create a new, active administrator account. Audit-logged.
async function createAdmin(client, { fullName, email, password }) {
  const name = String(fullName || '').trim();
  const cleanedEmail = validateEmail(email);

  if (name.length < 2 || name.length > 100) {
    throw new Error('Name must be between 2 and 100 characters.');
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new Error('Password must be between 8 and 72 characters.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await client.query('BEGIN');

  try {
    const result = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active, approved_at)
       VALUES ($1, $2, $3, 'admin', TRUE, NOW())
       RETURNING id, full_name, email, role`,
      [name, cleanedEmail, passwordHash]
    );

    await client.query(
      `INSERT INTO user_account_changes (user_id, changed_by, action, new_role, new_active)
       VALUES ($1, NULL, 'bootstrap_created_admin', 'admin', TRUE)`,
      [result.rows[0].id]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      throw new Error('An account with this email already exists. Use the "promote" option instead.');
    }

    throw error;
  }
}

// Promote an existing account to an active administrator. Audit-logged.
async function promoteToAdmin(client, { email }) {
  const cleanedEmail = validateEmail(email);

  await client.query('BEGIN');

  try {
    const existing = await client.query(
      'SELECT id, role, is_active FROM users WHERE email = $1 FOR UPDATE',
      [cleanedEmail]
    );
    const user = existing.rows[0];

    if (!user) {
      throw new Error('No account was found with that email address.');
    }

    const result = await client.query(
      `UPDATE users
       SET role = 'admin',
           is_active = TRUE,
           approved_at = COALESCE(approved_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, email, role`,
      [user.id]
    );

    await client.query(
      `INSERT INTO user_account_changes
         (user_id, changed_by, action, old_role, new_role, old_active, new_active)
       VALUES ($1, NULL, 'bootstrap_promoted_admin', $2, 'admin', $3, TRUE)`,
      [user.id, user.role, user.is_active]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

module.exports = { createAdmin, promoteToAdmin };
