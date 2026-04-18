const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { db, generateEmployeeCode, generateOfferRef, generateRelievingRef, generateTicketNo, generateBGVToken, generateTempPassword } = require('./db');
const { breakdownCTC, calculatePayslip, amountInWords } = require('./salary');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// Parse 'YYYY-MM-DD' as local date (not UTC)
function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// ===== FILE UPLOAD CONFIG =====
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const subDir = path.join(uploadsDir, 'offer-docs');
        if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
        cb(null, subDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
        cb(null, safeName);
    }
});

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
    fileFilter: (req, file, cb) => {
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPG, PNG, WebP and PDF files are allowed'));
    }
});

// ===== SECURITY MIDDLEWARE =====
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for portal
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: process.env.CORS_ORIGIN || true, // Set specific origin in production
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 login attempts per IP
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', apiLimiter);

// Serve main website from parent directory (exclude dotfiles)
app.use(express.static(path.join(__dirname, '..'), { dotfiles: 'deny' }));
// Health check for Railway
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Serve portal files
app.use('/portal', express.static(path.join(__dirname, '..', 'portal'), { dotfiles: 'deny' }));
// Serve uploaded documents behind auth
app.use('/api/uploads', (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
    try {
        jwt.verify(header.split(' ')[1], JWT_SECRET);
        next();
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
}, express.static(uploadsDir, { dotfiles: 'deny' }));

// JWT Auth Middleware
function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const token = header.split(' ')[1];
        req.user = jwt.verify(token, JWT_SECRET);
        // Check user still active
        const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.user.id);
        if (!user || !user.is_active) return res.status(401).json({ error: 'Account deactivated' });
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// Role check middleware
function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
}

// ============================================================
//  AUTH ROUTES
// ============================================================
app.post('/api/auth/login', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_active) return res.status(401).json({ error: 'Account is deactivated. Contact admin.' });

    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get employee info if exists
    const employee = db.prepare('SELECT id, employee_code, name, designation, department FROM employees WHERE user_id = ?').get(user.id);

    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name, employeeId: employee?.id },
        JWT_SECRET,
        { expiresIn: '12h' }
    );

    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            mustChangePassword: user.must_change_password === 1,
            employee: employee || null
        }
    });
});

app.post('/api/auth/change-password', auth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase and a number' });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, must_change_password = 0, updated_at = datetime("now") WHERE id = ?').run(hash, req.user.id);
    res.json({ message: 'Password changed successfully' });
});

// ============================================================
//  USER MANAGEMENT (Admin only)
// ============================================================
app.get('/api/users', auth, requireRole('admin'), (req, res) => {
    const users = db.prepare('SELECT id, email, role, name, is_active, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
});

app.post('/api/users', auth, requireRole('admin'), (req, res) => {
    const { email, name, role, password } = req.body;
    if (!email || !name || !role || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!['hr', 'manager', 'accountant', 'employee'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
        'INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)'
    ).run(email.toLowerCase().trim(), hash, role, name.trim());

    res.json({ id: result.lastInsertRowid, message: 'User created successfully' });
});

app.put('/api/users/:id', auth, requireRole('admin'), (req, res) => {
    const { name, role, is_active } = req.body;
    const userId = req.params.id;

    if (parseInt(userId) === req.user.id && is_active === 0) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    db.prepare('UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), is_active = COALESCE(?, is_active), updated_at = datetime("now") WHERE id = ?')
        .run(name, role, is_active, userId);
    res.json({ message: 'User updated' });
});

app.post('/api/users/:id/reset-password', auth, requireRole('admin'), (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase and a number' });

    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ?, must_change_password = 1, updated_at = datetime("now") WHERE id = ?')
        .run(hash, req.params.id);
    res.json({ message: 'Password reset successfully' });
});

// ============================================================
//  EMPLOYEE MANAGEMENT (HR + Admin)
// ============================================================
app.get('/api/employees', auth, requireRole('admin', 'hr', 'manager', 'accountant'), (req, res) => {
    const employees = db.prepare(`
        SELECT e.*, u.email as login_email, u.role, u.is_active as user_active
        FROM employees e
        LEFT JOIN users u ON e.user_id = u.id
        ORDER BY e.created_at DESC
    `).all();
    res.json(employees);
});

app.get('/api/employees/:id', auth, (req, res) => {
    const id = req.params.id;
    // Employees can only view their own profile
    if (req.user.role === 'employee') {
        const emp = db.prepare('SELECT * FROM employees WHERE user_id = ?').get(req.user.id);
        if (!emp || emp.id !== parseInt(id)) return res.status(403).json({ error: 'Access denied' });
    }
    const employee = db.prepare(`
        SELECT e.*, u.email as login_email
        FROM employees e LEFT JOIN users u ON e.user_id = u.id
        WHERE e.id = ?
    `).get(id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
});

app.post('/api/employees', auth, requireRole('admin', 'hr'), (req, res) => {
    const { name, email, phone, address, city, state, pincode, department, designation, date_of_joining, annual_ctc, pan, aadhar, bank_name, bank_account, ifsc_code, emergency_contact, emergency_phone } = req.body;

    if (!name || !email || !designation || !department) {
        return res.status(400).json({ error: 'Name, email, designation and department are required' });
    }

    const code = generateEmployeeCode();
    const result = db.prepare(`
        INSERT INTO employees (employee_code, name, email, phone, address, city, state, pincode, department, designation, date_of_joining, annual_ctc, pan, aadhar, bank_name, bank_account, ifsc_code, emergency_contact, emergency_phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, name.trim(), email.toLowerCase().trim(), phone, address, city, state || 'Telangana', pincode, department, designation, date_of_joining, annual_ctc || 0, pan, aadhar, bank_name, bank_account, ifsc_code, emergency_contact, emergency_phone);

    // Create leave balances for current year
    const year = new Date().getFullYear();
    db.prepare('INSERT OR IGNORE INTO leave_balances (employee_id, year) VALUES (?, ?)').run(result.lastInsertRowid, year);

    res.json({ id: result.lastInsertRowid, employee_code: code, message: 'Employee added' });
});

app.put('/api/employees/:id', auth, requireRole('admin', 'hr'), (req, res) => {
    const fields = req.body;
    const allowed = ['name', 'email', 'phone', 'address', 'city', 'state', 'pincode', 'department', 'designation', 'date_of_joining', 'date_of_leaving', 'annual_ctc', 'pan', 'aadhar', 'bank_name', 'bank_account', 'ifsc_code', 'emergency_contact', 'emergency_phone', 'status', 'reporting_manager_id', 'uan'];

    const updates = [];
    const values = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            updates.push(`${key} = ?`);
            values.push(fields[key]);
        }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);

    db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ message: 'Employee updated' });
});

// Link employee to user account
app.post('/api/employees/:id/link-user', auth, requireRole('admin', 'hr'), (req, res) => {
    const { user_id } = req.body;
    db.prepare('UPDATE employees SET user_id = ? WHERE id = ?').run(user_id, req.params.id);
    res.json({ message: 'Employee linked to user account' });
});

// ============================================================
//  OFFER LETTERS (HR creates, Manager approves, HR releases)
// ============================================================
app.get('/api/offers', auth, requireRole('admin', 'hr', 'manager'), (req, res) => {
    const offers = db.prepare(`
        SELECT o.*, u.name as created_by_name, a.name as approved_by_name
        FROM offer_letters o
        LEFT JOIN users u ON o.created_by = u.id
        LEFT JOIN users a ON o.approved_by = a.id
        ORDER BY o.created_at DESC
    `).all();
    res.json(offers);
});

// Employee views their own offer letter
app.get('/api/my/offer', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(404).json({ error: 'No employee profile found' });

    const offer = db.prepare('SELECT * FROM offer_letters WHERE employee_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
        .get(emp.id, 'released');
    if (!offer) return res.json(null);
    res.json(offer);
});

app.post('/api/offers', auth, requireRole('admin', 'hr'), upload.fields([
    { name: 'doc_aadhar', maxCount: 1 },
    { name: 'doc_pan', maxCount: 1 },
    { name: 'doc_photo', maxCount: 1 },
]), (req, res) => {
    // Handle multer errors
    const { employee_name, employee_email, employee_phone, employee_address, employee_city, employee_state, employee_pincode, designation, department, date_of_joining, annual_ctc, probation_months, notice_period_days, reporting_manager, work_location, additional_terms, employee_id, shift_applicable, joining_bonus, relocation_expense, employment_type, contract_end_date } = req.body;

    if (!employee_name || !designation || !department || !date_of_joining || !annual_ctc) {
        return res.status(400).json({ error: 'Required fields: name, designation, department, joining date, CTC' });
    }

    if (employment_type === 'contract' && !contract_end_date) {
        return res.status(400).json({ error: 'Contract end date is required for contract employees' });
    }

    // Validate mandatory documents
    if (!req.files || !req.files.doc_aadhar || !req.files.doc_aadhar[0]) {
        return res.status(400).json({ error: 'Candidate Aadhar card document is required' });
    }
    if (!req.files.doc_pan || !req.files.doc_pan[0]) {
        return res.status(400).json({ error: 'Candidate PAN card document is required' });
    }
    if (!req.files.doc_photo || !req.files.doc_photo[0]) {
        return res.status(400).json({ error: 'Candidate photo is required' });
    }

    const docAadhar = 'offer-docs/' + req.files.doc_aadhar[0].filename;
    const docPan = 'offer-docs/' + req.files.doc_pan[0].filename;
    const docPhoto = 'offer-docs/' + req.files.doc_photo[0].filename;

    const refNo = generateOfferRef();
    const salaryBreakup = JSON.stringify(breakdownCTC(parseFloat(annual_ctc)));

    const result = db.prepare(`
        INSERT INTO offer_letters (reference_no, employee_id, employee_name, employee_email, employee_phone, employee_address, employee_city, employee_state, employee_pincode, designation, department, date_of_joining, annual_ctc, salary_breakup, probation_months, notice_period_days, reporting_manager, work_location, additional_terms, doc_aadhar, doc_pan, doc_photo, shift_applicable, joining_bonus, relocation_expense, employment_type, contract_end_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(refNo, employee_id || null, employee_name, employee_email, employee_phone, employee_address, employee_city, employee_state || 'Telangana', employee_pincode, designation, department, date_of_joining, parseFloat(annual_ctc), salaryBreakup, parseInt(probation_months) || 6, parseInt(notice_period_days) || 90, reporting_manager, work_location || 'Hyderabad', additional_terms, docAadhar, docPan, docPhoto, shift_applicable === 'true' || shift_applicable === '1' ? 1 : 0, parseFloat(joining_bonus) || 0, parseFloat(relocation_expense) || 0, employment_type || 'permanent', employment_type === 'contract' ? contract_end_date : null, req.user.id);

    res.json({ id: result.lastInsertRowid, reference_no: refNo, message: 'Offer letter created' });
});

// Multer error handler
// Multer error handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Maximum 5MB per file.' });
        return res.status(400).json({ error: 'Invalid file upload' });
    }
    if (err && err.message && !err.stack) return res.status(400).json({ error: err.message });
    // Generic error — don't leak internals
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.put('/api/offers/:id/submit', auth, requireRole('admin', 'hr'), (req, res) => {
    db.prepare('UPDATE offer_letters SET status = ? WHERE id = ? AND status = ?').run('pending_approval', req.params.id, 'draft');

    // Notify managers
    const managers = db.prepare('SELECT id FROM users WHERE role = ? AND is_active = 1').all('manager');
    const offer = db.prepare('SELECT employee_name, reference_no FROM offer_letters WHERE id = ?').get(req.params.id);
    for (const mgr of managers) {
        db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)')
            .run(mgr.id, 'Offer Letter Approval Required', `Offer for ${offer.employee_name} (${offer.reference_no}) needs your approval`, 'warning', '/portal/#offers');
    }
    res.json({ message: 'Submitted for approval' });
});

app.put('/api/offers/:id/approve', auth, requireRole('admin', 'manager'), (req, res) => {
    db.prepare('UPDATE offer_letters SET status = ?, approved_by = ?, approved_at = datetime("now") WHERE id = ? AND status = ?')
        .run('approved', req.user.id, req.params.id, 'pending_approval');
    res.json({ message: 'Offer approved' });
});

app.put('/api/offers/:id/reject', auth, requireRole('admin', 'manager'), (req, res) => {
    db.prepare('UPDATE offer_letters SET status = ? WHERE id = ? AND status = ?')
        .run('draft', req.params.id, 'pending_approval');
    res.json({ message: 'Offer rejected and sent back to draft' });
});

app.put('/api/offers/:id/release', auth, requireRole('admin', 'hr'), (req, res) => {
    const offer = db.prepare('SELECT * FROM offer_letters WHERE id = ? AND status = ?').get(req.params.id, 'approved');
    if (!offer) return res.status(400).json({ error: 'Offer must be approved before releasing' });

    db.prepare('UPDATE offer_letters SET status = ?, released_at = datetime("now") WHERE id = ?').run('released', req.params.id);

    // If linked to employee, update their status and CTC
    if (offer.employee_id) {
        db.prepare('UPDATE employees SET status = ?, annual_ctc = ?, designation = ?, department = ?, date_of_joining = ? WHERE id = ?')
            .run('active', offer.annual_ctc, offer.designation, offer.department, offer.date_of_joining, offer.employee_id);
    }

    res.json({ message: 'Offer letter released' });
});

// Get salary breakup preview
app.post('/api/salary-breakup', auth, requireRole('admin', 'hr', 'accountant'), (req, res) => {
    const { annual_ctc } = req.body;
    if (!annual_ctc || annual_ctc <= 0) return res.status(400).json({ error: 'Valid CTC required' });
    const breakup = breakdownCTC(annual_ctc);
    breakup.amountInWords = amountInWords(annual_ctc);
    res.json(breakup);
});

// ============================================================
//  TIMESHEETS
// ============================================================
// My own timesheets (any role)
app.get('/api/my/timesheets', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.json([]);
    const ts = db.prepare('SELECT t.*, e.name as employee_name, e.employee_code FROM timesheets t JOIN employees e ON t.employee_id = e.id WHERE t.employee_id = ? ORDER BY t.week_start DESC').all(emp.id);
    res.json(ts);
});

// My own leaves (any role)
app.get('/api/my/leaves', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.json([]);
    const leaves = db.prepare('SELECT l.*, e.name as employee_name FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.employee_id = ? ORDER BY l.created_at DESC').all(emp.id);
    res.json(leaves);
});

// All timesheets (admin/hr/manager see all, employee sees own)
app.get('/api/timesheets', auth, (req, res) => {
    let query, params;
    if (req.user.role === 'employee') {
        const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
        if (!emp) return res.json([]);
        query = 'SELECT t.*, e.name as employee_name, e.employee_code FROM timesheets t JOIN employees e ON t.employee_id = e.id WHERE t.employee_id = ? ORDER BY t.week_start DESC';
        params = [emp.id];
    } else {
        query = 'SELECT t.*, e.name as employee_name, e.employee_code FROM timesheets t JOIN employees e ON t.employee_id = e.id ORDER BY t.week_start DESC';
        params = [];
    }
    res.json(db.prepare(query).all(...params));
});

app.post('/api/timesheets', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(400).json({ error: 'No employee profile linked' });

    const { week_start, week_end, entries } = req.body;
    if (!week_start || !entries || !Array.isArray(entries)) {
        return res.status(400).json({ error: 'Week start and entries required' });
    }

    const totalHours = entries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
    const result = db.prepare(
        'INSERT INTO timesheets (employee_id, week_start, week_end, entries, total_hours) VALUES (?, ?, ?, ?, ?)'
    ).run(emp.id, week_start, week_end, JSON.stringify(entries), totalHours);

    res.json({ id: result.lastInsertRowid, message: 'Timesheet saved' });
});

app.put('/api/timesheets/:id/submit', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    const ts = db.prepare('SELECT * FROM timesheets WHERE id = ? AND employee_id = ? AND status = ?').get(req.params.id, emp?.id, 'draft');
    if (!ts) return res.status(400).json({ error: 'Timesheet not found or not in draft' });

    db.prepare('UPDATE timesheets SET status = ?, submitted_at = datetime("now") WHERE id = ?').run('submitted', req.params.id);
    res.json({ message: 'Timesheet submitted for approval' });
});

app.put('/api/timesheets/:id/approve', auth, requireRole('admin', 'manager'), (req, res) => {
    db.prepare('UPDATE timesheets SET status = ?, approved_by = ?, approved_at = datetime("now") WHERE id = ? AND status = ?')
        .run('approved', req.user.id, req.params.id, 'submitted');
    res.json({ message: 'Timesheet approved' });
});

app.put('/api/timesheets/:id/reject', auth, requireRole('admin', 'manager'), (req, res) => {
    const { reason } = req.body;
    db.prepare('UPDATE timesheets SET status = ?, reject_reason = ? WHERE id = ? AND status = ?')
        .run('rejected', reason || '', req.params.id, 'submitted');
    res.json({ message: 'Timesheet rejected' });
});

// ============================================================
//  LEAVES
// ============================================================
app.get('/api/leaves', auth, (req, res) => {
    let query, params;
    if (req.user.role === 'employee') {
        const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
        if (!emp) return res.json([]);
        query = 'SELECT l.*, e.name as employee_name FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.employee_id = ? ORDER BY l.created_at DESC';
        params = [emp.id];
    } else {
        query = 'SELECT l.*, e.name as employee_name, e.employee_code FROM leaves l JOIN employees e ON l.employee_id = e.id ORDER BY l.created_at DESC';
        params = [];
    }
    res.json(db.prepare(query).all(...params));
});

app.get('/api/my/leave-balance', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.json(null);
    const year = new Date().getFullYear();
    let bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(emp.id, year);
    if (!bal) {
        db.prepare('INSERT INTO leave_balances (employee_id, year) VALUES (?, ?)').run(emp.id, year);
        bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(emp.id, year);
    }
    res.json(bal);
});

app.post('/api/leaves', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(400).json({ error: 'No employee profile linked' });

    const { leave_type, from_date, to_date, reason } = req.body;
    if (!leave_type || !from_date || !to_date) {
        return res.status(400).json({ error: 'Leave type, from and to dates required' });
    }

    // Calculate business days (exclude weekends & company holidays)
    const from = parseLocalDate(from_date);
    const to = parseLocalDate(to_date);
    let days = 0;
    const holidays = db.prepare(
        'SELECT date FROM company_holidays WHERE date >= ? AND date <= ?'
    ).all(from_date, to_date).map(h => h.date);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue; // skip weekends
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (holidays.includes(dateStr)) continue; // skip holidays
        days++;
    }

    if (days <= 0) return res.status(400).json({ error: 'No working days in selected range (weekends/holidays excluded)' });

    // Check leave balance for LOP
    let is_lop = 0, lop_days = 0;
    const year = parseLocalDate(from_date).getFullYear();
    let bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(emp.id, year);
    if (!bal) {
        db.prepare('INSERT INTO leave_balances (employee_id, year) VALUES (?, ?)').run(emp.id, year);
        bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(emp.id, year);
    }

    if (leave_type === 'unpaid') {
        is_lop = 1;
        lop_days = days;
    } else {
        const typeMap = { casual: { total: 'casual_total', used: 'casual_used' }, sick: { total: 'sick_total', used: 'sick_used' }, earned: { total: 'earned_total', used: 'earned_used' } };
        const balInfo = typeMap[leave_type];
        if (balInfo) {
            const available = bal[balInfo.total] - bal[balInfo.used];
            if (days > available) {
                lop_days = days - Math.max(0, available);
                is_lop = 1;
            }
        }
    }

    const result = db.prepare(
        'INSERT INTO leaves (employee_id, leave_type, from_date, to_date, days, reason, is_lop, lop_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(emp.id, leave_type, from_date, to_date, days, reason, is_lop, lop_days);

    res.json({ id: result.lastInsertRowid, days, is_lop, lop_days, message: is_lop ? `Leave applied: ${days} day(s), ${lop_days} day(s) will be Loss of Pay` : `Leave applied for ${days} day(s)` });
});

// Check LOP info before applying leave
app.post('/api/leaves/check-lop', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(400).json({ error: 'No employee profile linked' });

    const { leave_type, from_date, to_date } = req.body;
    if (!leave_type || !from_date || !to_date) return res.json({ days: 0 });

    // Calculate business days
    const from = parseLocalDate(from_date);
    const to = parseLocalDate(to_date);
    let days = 0;
    const holidays = db.prepare(
        'SELECT date FROM company_holidays WHERE date >= ? AND date <= ?'
    ).all(from_date, to_date).map(h => h.date);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (holidays.includes(dateStr)) continue;
        days++;
    }

    if (days <= 0) return res.json({ days: 0, error: 'No working days in selected range' });

    const year = parseLocalDate(from_date).getFullYear();
    let bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(emp.id, year);
    if (!bal) {
        db.prepare('INSERT INTO leave_balances (employee_id, year) VALUES (?, ?)').run(emp.id, year);
        bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(emp.id, year);
    }

    let is_lop = 0, lop_days = 0, available = 0;
    if (leave_type === 'unpaid') {
        is_lop = 1; lop_days = days;
    } else {
        const typeMap = { casual: { total: 'casual_total', used: 'casual_used' }, sick: { total: 'sick_total', used: 'sick_used' }, earned: { total: 'earned_total', used: 'earned_used' } };
        const balInfo = typeMap[leave_type];
        if (balInfo) {
            available = bal[balInfo.total] - bal[balInfo.used];
            if (days > available) {
                lop_days = days - Math.max(0, available);
                is_lop = 1;
            }
        }
    }

    res.json({ days, is_lop, lop_days, available, leave_type, balance: bal });
});

app.put('/api/leaves/:id/approve', auth, requireRole('admin', 'manager'), (req, res) => {
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ? AND status = ?').get(req.params.id, 'pending');
    if (!leave) return res.status(400).json({ error: 'Leave not found or already processed' });

    db.prepare("UPDATE leaves SET status = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?")
        .run('approved', req.user.id, req.params.id);

    // Update leave balance (only for the non-LOP portion)
    const year = parseLocalDate(leave.from_date).getFullYear();
    let bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(leave.employee_id, year);
    if (!bal) {
        db.prepare('INSERT INTO leave_balances (employee_id, year) VALUES (?, ?)').run(leave.employee_id, year);
        bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(leave.employee_id, year);
    }

    const typeMap = { casual: 'casual_used', sick: 'sick_used', earned: 'earned_used' };
    const col = typeMap[leave.leave_type];
    if (col) {
        // Only count the non-LOP portion against balance
        const paidDays = leave.days - (leave.lop_days || 0);
        if (paidDays > 0) {
            db.prepare(`UPDATE leave_balances SET ${col} = ${col} + ? WHERE employee_id = ? AND year = ?`)
                .run(paidDays, leave.employee_id, year);
        }
    }

    res.json({ message: leave.lop_days > 0 ? `Leave approved (${leave.lop_days} day(s) as Loss of Pay)` : 'Leave approved' });
});

app.put('/api/leaves/:id/reject', auth, requireRole('admin', 'manager'), (req, res) => {
    const { reason } = req.body;
    db.prepare('UPDATE leaves SET status = ?, reject_reason = ? WHERE id = ? AND status = ?')
        .run('rejected', reason || '', req.params.id, 'pending');
    res.json({ message: 'Leave rejected' });
});

// ============================================================
//  PAYSLIPS (Accountant generates)
// ============================================================

// Helper: Get employee's tax regime & approved exemptions for the FY containing given month/year
function getEmployeeTaxOptions(employeeId, month, year) {
    // Determine financial year: Apr-Mar
    const fy = month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    const decl = db.prepare(
        "SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ? AND status = 'approved'"
    ).get(employeeId, fy);

    if (decl) {
        return { regime: decl.regime, totalExemptions: decl.total_approved || 0 };
    }
    // Check for a submitted but not yet approved declaration — use declared amounts provisionally
    const pending = db.prepare(
        "SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ? AND status IN ('submitted', 'draft')"
    ).get(employeeId, fy);

    if (pending && pending.regime === 'old' && pending.total_declared > 0) {
        // Provisional: use declared amounts for draft/submitted old-regime declarations
        return { regime: 'old', totalExemptions: pending.total_declared };
    }

    // Default: new regime, no exemptions
    return { regime: 'new', totalExemptions: 0 };
}
app.get('/api/payslips', auth, (req, res) => {
    let query, params;
    if (req.user.role === 'employee') {
        const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
        if (!emp) return res.json([]);
        query = 'SELECT p.*, e.name as employee_name, e.employee_code, e.designation, e.department FROM payslips p JOIN employees e ON p.employee_id = e.id WHERE p.employee_id = ? ORDER BY p.year DESC, p.month DESC';
        params = [emp.id];
    } else {
        query = 'SELECT p.*, e.name as employee_name, e.employee_code, e.designation, e.department FROM payslips p JOIN employees e ON p.employee_id = e.id ORDER BY p.year DESC, p.month DESC';
        params = [];
    }
    res.json(db.prepare(query).all(...params));
});

// Auto-calculate payslip data for a given employee/month/year
app.post('/api/payslips/auto-calculate', auth, requireRole('admin', 'accountant'), (req, res) => {
    const { employee_id, month, year } = req.body;
    if (!employee_id || !month || !year) {
        return res.status(400).json({ error: 'Employee, month, and year required' });
    }

    const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND status = ?').get(employee_id, 'active');
    if (!emp) return res.status(400).json({ error: 'Active employee not found' });
    if (!emp.annual_ctc || emp.annual_ctc <= 0) return res.status(400).json({ error: 'Employee CTC not set' });

    // Calculate total calendar days in the month
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    // Calculate weekends (Sat/Sun)
    let weekends = 0;
    let weekendDates = [];
    for (let d = 1; d <= totalDaysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) {
            weekends++;
            weekendDates.push(date.toISOString().split('T')[0]);
        }
    }

    // Get company holidays that fall on weekdays in this month
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const allHolidays = db.prepare(
        'SELECT * FROM company_holidays WHERE date LIKE ? ORDER BY date'
    ).all(`${monthStr}%`);

    let holidaysOnWeekdays = 0;
    const holidayDetails = [];
    for (const h of allHolidays) {
        const dow = parseLocalDate(h.date).getDay();
        const isWeekend = dow === 0 || dow === 6;
        holidayDetails.push({ ...h, isWeekend });
        if (!isWeekend) holidaysOnWeekdays++;
    }

    // Working days = total days - weekends - holidays on weekdays
    const workingDays = totalDaysInMonth - weekends - holidaysOnWeekdays;

    // Get approved leaves for this employee in this month
    // We need to count actual leave days that overlap with this month & are on working days
    const approvedLeaves = db.prepare(`
        SELECT * FROM leaves WHERE employee_id = ? AND status = 'approved'
        AND ((from_date <= ? AND to_date >= ?) OR (from_date >= ? AND from_date <= ?))
    `).all(
        emp.id,
        `${monthStr}-${String(totalDaysInMonth).padStart(2, '0')}`, `${monthStr}-01`,
        `${monthStr}-01`, `${monthStr}-${String(totalDaysInMonth).padStart(2, '0')}`
    );

    let totalLeaveDays = 0;
    let totalLopDays = 0;
    let paidLeaveDays = 0;
    const leaveDetails = [];
    const holidayDates = allHolidays.filter(h => { const dow = parseLocalDate(h.date).getDay(); return dow !== 0 && dow !== 6; }).map(h => h.date);

    for (const leave of approvedLeaves) {
        // Count only days that fall within this month and on working days
        const leaveFrom = new Date(Math.max(parseLocalDate(leave.from_date), new Date(year, month - 1, 1)));
        const leaveTo = new Date(Math.min(parseLocalDate(leave.to_date), new Date(year, month - 1, totalDaysInMonth)));
        let daysInMonth = 0;
        for (let d = new Date(leaveFrom); d <= leaveTo; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (dow === 0 || dow === 6) continue; // skip weekends
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (holidayDates.includes(dateStr)) continue; // skip holidays
            daysInMonth++;
        }
        const lopInThisLeave = Math.min(daysInMonth, leave.lop_days || 0);
        totalLeaveDays += daysInMonth;
        totalLopDays += lopInThisLeave;
        paidLeaveDays += (daysInMonth - lopInThisLeave);
        leaveDetails.push({
            id: leave.id,
            type: leave.leave_type,
            from: leave.from_date,
            to: leave.to_date,
            days: daysInMonth,
            lop_days: lopInThisLeave,
            is_lop: leave.is_lop
        });
    }

    const presentDays = Math.max(0, workingDays - totalLeaveDays);

    // Get tax options
    const taxOpts = getEmployeeTaxOptions(emp.id, month, year);

    // Get payslip extras (bonus, joining bonus, etc.)
    const extras = db.prepare('SELECT * FROM payslip_extras WHERE employee_id = ? AND month = ? AND year = ?').all(emp.id, month, year);
    const totalExtras = extras.reduce((s, e) => s + e.amount, 0);
    const taxableExtras = extras.filter(e => e.is_taxable).reduce((s, e) => s + e.amount, 0);

    // Calculate payslip preview (include taxable extras in TDS calculation)
    const payslipPreview = calculatePayslip(emp.annual_ctc, workingDays, presentDays, { ...taxOpts, extraTaxableIncome: taxableExtras * 12 });
    payslipPreview.extras = extras;
    payslipPreview.totalExtras = totalExtras;
    if (totalExtras > 0) {
        payslipPreview.earnings.extras = totalExtras;
        payslipPreview.earnings.grossEarnings += totalExtras;
        payslipPreview.netPay += totalExtras;
    }

    res.json({
        employee: { id: emp.id, name: emp.name, employee_code: emp.employee_code, annual_ctc: emp.annual_ctc },
        month, year,
        totalDaysInMonth,
        weekends,
        holidaysOnWeekdays,
        holidays: holidayDetails,
        workingDays,
        approvedLeaves: leaveDetails,
        totalLeaveDays,
        paidLeaveDays,
        lopDays: totalLopDays,
        presentDays,
        taxRegime: taxOpts.regime,
        taxExemptions: taxOpts.totalExemptions,
        extras,
        totalExtras,
        preview: payslipPreview
    });
});

app.post('/api/payslips/generate', auth, requireRole('admin', 'accountant'), (req, res) => {
    const { employee_id, month, year, working_days, present_days } = req.body;
    if (!employee_id || !month || !year || !working_days) {
        return res.status(400).json({ error: 'Employee, month, year, and working days required' });
    }

    const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND status = ?').get(employee_id, 'active');
    if (!emp) return res.status(400).json({ error: 'Active employee not found' });
    if (!emp.annual_ctc || emp.annual_ctc <= 0) return res.status(400).json({ error: 'Employee CTC not set' });

    // Look up approved tax declaration for this FY
    const taxOpts = getEmployeeTaxOptions(emp.id, month, year);

    const actual_present = present_days ?? working_days;
    const payslipData = calculatePayslip(emp.annual_ctc, working_days, actual_present, taxOpts);

    const result = db.prepare(`
        INSERT OR REPLACE INTO payslips (employee_id, month, year, working_days, present_days, earnings, deductions, employer_contributions, gross_earnings, total_deductions, net_pay, generated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        employee_id, month, year, working_days, actual_present,
        JSON.stringify(payslipData.earnings),
        JSON.stringify(payslipData.deductions),
        JSON.stringify({ employerPF: payslipData.employerPF, employerESI: payslipData.employerESI, regime: taxOpts.regime, totalExemptions: taxOpts.totalExemptions, tdsAnnual: payslipData.tdsAnnual }),
        payslipData.earnings.grossEarnings,
        payslipData.deductions.totalDeductions,
        payslipData.netPay,
        req.user.id
    );

    res.json({ id: result.lastInsertRowid, payslip: payslipData, message: `Payslip generated (${taxOpts.regime} regime, exemptions: ₹${taxOpts.totalExemptions})` });
});

// Bulk generate payslips for all active employees
app.post('/api/payslips/generate-bulk', auth, requireRole('admin', 'accountant'), (req, res) => {
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'Month and year required' });

    // Auto-calculate working days from calendar
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    let weekends = 0;
    for (let d = 1; d <= totalDaysInMonth; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        if (dow === 0 || dow === 6) weekends++;
    }
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const allHolidays = db.prepare('SELECT * FROM company_holidays WHERE date LIKE ?').all(`${monthStr}%`);
    const holidayDates = [];
    let holidaysOnWeekdays = 0;
    for (const h of allHolidays) {
        const dow = parseLocalDate(h.date).getDay();
        if (dow !== 0 && dow !== 6) {
            holidaysOnWeekdays++;
            holidayDates.push(h.date);
        }
    }
    const working_days = totalDaysInMonth - weekends - holidaysOnWeekdays;

    const employees = db.prepare('SELECT * FROM employees WHERE status = ? AND annual_ctc > 0').all('active');
    let generated = 0, skipped = 0;

    for (const emp of employees) {
        const exists = db.prepare('SELECT id FROM payslips WHERE employee_id = ? AND month = ? AND year = ?').get(emp.id, month, year);
        if (exists) { skipped++; continue; }

        // Calculate leave days for this month (only on working days)
        const approvedLeaves = db.prepare(`
            SELECT * FROM leaves WHERE employee_id = ? AND status = 'approved'
            AND ((from_date <= ? AND to_date >= ?) OR (from_date >= ? AND from_date <= ?))
        `).all(
            emp.id,
            `${monthStr}-${String(totalDaysInMonth).padStart(2, '0')}`, `${monthStr}-01`,
            `${monthStr}-01`, `${monthStr}-${String(totalDaysInMonth).padStart(2, '0')}`
        );

        let totalLeaveDays = 0;
        for (const leave of approvedLeaves) {
            const leaveFrom = new Date(Math.max(parseLocalDate(leave.from_date), new Date(year, month - 1, 1)));
            const leaveTo = new Date(Math.min(parseLocalDate(leave.to_date), new Date(year, month - 1, totalDaysInMonth)));
            for (let d = new Date(leaveFrom); d <= leaveTo; d.setDate(d.getDate() + 1)) {
                const dow = d.getDay();
                if (dow === 0 || dow === 6) continue;
                const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                if (holidayDates.includes(dateStr)) continue;
                totalLeaveDays++;
            }
        }

        const presentDays = Math.max(0, working_days - totalLeaveDays);
        const taxOpts = getEmployeeTaxOptions(emp.id, month, year);
        const payslipData = calculatePayslip(emp.annual_ctc, working_days, presentDays, taxOpts);

        db.prepare(`
            INSERT OR REPLACE INTO payslips (employee_id, month, year, working_days, present_days, earnings, deductions, employer_contributions, gross_earnings, total_deductions, net_pay, generated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            emp.id, month, year, working_days, presentDays,
            JSON.stringify(payslipData.earnings),
            JSON.stringify(payslipData.deductions),
            JSON.stringify({ employerPF: payslipData.employerPF, employerESI: payslipData.employerESI, regime: taxOpts.regime, totalExemptions: taxOpts.totalExemptions, tdsAnnual: payslipData.tdsAnnual }),
            payslipData.earnings.grossEarnings,
            payslipData.deductions.totalDeductions,
            payslipData.netPay,
            req.user.id
        );
        generated++;
    }

    res.json({ generated, skipped, total: employees.length, working_days, message: `${generated} payslips generated (${working_days} working days), ${skipped} skipped` });
});

// ============================================================
//  RELIEVING LETTERS (HR creates, Admin approves, HR releases)
// ============================================================
app.get('/api/relieving-letters', auth, requireRole('admin', 'hr'), (req, res) => {
    const letters = db.prepare(`
        SELECT r.*, u.name as created_by_name, a.name as approved_by_name
        FROM relieving_letters r
        LEFT JOIN users u ON r.created_by = u.id
        LEFT JOIN users a ON r.approved_by = a.id
        ORDER BY r.created_at DESC
    `).all();
    res.json(letters);
});

app.get('/api/my/relieving-letter', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(404).json({ error: 'No employee profile found' });
    const letter = db.prepare('SELECT * FROM relieving_letters WHERE employee_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
        .get(emp.id, 'released');
    if (!letter) return res.json(null);
    res.json(letter);
});

app.post('/api/relieving-letters', auth, requireRole('admin', 'hr'), (req, res) => {
    const { employee_id, date_of_leaving, reason } = req.body;
    if (!employee_id || !date_of_leaving) {
        return res.status(400).json({ error: 'Employee and date of leaving are required' });
    }

    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const refNo = generateRelievingRef();
    const result = db.prepare(`
        INSERT INTO relieving_letters (employee_id, reference_no, employee_name, employee_code, designation, department, date_of_joining, date_of_leaving, reason, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(employee_id, refNo, emp.name, emp.employee_code, emp.designation, emp.department, emp.date_of_joining, date_of_leaving, reason || 'Resignation', req.user.id);

    // Update employee date_of_leaving
    db.prepare('UPDATE employees SET date_of_leaving = ? WHERE id = ?').run(date_of_leaving, employee_id);

    res.json({ id: result.lastInsertRowid, reference_no: refNo, message: 'Relieving letter created' });
});

app.put('/api/relieving-letters/:id/approve', auth, requireRole('admin'), (req, res) => {
    db.prepare('UPDATE relieving_letters SET status = ?, approved_by = ?, approved_at = datetime("now") WHERE id = ? AND status = ?')
        .run('approved', req.user.id, req.params.id, 'draft');
    res.json({ message: 'Relieving letter approved' });
});

app.put('/api/relieving-letters/:id/release', auth, requireRole('admin', 'hr'), (req, res) => {
    const letter = db.prepare('SELECT * FROM relieving_letters WHERE id = ? AND status = ?').get(req.params.id, 'approved');
    if (!letter) return res.status(400).json({ error: 'Letter must be approved first' });

    db.prepare('UPDATE relieving_letters SET status = ?, released_at = datetime("now") WHERE id = ?').run('released', req.params.id);
    // Update employee status to inactive
    db.prepare('UPDATE employees SET status = ? WHERE id = ?').run('inactive', letter.employee_id);
    res.json({ message: 'Relieving letter released' });
});

// ============================================================
//  NOTIFICATIONS
// ============================================================
app.get('/api/notifications', auth, (req, res) => {
    const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
    res.json(notifs);
});

app.put('/api/notifications/read', auth, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ message: 'All marked as read' });
});

// ============================================================
//  DASHBOARD STATS
// ============================================================
app.get('/api/dashboard', auth, (req, res) => {
    const stats = {};

    if (['admin', 'hr'].includes(req.user.role)) {
        stats.totalEmployees = db.prepare('SELECT COUNT(*) as c FROM employees WHERE status != ?').get('terminated').c;
        stats.activeEmployees = db.prepare('SELECT COUNT(*) as c FROM employees WHERE status = ?').get('active').c;
        stats.pendingOffers = db.prepare('SELECT COUNT(*) as c FROM offer_letters WHERE status IN (?, ?)').get('draft', 'pending_approval').c;
        stats.pendingLeaves = db.prepare('SELECT COUNT(*) as c FROM leaves WHERE status = ?').get('pending').c;
        stats.openTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('open','in_progress','reopened')").get().c;
    }
    if (['admin', 'manager'].includes(req.user.role)) {
        stats.pendingTimesheets = db.prepare('SELECT COUNT(*) as c FROM timesheets WHERE status = ?').get('submitted').c;
        stats.pendingLeaveApprovals = db.prepare('SELECT COUNT(*) as c FROM leaves WHERE status = ?').get('pending').c;
        stats.pendingOfferApprovals = db.prepare('SELECT COUNT(*) as c FROM offer_letters WHERE status = ?').get('pending_approval').c;
    }
    if (['admin', 'accountant'].includes(req.user.role)) {
        const now = new Date();
        stats.payslipsThisMonth = db.prepare('SELECT COUNT(*) as c FROM payslips WHERE month = ? AND year = ?').get(now.getMonth() + 1, now.getFullYear()).c;
        stats.totalActiveWithCTC = db.prepare('SELECT COUNT(*) as c FROM employees WHERE status = ? AND annual_ctc > 0').get('active').c;
    }
    if (req.user.role === 'employee') {
        const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
        if (emp) {
            const year = new Date().getFullYear();
            stats.leaveBalance = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?').get(emp.id, year);
            stats.pendingLeaves = db.prepare('SELECT COUNT(*) as c FROM leaves WHERE employee_id = ? AND status = ?').get(emp.id, 'pending').c;
            stats.pendingTimesheets = db.prepare('SELECT COUNT(*) as c FROM timesheets WHERE employee_id = ? AND status IN (?, ?)').get(emp.id, 'draft', 'rejected').c;
            stats.totalPayslips = db.prepare('SELECT COUNT(*) as c FROM payslips WHERE employee_id = ?').get(emp.id).c;
            stats.openTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE raised_by = ? AND status IN ('open','in_progress','reopened')").get(req.user.id).c;
        }
    }

    // Unread notifications
    stats.unreadNotifications = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;

    res.json(stats);
});

// ============================================================
//  MY PROFILE (Employee self-service)
// ============================================================
app.get('/api/my/profile', auth, (req, res) => {
    const emp = db.prepare(`
        SELECT e.*, u.email as login_email
        FROM employees e JOIN users u ON e.user_id = u.id
        WHERE e.user_id = ?
    `).get(req.user.id);
    if (!emp) return res.json(null);
    res.json(emp);
});

// Update emergency contact (employee self-service)
app.put('/api/my/emergency-contact', auth, (req, res) => {
    const { emergency_contact, emergency_phone } = req.body;
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(404).json({ error: 'Employee profile not found' });
    db.prepare("UPDATE employees SET emergency_contact = ?, emergency_phone = ?, updated_at = datetime('now') WHERE id = ?")
        .run(emergency_contact, emergency_phone, emp.id);
    res.json({ message: 'Emergency contact updated' });
});

// ============================================================
//  COMPANY HOLIDAYS
// ============================================================

// Get holidays (all users)
app.get('/api/holidays', auth, (req, res) => {
    const year = req.query.year || new Date().getFullYear();
    const holidays = db.prepare('SELECT * FROM company_holidays WHERE year = ? ORDER BY date').all(year);
    res.json(holidays);
});

// Admin: Create holiday
app.post('/api/holidays', auth, requireRole('admin', 'hr'), (req, res) => {
    const { name, date, type } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'Name and date required' });
    const d = new Date(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = days[d.getDay()];
    const year = d.getFullYear();
    const result = db.prepare('INSERT INTO company_holidays (name, date, day_of_week, type, year) VALUES (?, ?, ?, ?, ?)')
        .run(name, date, dayOfWeek, type || 'company', year);
    res.json({ id: result.lastInsertRowid, message: 'Holiday added' });
});

// Admin: Delete holiday
app.delete('/api/holidays/:id', auth, requireRole('admin', 'hr'), (req, res) => {
    db.prepare('DELETE FROM company_holidays WHERE id = ?').run(req.params.id);
    res.json({ message: 'Holiday deleted' });
});

// ============================================================
//  TAX DECLARATIONS (Indian IT Act)
// ============================================================

// Tax sections config — Indian Government exemptions
const TAX_SECTIONS = {
    '80C': {
        name: 'Section 80C — Investments & Savings',
        maxLimit: 150000,
        categories: [
            { id: 'ppf', name: 'Public Provident Fund (PPF)', maxLimit: 150000 },
            { id: 'elss', name: 'ELSS Mutual Funds', maxLimit: 150000 },
            { id: 'lic', name: 'Life Insurance Premium (LIC)', maxLimit: 150000 },
            { id: 'nsc', name: 'National Savings Certificate (NSC)', maxLimit: 150000 },
            { id: 'tuition_fees', name: 'Children Tuition Fees (max 2 children)', maxLimit: 150000 },
            { id: 'home_loan_principal', name: 'Home Loan Principal Repayment', maxLimit: 150000 },
            { id: 'sukanya', name: 'Sukanya Samriddhi Yojana', maxLimit: 150000 },
            { id: 'tax_saving_fd', name: '5-Year Tax Saving FD', maxLimit: 150000 },
            { id: 'epf_voluntary', name: 'Voluntary Provident Fund (VPF)', maxLimit: 150000 },
        ]
    },
    '80CCD1B': {
        name: 'Section 80CCD(1B) — NPS',
        maxLimit: 50000,
        categories: [
            { id: 'nps', name: 'National Pension Scheme (NPS) — Additional', maxLimit: 50000 },
        ]
    },
    '80D': {
        name: 'Section 80D — Medical Insurance',
        maxLimit: 100000,
        categories: [
            { id: 'self_family_insurance', name: 'Self & Family Medical Insurance', maxLimit: 25000 },
            { id: 'parents_insurance', name: 'Parents Medical Insurance', maxLimit: 50000 },
            { id: 'parents_senior_insurance', name: 'Parents (Senior Citizen 60+) Insurance', maxLimit: 50000 },
            { id: 'preventive_checkup', name: 'Preventive Health Checkup', maxLimit: 5000 },
        ]
    },
    '80E': {
        name: 'Section 80E — Education Loan Interest',
        maxLimit: null,
        categories: [
            { id: 'edu_loan_interest', name: 'Education Loan Interest (no limit, up to 8 years)', maxLimit: null },
        ]
    },
    '80G': {
        name: 'Section 80G — Donations',
        maxLimit: null,
        categories: [
            { id: 'donation_100', name: 'Donations (100% Exemption) — PM Relief Fund etc.', maxLimit: null },
            { id: 'donation_50', name: 'Donations (50% Exemption) — Charitable orgs', maxLimit: null },
        ]
    },
    '80TTA': {
        name: 'Section 80TTA — Savings Interest',
        maxLimit: 10000,
        categories: [
            { id: 'savings_interest', name: 'Savings Account Interest', maxLimit: 10000 },
        ]
    },
    'HRA': {
        name: 'HRA Exemption — Section 10(13A)',
        maxLimit: null,
        categories: [
            { id: 'hra_rent', name: 'Monthly Rent Paid', maxLimit: null },
        ]
    },
    '24B': {
        name: 'Section 24(b) — Home Loan Interest',
        maxLimit: 200000,
        categories: [
            { id: 'home_loan_interest', name: 'Home Loan Interest (Self-Occupied)', maxLimit: 200000 },
        ]
    },
    'LTA': {
        name: 'LTA — Leave Travel Allowance',
        maxLimit: null,
        categories: [
            { id: 'lta', name: 'Leave Travel Allowance (actual travel)', maxLimit: null },
        ]
    },
    '80EEB': {
        name: 'Section 80EEB — Electric Vehicle Loan',
        maxLimit: 150000,
        categories: [
            { id: 'ev_loan_interest', name: 'EV Loan Interest Deduction', maxLimit: 150000 },
        ]
    },
};

// Get tax sections config
app.get('/api/tax/sections', auth, (req, res) => {
    res.json(TAX_SECTIONS);
});

// Get current FY
function getCurrentFY() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (month >= 3) return `${year}-${year + 1}`;
    return `${year - 1}-${year}`;
}

// Employee: Get or create their tax declaration for current FY
app.get('/api/my/tax-declaration', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.json(null);

    const fy = req.query.fy || getCurrentFY();
    let decl = db.prepare('SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ?').get(emp.id, fy);

    if (!decl) {
        // Auto-create draft
        db.prepare('INSERT INTO tax_declarations (employee_id, financial_year, regime) VALUES (?, ?, ?)').run(emp.id, fy, 'new');
        decl = db.prepare('SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ?').get(emp.id, fy);
    }

    const items = db.prepare('SELECT * FROM tax_declaration_items WHERE declaration_id = ? ORDER BY section, category').all(decl.id);
    res.json({ declaration: decl, items });
});

// Employee: Choose regime
app.put('/api/my/tax-declaration/regime', auth, (req, res) => {
    const { regime } = req.body;
    if (!['old', 'new'].includes(regime)) return res.status(400).json({ error: 'Invalid regime' });
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const fy = getCurrentFY();
    const decl = db.prepare('SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ?').get(emp.id, fy);
    if (!decl) return res.status(404).json({ error: 'Declaration not found' });
    if (decl.status !== 'draft') return res.status(400).json({ error: 'Cannot change regime after submission' });

    db.prepare("UPDATE tax_declarations SET regime = ?, updated_at = datetime('now') WHERE id = ?").run(regime, decl.id);
    res.json({ message: `Regime changed to ${regime}` });
});

// Employee: Save/update a tax declaration item
app.post('/api/my/tax-declaration/item', auth, (req, res) => {
    const { section, category, description, declared_amount } = req.body;
    if (!section || !category) return res.status(400).json({ error: 'Section and category required' });

    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const fy = getCurrentFY();
    const decl = db.prepare('SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ?').get(emp.id, fy);
    if (!decl) return res.status(404).json({ error: 'Declaration not found' });
    if (decl.status !== 'draft') return res.status(400).json({ error: 'Cannot edit after submission' });

    // Upsert
    const existing = db.prepare('SELECT id FROM tax_declaration_items WHERE declaration_id = ? AND section = ? AND category = ?').get(decl.id, section, category);
    if (existing) {
        db.prepare('UPDATE tax_declaration_items SET declared_amount = ?, description = ? WHERE id = ?')
            .run(parseFloat(declared_amount) || 0, description || '', existing.id);
    } else {
        db.prepare('INSERT INTO tax_declaration_items (declaration_id, section, category, description, declared_amount) VALUES (?, ?, ?, ?, ?)')
            .run(decl.id, section, category, description || '', parseFloat(declared_amount) || 0);
    }

    // Update total
    const total = db.prepare('SELECT COALESCE(SUM(declared_amount), 0) as total FROM tax_declaration_items WHERE declaration_id = ?').get(decl.id);
    db.prepare("UPDATE tax_declarations SET total_declared = ?, updated_at = datetime('now') WHERE id = ?").run(total.total, decl.id);

    res.json({ message: 'Item saved' });
});

// Employee: Upload proof for a tax item
const taxProofUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(uploadsDir, 'tax-proofs');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPG, PNG, WebP and PDF files are allowed'));
    }
});

app.post('/api/my/tax-declaration/upload/:itemId', auth, taxProofUpload.single('proof'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Proof file is required' });
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const item = db.prepare(`
        SELECT tdi.* FROM tax_declaration_items tdi
        JOIN tax_declarations td ON tdi.declaration_id = td.id
        WHERE tdi.id = ? AND td.employee_id = ?
    `).get(req.params.itemId, emp.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const filePath = 'tax-proofs/' + req.file.filename;
    db.prepare('UPDATE tax_declaration_items SET proof_file = ?, proof_name = ? WHERE id = ?')
        .run(filePath, req.file.originalname, req.params.itemId);
    res.json({ message: 'Proof uploaded' });
});

// Employee: Save HRA details (separate because it has extra fields)
app.post('/api/my/tax-declaration/hra', auth, (req, res) => {
    const { monthly_rent, landlord_name, landlord_pan, rental_city } = req.body;
    const emp = db.prepare('SELECT id, annual_ctc FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const fy = getCurrentFY();
    const decl = db.prepare('SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ?').get(emp.id, fy);
    if (!decl || decl.status !== 'draft') return res.status(400).json({ error: 'Cannot edit' });

    const annualRent = (parseFloat(monthly_rent) || 0) * 12;
    const desc = JSON.stringify({ monthly_rent, landlord_name, landlord_pan, rental_city, annual_rent: annualRent });

    // Calculate HRA exemption (Old Regime only)
    const basicAnnual = Math.round(emp.annual_ctc * 0.40);
    const hraReceived = Math.round(basicAnnual * 0.50);
    const isMetro = ['hyderabad', 'mumbai', 'delhi', 'kolkata', 'chennai', 'bangalore', 'bengaluru'].includes((rental_city || '').toLowerCase());
    const hraExempt = Math.min(
        hraReceived,
        annualRent - Math.round(basicAnnual * 0.10),
        Math.round(basicAnnual * (isMetro ? 0.50 : 0.40))
    );

    const existing = db.prepare("SELECT id FROM tax_declaration_items WHERE declaration_id = ? AND section = 'HRA' AND category = 'hra_rent'").get(decl.id);
    if (existing) {
        db.prepare('UPDATE tax_declaration_items SET declared_amount = ?, description = ? WHERE id = ?')
            .run(Math.max(0, hraExempt), desc, existing.id);
    } else {
        db.prepare('INSERT INTO tax_declaration_items (declaration_id, section, category, description, declared_amount) VALUES (?, ?, ?, ?, ?)')
            .run(decl.id, 'HRA', 'hra_rent', desc, Math.max(0, hraExempt));
    }

    const total = db.prepare('SELECT COALESCE(SUM(declared_amount), 0) as total FROM tax_declaration_items WHERE declaration_id = ?').get(decl.id);
    db.prepare("UPDATE tax_declarations SET total_declared = ?, updated_at = datetime('now') WHERE id = ?").run(total.total, decl.id);

    res.json({ message: 'HRA details saved', hra_exemption: Math.max(0, hraExempt) });
});

// Employee: Submit declaration
app.put('/api/my/tax-declaration/submit', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const fy = getCurrentFY();
    const decl = db.prepare('SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ?').get(emp.id, fy);
    if (!decl || decl.status !== 'draft') return res.status(400).json({ error: 'Cannot submit' });

    db.prepare("UPDATE tax_declarations SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?").run(decl.id);
    res.json({ message: 'Tax declaration submitted for review' });
});

// Admin/HR: Get all tax declarations
app.get('/api/tax-declarations', auth, requireRole('admin', 'hr', 'accountant'), (req, res) => {
    const fy = req.query.fy || getCurrentFY();
    const decls = db.prepare(`
        SELECT td.*, e.name as employee_name, e.employee_code, e.designation, e.department
        FROM tax_declarations td
        JOIN employees e ON td.employee_id = e.id
        WHERE td.financial_year = ?
        ORDER BY td.status, e.name
    `).all(fy);
    res.json(decls);
});

// Admin/HR: Get single declaration detail
app.get('/api/tax-declarations/:id', auth, requireRole('admin', 'hr', 'accountant'), (req, res) => {
    const decl = db.prepare(`
        SELECT td.*, e.name as employee_name, e.employee_code, e.annual_ctc, e.designation, e.department
        FROM tax_declarations td
        JOIN employees e ON td.employee_id = e.id
        WHERE td.id = ?
    `).get(req.params.id);
    if (!decl) return res.status(404).json({ error: 'Not found' });
    const items = db.prepare('SELECT * FROM tax_declaration_items WHERE declaration_id = ? ORDER BY section, category').all(req.params.id);
    res.json({ declaration: decl, items });
});

// Admin/HR: Approve/reject declaration
app.put('/api/tax-declarations/:id/approve', auth, requireRole('admin', 'hr', 'accountant'), (req, res) => {
    const decl = db.prepare('SELECT * FROM tax_declarations WHERE id = ? AND status = ?').get(req.params.id, 'submitted');
    if (!decl) return res.status(400).json({ error: 'Declaration must be submitted first' });
    // Auto-approve all items at declared amount
    db.prepare("UPDATE tax_declaration_items SET approved_amount = declared_amount, status = 'approved' WHERE declaration_id = ?").run(req.params.id);
    const total = db.prepare('SELECT COALESCE(SUM(approved_amount), 0) as total FROM tax_declaration_items WHERE declaration_id = ?').get(req.params.id);
    db.prepare("UPDATE tax_declarations SET status = 'approved', total_approved = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?")
        .run(total.total, req.user.id, req.params.id);
    res.json({ message: 'Tax declaration approved' });
});

app.put('/api/tax-declarations/:id/reject', auth, requireRole('admin', 'hr', 'accountant'), (req, res) => {
    const { reason } = req.body;
    db.prepare("UPDATE tax_declarations SET status = 'rejected', rejection_reason = ? WHERE id = ?").run(reason || 'Please review and resubmit', req.params.id);
    res.json({ message: 'Tax declaration rejected' });
});

// ============================================================
//  SUPPORT TICKETS
// ============================================================

// List tickets — admin/hr/manager see all, employees see their own
app.get('/api/tickets', auth, (req, res) => {
    let query, params;
    if (['admin', 'hr', 'manager'].includes(req.user.role)) {
        query = `SELECT t.*, u.name as raised_by_name, a.name as assigned_to_name, e.employee_code
            FROM tickets t
            LEFT JOIN users u ON t.raised_by = u.id
            LEFT JOIN users a ON t.assigned_to = a.id
            LEFT JOIN employees e ON t.employee_id = e.id
            ORDER BY
                CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                t.created_at DESC`;
        params = [];
    } else {
        query = `SELECT t.*, u.name as raised_by_name, a.name as assigned_to_name
            FROM tickets t
            LEFT JOIN users u ON t.raised_by = u.id
            LEFT JOIN users a ON t.assigned_to = a.id
            WHERE t.raised_by = ?
            ORDER BY t.created_at DESC`;
        params = [req.user.id];
    }
    res.json(db.prepare(query).all(...params));
});

// Get single ticket with comments
app.get('/api/tickets/:id', auth, (req, res) => {
    const ticket = db.prepare(`SELECT t.*, u.name as raised_by_name, a.name as assigned_to_name
        FROM tickets t
        LEFT JOIN users u ON t.raised_by = u.id
        LEFT JOIN users a ON t.assigned_to = a.id
        WHERE t.id = ?`).get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // Employees can only see their own tickets
    if (req.user.role === 'employee' && ticket.raised_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const comments = db.prepare(`SELECT c.*, u.name as user_name, u.role as user_role
        FROM ticket_comments c JOIN users u ON c.user_id = u.id
        WHERE c.ticket_id = ?
        ORDER BY c.created_at ASC`).all(req.params.id);

    // Filter internal notes for employees
    const filteredComments = req.user.role === 'employee'
        ? comments.filter(c => !c.is_internal)
        : comments;

    res.json({ ...ticket, comments: filteredComments });
});

// Create ticket
// Update ticket creation to auto-CC reporting manager
app.post('/api/tickets', auth, (req, res) => {
    const { category, priority, subject, description } = req.body;
    if (!category || !subject || !description) {
        return res.status(400).json({ error: 'Category, subject and description are required' });
    }

    const emp = db.prepare('SELECT e.id, e.reporting_manager_id, rm.user_id as manager_user_id FROM employees e LEFT JOIN employees rm ON e.reporting_manager_id = rm.id WHERE e.user_id = ?').get(req.user.id);
    const ticketNo = generateTicketNo();
    const ccManagerId = emp?.manager_user_id || null;

    const result = db.prepare(`
        INSERT INTO tickets (ticket_no, employee_id, raised_by, category, priority, subject, description, cc_manager_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ticketNo, emp?.id || null, req.user.id, category, priority || 'medium', subject.trim(), description.trim(), ccManagerId);

    // Notify admins
    const admins = db.prepare("SELECT id FROM users WHERE role IN ('admin','hr') AND is_active = 1").all();
    for (const adm of admins) {
        db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)')
            .run(adm.id, 'New Support Ticket', `${ticketNo}: ${subject} [${category}]`, 'warning', '/portal/#tickets');
    }

    // Notify manager (CC)
    if (ccManagerId) {
        db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)')
            .run(ccManagerId, 'Ticket CC', `Your team member raised ${ticketNo}: ${subject}`, 'info', '/portal/#tickets');
    }

    res.json({ id: result.lastInsertRowid, ticket_no: ticketNo, message: 'Ticket raised successfully' });
});

// Add comment to ticket
app.post('/api/tickets/:id/comment', auth, (req, res) => {
    const { comment, is_internal } = req.body;
    if (!comment) return res.status(400).json({ error: 'Comment is required' });

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // Employees can only comment on their own tickets and can't add internal notes
    if (req.user.role === 'employee') {
        if (ticket.raised_by !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('INSERT INTO ticket_comments (ticket_id, user_id, comment, is_internal) VALUES (?, ?, ?, ?)')
        .run(req.params.id, req.user.id, comment.trim(), (is_internal && req.user.role !== 'employee') ? 1 : 0);

    db.prepare("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    res.json({ message: 'Comment added' });
});

// Update ticket status (admin/hr/manager)
app.put('/api/tickets/:id/status', auth, requireRole('admin', 'hr', 'manager'), (req, res) => {
    const { status, resolution } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const updates = ["status = ?", "updated_at = datetime('now')"];
    const values = [status];

    if (status === 'resolved') {
        updates.push('resolved_by = ?', "resolved_at = datetime('now')");
        values.push(req.user.id);
        if (resolution) { updates.push('resolution = ?'); values.push(resolution); }
    }
    if (status === 'closed') {
        updates.push("closed_at = datetime('now')");
    }

    values.push(req.params.id);
    db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Notify the ticket raiser
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (ticket) {
        const statusLabel = status.replace(/_/g, ' ');
        db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)')
            .run(ticket.raised_by, 'Ticket Updated', `${ticket.ticket_no} is now ${statusLabel}`, 'info', '/portal/#my-tickets');
    }

    res.json({ message: 'Ticket updated' });
});

// Assign ticket (admin/hr)
app.put('/api/tickets/:id/assign', auth, requireRole('admin', 'hr'), (req, res) => {
    const { assigned_to } = req.body;
    db.prepare("UPDATE tickets SET assigned_to = ?, status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, updated_at = datetime('now') WHERE id = ?")
        .run(assigned_to, req.params.id);
    res.json({ message: 'Ticket assigned' });
});

// Employee reopen ticket
app.put('/api/tickets/:id/reopen', auth, (req, res) => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user.role === 'employee' && ticket.raised_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
    }
    if (!['resolved', 'closed'].includes(ticket.status)) {
        return res.status(400).json({ error: 'Only resolved/closed tickets can be reopened' });
    }
    db.prepare("UPDATE tickets SET status = 'reopened', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ message: 'Ticket reopened' });
});

// ============================================================
//  BACKGROUND VERIFICATION (BGV)
// ============================================================

// BGV-specific multer config
const bgvStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const inviteId = req.bgvInvite ? req.bgvInvite.id : 'unknown';
        const subDir = path.join(uploadsDir, 'bgv-docs', String(inviteId));
        if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
        cb(null, subDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
        cb(null, safeName);
    }
});
const bgvUpload = multer({
    storage: bgvStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPG, PNG, WebP and PDF files are allowed'));
    }
});

// BGV Auth middleware (candidate token-based)
function bgvAuth(req, res, next) {
    const token = req.headers['x-bgv-token'];
    if (!token) return res.status(401).json({ error: 'BGV access token required' });
    const invite = db.prepare('SELECT * FROM bgv_invites WHERE access_token = ?').get(token);
    if (!invite) return res.status(401).json({ error: 'Invalid or expired BGV token' });
    if (invite.status === 'submitted' || invite.status === 'verified') {
        return res.status(400).json({ error: 'BGV form already submitted' });
    }
    req.bgvInvite = invite;
    next();
}

// --- Admin: Create BGV invite for a released offer ---
app.post('/api/bgv/invite', auth, requireRole('admin', 'hr'), (req, res) => {
    const { offer_id, candidate_email } = req.body;
    if (!offer_id || !candidate_email) return res.status(400).json({ error: 'Offer ID and candidate email required' });

    const offer = db.prepare('SELECT * FROM offer_letters WHERE id = ? AND status = ?').get(offer_id, 'released');
    if (!offer) return res.status(400).json({ error: 'Offer must be released before sending BGV invite' });

    // Check if invite already exists
    const existing = db.prepare('SELECT * FROM bgv_invites WHERE offer_id = ?').get(offer_id);
    if (existing) return res.status(400).json({ error: 'BGV invite already sent for this offer', invite: existing });

    const tempPassword = generateTempPassword();
    const accessToken = generateBGVToken();
    const hashedPwd = bcrypt.hashSync(tempPassword, 10);

    const result = db.prepare(`
        INSERT INTO bgv_invites (offer_id, candidate_name, candidate_email, temp_password, access_token, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(offer_id, offer.employee_name, candidate_email, hashedPwd, accessToken, req.user.id);

    res.json({
        id: result.lastInsertRowid,
        candidate_name: offer.employee_name,
        candidate_email,
        temp_password: tempPassword,
        bgv_link: `/portal/bgv.html?token=${accessToken}`,
        message: 'BGV invite created. Share the link and temporary password with the candidate.'
    });
});

// --- Admin: Get all BGV invites ---
app.get('/api/bgv/invites', auth, requireRole('admin', 'hr'), (req, res) => {
    const invites = db.prepare(`
        SELECT bi.*, ol.reference_no, ol.designation, ol.department
        FROM bgv_invites bi
        JOIN offer_letters ol ON bi.offer_id = ol.id
        ORDER BY bi.created_at DESC
    `).all();
    res.json(invites);
});

// --- Admin: Get single BGV submission details ---
app.get('/api/bgv/invites/:id', auth, requireRole('admin', 'hr'), (req, res) => {
    const invite = db.prepare(`
        SELECT bi.*, ol.reference_no, ol.designation, ol.department, ol.employee_name, ol.annual_ctc
        FROM bgv_invites bi
        JOIN offer_letters ol ON bi.offer_id = ol.id
        WHERE bi.id = ?
    `).get(req.params.id);
    if (!invite) return res.status(404).json({ error: 'BGV invite not found' });

    const submissions = db.prepare('SELECT * FROM bgv_submissions WHERE invite_id = ? ORDER BY section').all(req.params.id);
    const documents = db.prepare('SELECT * FROM bgv_documents WHERE invite_id = ? ORDER BY section, doc_type').all(req.params.id);

    res.json({ invite, submissions, documents });
});

// --- Admin: Verify or reject BGV ---
app.put('/api/bgv/invites/:id/verify', auth, requireRole('admin', 'hr'), (req, res) => {
    const invite = db.prepare('SELECT * FROM bgv_invites WHERE id = ? AND status = ?').get(req.params.id, 'submitted');
    if (!invite) return res.status(400).json({ error: 'BGV must be submitted before verification' });
    db.prepare("UPDATE bgv_invites SET status = 'verified', verified_by = ?, verified_at = datetime('now') WHERE id = ?").run(req.user.id, req.params.id);
    res.json({ message: 'BGV verified successfully' });
});

app.put('/api/bgv/invites/:id/reject', auth, requireRole('admin', 'hr'), (req, res) => {
    const { reason } = req.body;
    const invite = db.prepare('SELECT * FROM bgv_invites WHERE id = ? AND status = ?').get(req.params.id, 'submitted');
    if (!invite) return res.status(400).json({ error: 'BGV must be submitted before rejection' });
    db.prepare("UPDATE bgv_invites SET status = 'rejected', rejection_reason = ? WHERE id = ?").run(reason || 'Documents not satisfactory', req.params.id);
    res.json({ message: 'BGV rejected' });
});

// --- Candidate: Login with email + temp password ---
app.post('/api/bgv/login', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const invite = db.prepare('SELECT * FROM bgv_invites WHERE candidate_email = ? AND status IN (?, ?)').get(email, 'pending', 'in_progress');
    if (!invite) return res.status(401).json({ error: 'Invalid credentials or BGV form already submitted' });

    if (!bcrypt.compareSync(password, invite.temp_password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Mark as in_progress
    if (invite.status === 'pending') {
        db.prepare("UPDATE bgv_invites SET status = 'in_progress' WHERE id = ?").run(invite.id);
    }

    res.json({
        access_token: invite.access_token,
        candidate_name: invite.candidate_name,
        candidate_email: invite.candidate_email,
        message: 'Login successful'
    });
});

// --- Candidate: Get their progress ---
app.get('/api/bgv/progress', bgvAuth, (req, res) => {
    const submissions = db.prepare('SELECT section FROM bgv_submissions WHERE invite_id = ?').all(req.bgvInvite.id);
    const completedSections = submissions.map(s => s.section);
    res.json({
        candidate_name: req.bgvInvite.candidate_name,
        status: req.bgvInvite.status,
        completedSections
    });
});

// --- Candidate: Save a section ---
app.post('/api/bgv/section/:section', bgvAuth, (req, res) => {
    const validSections = ['personal', 'emergency', 'family', 'address', 'edu_10th', 'edu_12th', 'edu_graduation', 'edu_pg', 'address_proofs', 'declaration'];
    const section = req.params.section;
    if (!validSections.includes(section)) return res.status(400).json({ error: 'Invalid section' });

    const data = JSON.stringify(req.body);
    db.prepare(`
        INSERT INTO bgv_submissions (invite_id, section, data) VALUES (?, ?, ?)
        ON CONFLICT(invite_id, section) DO UPDATE SET data = ?, updated_at = datetime('now')
    `).run(req.bgvInvite.id, section, data, data);

    res.json({ message: `Section '${section}' saved` });
});

// --- Candidate: Upload document for a section ---
app.post('/api/bgv/upload/:section', bgvAuth, bgvUpload.single('document'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Document file is required' });
    const { section } = req.params;
    const docType = req.body.doc_type || section;

    const filePath = `bgv-docs/${req.bgvInvite.id}/${req.file.filename}`;

    // Remove old doc of same type if re-uploading
    db.prepare('DELETE FROM bgv_documents WHERE invite_id = ? AND section = ? AND doc_type = ?').run(req.bgvInvite.id, section, docType);

    db.prepare(`
        INSERT INTO bgv_documents (invite_id, section, doc_type, file_path, original_name)
        VALUES (?, ?, ?, ?, ?)
    `).run(req.bgvInvite.id, section, docType, filePath, req.file.originalname);

    res.json({ message: 'Document uploaded' });
});

// --- Candidate: Get a section's saved data ---
app.get('/api/bgv/section/:section', bgvAuth, (req, res) => {
    const sub = db.prepare('SELECT * FROM bgv_submissions WHERE invite_id = ? AND section = ?').get(req.bgvInvite.id, req.params.section);
    const docs = db.prepare('SELECT * FROM bgv_documents WHERE invite_id = ? AND section = ?').all(req.bgvInvite.id, req.params.section);
    res.json({ data: sub ? JSON.parse(sub.data) : null, documents: docs });
});

// --- Candidate: Final submit ---
app.post('/api/bgv/submit', bgvAuth, (req, res) => {
    // Check all required sections are completed
    const required = ['personal', 'emergency', 'family', 'address', 'edu_10th', 'edu_12th', 'edu_graduation', 'address_proofs', 'declaration'];
    const completed = db.prepare('SELECT section FROM bgv_submissions WHERE invite_id = ?').all(req.bgvInvite.id).map(s => s.section);

    const missing = required.filter(s => !completed.includes(s));
    if (missing.length > 0) {
        return res.status(400).json({ error: `Missing sections: ${missing.join(', ')}`, missing });
    }

    // Check declaration agreement
    const declaration = db.prepare('SELECT data FROM bgv_submissions WHERE invite_id = ? AND section = ?').get(req.bgvInvite.id, 'declaration');
    if (declaration) {
        const decData = JSON.parse(declaration.data);
        if (!decData.agreed) return res.status(400).json({ error: 'You must agree to the declaration' });
    }

    // Check at least 2 address proofs uploaded
    const proofDocs = db.prepare("SELECT * FROM bgv_documents WHERE invite_id = ? AND section = 'address_proofs'").all(req.bgvInvite.id);
    if (proofDocs.length < 2) {
        return res.status(400).json({ error: 'At least 2 address proof documents are required' });
    }

    db.prepare("UPDATE bgv_invites SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?").run(req.bgvInvite.id);
    res.json({ message: 'BGV form submitted successfully! HR will review your documents.' });
});

// --- Admin: Check if offer has BGV invite ---
app.get('/api/bgv/by-offer/:offerId', auth, requireRole('admin', 'hr'), (req, res) => {
    const invite = db.prepare('SELECT * FROM bgv_invites WHERE offer_id = ?').get(req.params.offerId);
    res.json(invite || null);
});

// ============================================================
//  EMPLOYEE FEED / CHAT
// ============================================================
app.get('/api/feed', auth, (req, res) => {
    const posts = db.prepare(`
        SELECT fp.*, u.name as author_name, u.role as author_role,
            (SELECT COUNT(*) FROM feed_likes WHERE post_id = fp.id) as like_count,
            (SELECT COUNT(*) FROM feed_comments WHERE post_id = fp.id) as comment_count,
            (SELECT COUNT(*) FROM feed_likes WHERE post_id = fp.id AND user_id = ?) as liked_by_me
        FROM feed_posts fp JOIN users u ON fp.user_id = u.id
        ORDER BY fp.created_at DESC LIMIT 50
    `).all(req.user.id);
    res.json(posts);
});

app.post('/api/feed', auth, (req, res) => {
    const { content, type } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required' });
    // Only admin/hr can post announcements
    const postType = (type === 'announcement' && ['admin','hr'].includes(req.user.role)) ? 'announcement' : 'general';
    const result = db.prepare('INSERT INTO feed_posts (user_id, content, type) VALUES (?, ?, ?)').run(req.user.id, content.trim(), postType);
    res.json({ id: result.lastInsertRowid, message: 'Posted successfully' });
});

app.post('/api/feed/:id/like', auth, (req, res) => {
    const existing = db.prepare('SELECT id FROM feed_likes WHERE post_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (existing) {
        db.prepare('DELETE FROM feed_likes WHERE post_id = ? AND user_id = ?').run(req.params.id, req.user.id);
        res.json({ liked: false });
    } else {
        db.prepare('INSERT INTO feed_likes (post_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
        res.json({ liked: true });
    }
});

app.get('/api/feed/:id/comments', auth, (req, res) => {
    const comments = db.prepare('SELECT fc.*, u.name as author_name FROM feed_comments fc JOIN users u ON fc.user_id = u.id WHERE fc.post_id = ? ORDER BY fc.created_at ASC').all(req.params.id);
    res.json(comments);
});

app.post('/api/feed/:id/comment', auth, (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment is required' });
    db.prepare('INSERT INTO feed_comments (post_id, user_id, content) VALUES (?, ?, ?)').run(req.params.id, req.user.id, content.trim());
    res.json({ message: 'Comment added' });
});

app.delete('/api/feed/:id', auth, (req, res) => {
    const post = db.prepare('SELECT * FROM feed_posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.user_id !== req.user.id && !['admin','hr'].includes(req.user.role)) return res.status(403).json({ error: 'Not authorized' });
    db.prepare('DELETE FROM feed_comments WHERE post_id = ?').run(req.params.id);
    db.prepare('DELETE FROM feed_likes WHERE post_id = ?').run(req.params.id);
    db.prepare('DELETE FROM feed_posts WHERE id = ?').run(req.params.id);
    res.json({ message: 'Post deleted' });
});

// ============================================================
//  RESIGNATION / EXIT CLEARANCE
// ============================================================
app.get('/api/resignations', auth, (req, res) => {
    if (req.user.role === 'employee') {
        const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
        if (!emp) return res.json([]);
        const r = db.prepare('SELECT r.*, e.name as employee_name, e.employee_code, e.designation, e.department FROM resignations r JOIN employees e ON r.employee_id = e.id WHERE r.employee_id = ?').all(emp.id);
        return res.json(r);
    }
    const resignations = db.prepare('SELECT r.*, e.name as employee_name, e.employee_code, e.designation, e.department FROM resignations r JOIN employees e ON r.employee_id = e.id ORDER BY r.created_at DESC').all();
    res.json(resignations);
});

app.post('/api/resignations', auth, (req, res) => {
    const emp = db.prepare('SELECT * FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(400).json({ error: 'No employee profile linked' });

    const { reason, personal_email } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason is required' });

    const existing = db.prepare("SELECT id FROM resignations WHERE employee_id = ? AND status NOT IN ('completed','withdrawn')").get(emp.id);
    if (existing) return res.status(400).json({ error: 'You already have a pending resignation' });

    const resignationDate = new Date().toISOString().split('T')[0];
    const lwd = new Date();
    lwd.setDate(lwd.getDate() + 90);
    const lastWorkingDay = lwd.toISOString().split('T')[0];

    const result = db.prepare(`
        INSERT INTO resignations (employee_id, resignation_date, last_working_day, notice_period_days, reason, personal_email)
        VALUES (?, ?, ?, 90, ?, ?)
    `).run(emp.id, resignationDate, lastWorkingDay, reason, personal_email || '');

    // Notify all approvers
    const approvers = db.prepare("SELECT id FROM users WHERE role IN ('admin','hr','manager','accountant') AND is_active = 1").all();
    for (const a of approvers) {
        db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)')
            .run(a.id, 'Resignation Submitted', `${emp.name} (${emp.employee_code}) has submitted resignation. Last working day: ${lastWorkingDay}`, 'warning', '/portal/#resignations');
    }

    res.json({ id: result.lastInsertRowid, last_working_day: lastWorkingDay, message: `Resignation submitted. Notice period: 90 days. Last working day: ${lastWorkingDay}` });
});

app.put('/api/resignations/:id/approve/:dept', auth, (req, res) => {
    const { dept } = req.params;
    const validDepts = { manager: 'manager', hr: 'hr', finance: 'finance', admin: 'admin' };
    if (!validDepts[dept]) return res.status(400).json({ error: 'Invalid department' });

    const roleMap = { manager: ['admin','manager'], hr: ['admin','hr'], finance: ['admin','accountant'], admin: ['admin'] };
    if (!roleMap[dept].includes(req.user.role)) return res.status(403).json({ error: 'Not authorized for this approval' });

    const resign = db.prepare('SELECT * FROM resignations WHERE id = ?').get(req.params.id);
    if (!resign) return res.status(404).json({ error: 'Resignation not found' });

    const remarks = req.body.remarks || '';
    db.prepare(`UPDATE resignations SET ${dept}_approval = 1, ${dept}_approved_by = ?, ${dept}_approved_at = datetime('now'), remarks = COALESCE(remarks, '') || ? WHERE id = ?`)
        .run(req.user.id, remarks ? `\n[${dept.toUpperCase()}]: ${remarks}` : '', req.params.id);

    // Check if all approvals done
    const updated = db.prepare('SELECT * FROM resignations WHERE id = ?').get(req.params.id);
    if (updated.manager_approval && updated.hr_approval && updated.finance_approval && updated.admin_approval) {
        db.prepare("UPDATE resignations SET status = 'completed' WHERE id = ?").run(req.params.id);
        // Update employee status
        db.prepare("UPDATE employees SET status = 'inactive', date_of_leaving = ? WHERE id = ?").run(updated.last_working_day, updated.employee_id);
    }

    res.json({ message: `${dept} approval granted` });
});

app.put('/api/resignations/:id/withdraw', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(400).json({ error: 'No employee profile' });
    const resign = db.prepare("SELECT * FROM resignations WHERE id = ? AND employee_id = ? AND status = 'submitted'").get(req.params.id, emp.id);
    if (!resign) return res.status(400).json({ error: 'Cannot withdraw - resignation not found or already processed' });
    db.prepare("UPDATE resignations SET status = 'withdrawn' WHERE id = ?").run(req.params.id);
    res.json({ message: 'Resignation withdrawn' });
});

// ============================================================
//  MANDATORY TRAINING
// ============================================================
app.get('/api/training/modules', auth, (req, res) => {
    const modules = db.prepare('SELECT * FROM training_modules WHERE is_active = 1 ORDER BY type, title').all();
    res.json(modules);
});

app.get('/api/training/my-assignments', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.json([]);
    const assignments = db.prepare(`
        SELECT ta.*, tm.title, tm.description, tm.type, tm.content_type, tm.slides, tm.duration_minutes, tm.passing_score
        FROM training_assignments ta
        JOIN training_modules tm ON ta.module_id = tm.id
        WHERE ta.employee_id = ? ORDER BY ta.status, ta.assigned_date DESC
    `).all(emp.id);
    res.json(assignments);
});

app.get('/api/training/assignments', auth, requireRole('admin', 'hr'), (req, res) => {
    const assignments = db.prepare(`
        SELECT ta.*, tm.title as module_title, tm.type as module_type, e.name as employee_name, e.employee_code
        FROM training_assignments ta
        JOIN training_modules tm ON ta.module_id = tm.id
        JOIN employees e ON ta.employee_id = e.id
        ORDER BY ta.status, ta.assigned_date DESC
    `).all();
    res.json(assignments);
});

app.post('/api/training/assign', auth, requireRole('admin', 'hr'), (req, res) => {
    const { employee_id, module_id, due_date } = req.body;
    if (!employee_id || !module_id) return res.status(400).json({ error: 'Employee and module required' });
    try {
        db.prepare('INSERT INTO training_assignments (employee_id, module_id, due_date) VALUES (?, ?, ?)').run(employee_id, module_id, due_date || null);
        res.json({ message: 'Training assigned' });
    } catch (e) {
        if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Training already assigned to this employee' });
        throw e;
    }
});

app.post('/api/training/assign-all-new', auth, requireRole('admin', 'hr'), (req, res) => {
    // Assign all onboarding + security modules to all active employees who don't have them
    const modules = db.prepare("SELECT id FROM training_modules WHERE type IN ('onboarding','security','compliance') AND is_active = 1").all();
    const employees = db.prepare("SELECT id FROM employees WHERE status = 'active'").all();
    let assigned = 0;
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split('T')[0];
    for (const emp of employees) {
        for (const mod of modules) {
            try {
                db.prepare('INSERT INTO training_assignments (employee_id, module_id, due_date) VALUES (?, ?, ?)').run(emp.id, mod.id, dueDateStr);
                assigned++;
            } catch (e) { /* already assigned */ }
        }
    }
    res.json({ assigned, message: `${assigned} training(s) assigned` });
});

app.put('/api/training/complete/:assignmentId', auth, (req, res) => {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
    if (!emp) return res.status(400).json({ error: 'No employee profile' });
    const assignment = db.prepare('SELECT ta.*, tm.title FROM training_assignments ta JOIN training_modules tm ON ta.module_id = tm.id WHERE ta.id = ? AND ta.employee_id = ?').get(req.params.assignmentId, emp.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    const certRef = `CERT/${emp.id}/${assignment.module_id}/${new Date().getFullYear()}`;
    db.prepare("UPDATE training_assignments SET status = 'completed', completed_at = datetime('now'), score = 100, certificate_ref = ? WHERE id = ?").run(certRef, req.params.assignmentId);
    res.json({ message: 'Training completed!', certificate_ref: certRef });
});

// ============================================================
//  FORM 16 GENERATION
// ============================================================
app.get('/api/form16', auth, (req, res) => {
    if (req.user.role === 'employee') {
        const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
        if (!emp) return res.json([]);
        return res.json(db.prepare('SELECT f.*, e.name as employee_name, e.employee_code FROM form16 f JOIN employees e ON f.employee_id = e.id WHERE f.employee_id = ?').all(emp.id));
    }
    res.json(db.prepare('SELECT f.*, e.name as employee_name, e.employee_code, e.pan, e.designation, e.department FROM form16 f JOIN employees e ON f.employee_id = e.id ORDER BY f.financial_year DESC').all());
});

app.post('/api/form16/generate', auth, requireRole('admin', 'accountant'), (req, res) => {
    const { employee_id, financial_year } = req.body;
    if (!employee_id || !financial_year) return res.status(400).json({ error: 'Employee and financial year required' });

    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id);
    if (!emp) return res.status(400).json({ error: 'Employee not found' });

    // Get all payslips for this FY (Apr-Mar)
    const [fyStart, fyEnd] = financial_year.split('-').map(Number);
    const payslips = db.prepare(`
        SELECT * FROM payslips WHERE employee_id = ? AND ((year = ? AND month >= 4) OR (year = ? AND month <= 3))
    `).all(employee_id, fyStart, fyEnd);

    let totalGross = 0, totalTDS = 0, totalPF = 0, totalPT = 0;
    const quarterlyTDS = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

    for (const ps of payslips) {
        const earn = JSON.parse(ps.earnings);
        const ded = JSON.parse(ps.deductions);
        totalGross += earn.grossEarnings || 0;
        totalTDS += ded.tds || 0;
        totalPF += ded.employeePF || 0;
        totalPT += ded.professionalTax || 0;
        // Quarter mapping: Apr-Jun=Q1, Jul-Sep=Q2, Oct-Dec=Q3, Jan-Mar=Q4
        const q = ps.month >= 4 && ps.month <= 6 ? 'Q1' : ps.month >= 7 && ps.month <= 9 ? 'Q2' : ps.month >= 10 && ps.month <= 12 ? 'Q3' : 'Q4';
        quarterlyTDS[q] += ded.tds || 0;
    }

    // Get tax declaration
    const taxDecl = db.prepare("SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ?").get(employee_id, financial_year);
    const regime = taxDecl?.regime || 'new';
    const exemptions = taxDecl?.total_approved || 0;

    const partA = JSON.stringify({
        employer: { name: 'PrimeAxis IT Solutions', tan: 'HYDP12345E', pan: 'AABCP1234F', address: 'Plot No: 207, Road No: 8, Vasanth Nagar, KPHB, Hyderabad - 500072' },
        employee: { name: emp.name, pan: emp.pan || 'N/A', designation: emp.designation },
        period: financial_year,
        quarterlyTDS,
        totalTDS: Math.round(totalTDS)
    });

    const stdDeduction = regime === 'old' ? 50000 : 75000;
    const partB = JSON.stringify({
        grossSalary: Math.round(totalGross),
        exemptions: Math.round(exemptions),
        standardDeduction: stdDeduction,
        pfDeduction: Math.round(totalPF),
        professionalTax: Math.round(totalPT),
        totalIncome: Math.round(totalGross - stdDeduction - exemptions),
        taxPayable: Math.round(totalTDS),
        regime,
        payslipCount: payslips.length
    });

    db.prepare(`INSERT OR REPLACE INTO form16 (employee_id, financial_year, part_a, part_b, total_income, total_tax_deducted, generated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(employee_id, financial_year, partA, partB, Math.round(totalGross), Math.round(totalTDS), req.user.id);

    res.json({ message: `Form 16 generated for ${emp.name} (FY ${financial_year})`, totalIncome: Math.round(totalGross), totalTDS: Math.round(totalTDS) });
});

app.post('/api/form16/generate-bulk', auth, requireRole('admin', 'accountant'), (req, res) => {
    const { financial_year } = req.body;
    if (!financial_year) return res.status(400).json({ error: 'Financial year required' });
    const employees = db.prepare("SELECT id FROM employees WHERE status IN ('active','inactive') AND annual_ctc > 0").all();
    let generated = 0;
    for (const emp of employees) {
        try {
            // Simulate calling generate for each
            const [fyStart, fyEnd] = financial_year.split('-').map(Number);
            const payslips = db.prepare('SELECT * FROM payslips WHERE employee_id = ? AND ((year = ? AND month >= 4) OR (year = ? AND month <= 3))').all(emp.id, fyStart, fyEnd);
            if (payslips.length === 0) continue;
            let totalGross = 0, totalTDS = 0, totalPF = 0, totalPT = 0;
            const quarterlyTDS = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
            for (const ps of payslips) {
                const earn = JSON.parse(ps.earnings); const ded = JSON.parse(ps.deductions);
                totalGross += earn.grossEarnings || 0; totalTDS += ded.tds || 0; totalPF += ded.employeePF || 0; totalPT += ded.professionalTax || 0;
                const q = ps.month >= 4 && ps.month <= 6 ? 'Q1' : ps.month >= 7 && ps.month <= 9 ? 'Q2' : ps.month >= 10 && ps.month <= 12 ? 'Q3' : 'Q4';
                quarterlyTDS[q] += ded.tds || 0;
            }
            const empData = db.prepare('SELECT * FROM employees WHERE id = ?').get(emp.id);
            const taxDecl = db.prepare("SELECT * FROM tax_declarations WHERE employee_id = ? AND financial_year = ?").get(emp.id, financial_year);
            const regime = taxDecl?.regime || 'new'; const exemptions = taxDecl?.total_approved || 0;
            const stdDed = regime === 'old' ? 50000 : 75000;
            const partA = JSON.stringify({ employer: { name: 'PrimeAxis IT Solutions', tan: 'HYDP12345E', pan: 'AABCP1234F' }, employee: { name: empData.name, pan: empData.pan || 'N/A' }, period: financial_year, quarterlyTDS, totalTDS: Math.round(totalTDS) });
            const partB = JSON.stringify({ grossSalary: Math.round(totalGross), exemptions: Math.round(exemptions), standardDeduction: stdDed, pfDeduction: Math.round(totalPF), professionalTax: Math.round(totalPT), totalIncome: Math.round(totalGross - stdDed - exemptions), taxPayable: Math.round(totalTDS), regime, payslipCount: payslips.length });
            db.prepare('INSERT OR REPLACE INTO form16 (employee_id, financial_year, part_a, part_b, total_income, total_tax_deducted, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(emp.id, financial_year, partA, partB, Math.round(totalGross), Math.round(totalTDS), req.user.id);
            generated++;
        } catch (e) { /* skip */ }
    }
    res.json({ generated, total: employees.length, message: `${generated} Form 16 generated` });
});

// ============================================================
//  PAYSLIP EXTRAS (Bonus, Joining Bonus, Extra Allowance)
// ============================================================
app.get('/api/payslip-extras', auth, requireRole('admin', 'accountant', 'hr'), (req, res) => {
    const { employee_id, month, year } = req.query;
    let query = 'SELECT pe.*, e.name as employee_name, e.employee_code FROM payslip_extras pe JOIN employees e ON pe.employee_id = e.id';
    const params = [];
    if (employee_id && month && year) {
        query += ' WHERE pe.employee_id = ? AND pe.month = ? AND pe.year = ?';
        params.push(employee_id, month, year);
    }
    query += ' ORDER BY pe.created_at DESC';
    res.json(db.prepare(query).all(...params));
});

app.post('/api/payslip-extras', auth, requireRole('admin', 'accountant', 'hr'), (req, res) => {
    const { employee_id, month, year, type, description, amount, is_taxable } = req.body;
    if (!employee_id || !month || !year || !type || !amount) return res.status(400).json({ error: 'All fields required' });
    const result = db.prepare('INSERT INTO payslip_extras (employee_id, month, year, type, description, amount, is_taxable, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(employee_id, month, year, type, description || '', parseFloat(amount), is_taxable !== false ? 1 : 0, req.user.id);
    res.json({ id: result.lastInsertRowid, message: 'Extra added' });
});

app.delete('/api/payslip-extras/:id', auth, requireRole('admin', 'accountant'), (req, res) => {
    db.prepare('DELETE FROM payslip_extras WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted' });
});

// ============================================================
//  WORK ANNIVERSARY CHECK (called on dashboard load)
// ============================================================
app.get('/api/anniversaries', auth, (req, res) => {
    // Find employees whose joining date anniversary is within ±7 days of today
    const today = new Date();
    const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const employees = db.prepare("SELECT * FROM employees WHERE status = 'active' AND date_of_joining IS NOT NULL").all();
    const anniversaries = [];
    for (const emp of employees) {
        const doj = new Date(emp.date_of_joining);
        const dojMD = `${String(doj.getMonth() + 1).padStart(2, '0')}-${String(doj.getDate()).padStart(2, '0')}`;
        const years = today.getFullYear() - doj.getFullYear();
        if (years > 0) {
            const annivDate = new Date(today.getFullYear(), doj.getMonth(), doj.getDate());
            const diffDays = Math.round((annivDate - today) / (86400000));
            if (diffDays >= -7 && diffDays <= 7) {
                anniversaries.push({ ...emp, years, annivDate: annivDate.toISOString().split('T')[0], daysAway: diffDays });
            }
        }
    }
    res.json(anniversaries);
});

// ============================================================
//  CAREERS - PUBLIC API (No auth required)
// ============================================================
app.get('/api/careers', (req, res) => {
    const jobs = db.prepare(`
        SELECT id, title, department, location, type, experience_min, experience_max, description, requirements, created_at
        FROM job_postings WHERE is_active = 1 ORDER BY created_at DESC
    `).all();
    res.json(jobs);
});

app.get('/api/careers/:id', (req, res) => {
    const job = db.prepare('SELECT * FROM job_postings WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

// Resume upload setup
const resumeStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads', 'resumes');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `resume_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
    }
});
const resumeUpload = multer({
    storage: resumeStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only PDF, DOC, DOCX files allowed'));
    }
});

const applyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Too many applications. Try again later.' } });
app.post('/api/careers/:id/apply', applyLimiter, resumeUpload.single('resume'), (req, res) => {
    try {
        const job = db.prepare('SELECT id, title FROM job_postings WHERE id = ? AND is_active = 1').get(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job not found or no longer active' });

        const { first_name, last_name, email, phone, experience_type, experience_years, cover_note } = req.body;
        if (!first_name || !last_name || !email || !experience_type) {
            return res.status(400).json({ error: 'First name, last name, email, and experience type are required' });
        }
        if (!req.file) return res.status(400).json({ error: 'Resume is required' });

        const existing = db.prepare('SELECT id FROM job_applications WHERE job_id = ? AND email = ?').get(job.id, email);
        if (existing) return res.status(400).json({ error: 'You have already applied for this position' });

        const result = db.prepare(`
            INSERT INTO job_applications (job_id, first_name, last_name, email, phone, experience_type, experience_years, resume_file, resume_original_name, cover_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(job.id, first_name, last_name, email, phone || null, experience_type, parseFloat(experience_years) || 0, req.file.filename, req.file.originalname, cover_note || null);

        // Notify HR/Admin
        const hrUsers = db.prepare("SELECT id FROM users WHERE role IN ('admin','hr') AND is_active = 1").all();
        const insertNotif = db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)');
        hrUsers.forEach(u => {
            insertNotif.run(u.id, 'New Job Application', `${first_name} ${last_name} applied for ${job.title}`, 'info', '/applications');
        });

        res.json({ id: result.lastInsertRowid, message: 'Application submitted successfully! We will review your profile and get back to you.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
//  CAREERS - ADMIN API (Auth required)
// ============================================================
app.get('/api/admin/job-postings', auth, requireRole('admin', 'hr'), (req, res) => {
    const jobs = db.prepare('SELECT * FROM job_postings ORDER BY created_at DESC').all();
    res.json(jobs);
});

app.post('/api/admin/job-postings', auth, requireRole('admin', 'hr'), (req, res) => {
    const { title, department, location, type, experience_min, experience_max, description, requirements } = req.body;
    if (!title || !department) return res.status(400).json({ error: 'Title and department are required' });
    const result = db.prepare(`
        INSERT INTO job_postings (title, department, location, type, experience_min, experience_max, description, requirements, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, department, location || 'Hyderabad', type || 'full-time', experience_min || 0, experience_max || 0, description || '', requirements || '', req.user.id);
    res.json({ id: result.lastInsertRowid, message: 'Job posting created' });
});

app.put('/api/admin/job-postings/:id', auth, requireRole('admin', 'hr'), (req, res) => {
    const { title, department, location, type, experience_min, experience_max, description, requirements, is_active } = req.body;
    db.prepare(`
        UPDATE job_postings SET title=?, department=?, location=?, type=?, experience_min=?, experience_max=?, description=?, requirements=?, is_active=?, updated_at=datetime('now')
        WHERE id=?
    `).run(title, department, location, type, experience_min || 0, experience_max || 0, description, requirements, is_active !== undefined ? is_active : 1, req.params.id);
    res.json({ message: 'Job posting updated' });
});

app.delete('/api/admin/job-postings/:id', auth, requireRole('admin', 'hr'), (req, res) => {
    db.prepare('DELETE FROM job_postings WHERE id = ?').run(req.params.id);
    res.json({ message: 'Job posting deleted' });
});

app.get('/api/admin/applications', auth, requireRole('admin', 'hr'), (req, res) => {
    const apps = db.prepare(`
        SELECT a.*, j.title as job_title, j.department as job_department
        FROM job_applications a
        JOIN job_postings j ON a.job_id = j.id
        ORDER BY a.created_at DESC
    `).all();
    res.json(apps);
});

app.put('/api/admin/applications/:id/status', auth, requireRole('admin', 'hr'), (req, res) => {
    const { status } = req.body;
    const allowed = ['received', 'shortlisted', 'interview', 'offered', 'rejected', 'withdrawn'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    db.prepare('UPDATE job_applications SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: 'Application status updated' });
});

// ============================================================
//  SECURITY: 404 handler for unknown API routes
// ============================================================
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler — never leak stack traces
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
//  START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║     PrimeAxis IT — HR Portal Server              ║
║     http://localhost:${PORT}                        ║
║     Portal: http://localhost:${PORT}/portal          ║
║     API: http://localhost:${PORT}/api                ║
╚══════════════════════════════════════════════════╝
    `);
});
