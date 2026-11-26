// Create the first TRIORA administrator, or promote an existing account.
//
// Usage (from the server folder, in an interactive terminal):
//   node scripts/create-admin.js
//
// The password is typed privately: it is not shown on screen, not printed,
// not logged and never stored in plain text (only a bcrypt hash is saved).

require('dotenv').config({ quiet: true });

const readline = require('readline');
const { Client } = require('pg');
const { createAdmin, promoteToAdmin } = require('../lib/adminBootstrap');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Read a line without echoing the typed characters.
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    let value = '';

    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    function finish(error) {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');

      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }

        if (char === '\u0003') {
          finish(new Error('Cancelled.'));
          return;
        }

        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    }

    input.on('data', onData);
  });
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      'This script must be run in an interactive terminal so the password can be typed privately.'
    );
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is missing in server/.env.');
    process.exitCode = 1;
    return;
  }

  console.log('TRIORA administrator setup');
  console.log('  1) Create a new administrator account');
  console.log('  2) Promote an existing account to administrator');

  const choice = await ask('Choose 1 or 2: ');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    if (choice === '1') {
      const fullName = await ask('Full name: ');
      const email = await ask('Email: ');
      const password = await askHidden('Password (8-72 characters, hidden): ');
      const confirm = await askHidden('Confirm password (hidden): ');

      if (password !== confirm) {
        throw new Error('The passwords do not match. Nothing was changed.');
      }

      const admin = await createAdmin(client, { fullName, email, password });
      console.log(`Administrator account created for ${admin.email}.`);
    } else if (choice === '2') {
      const email = await ask('Email of the existing account: ');
      const admin = await promoteToAdmin(client, { email });
      console.log(`${admin.email} is now an active administrator.`);
    } else {
      throw new Error('Please choose 1 or 2. Nothing was changed.');
    }
  } catch (error) {
    console.error(`Could not complete administrator setup: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
