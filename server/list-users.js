const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database('./data/primeaxis.db');

const passwords = {
    'admin@primeaxisit.com': 'admin@123',
    'hr@primeaxisit.com': 'Hr@12345',
    'manager@primeaxisit.com': 'Manager@123',
    'accounts@primeaxisit.com': 'Accounts@123',
    'rahul@primeaxisit.com': 'Rahul@123',
    'anita@primeaxisit.com': 'Anita@123',
};

const update = db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE email = ?');
for (const [email, pwd] of Object.entries(passwords)) {
    const hash = bcrypt.hashSync(pwd, 10);
    update.run(hash, email);
}

const users = db.prepare('SELECT id, email, role, name, is_active FROM users ORDER BY id').all();
const display = users.map(u => ({ ...u, password: passwords[u.email] || '(unknown)' }));
console.table(display);
console.log('\n✅ All passwords have been reset.');
db.close();
