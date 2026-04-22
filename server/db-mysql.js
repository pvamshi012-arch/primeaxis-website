const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// ===== MySQL Connection Pool =====
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'primeaxis',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+05:30',
});

// ===== Compatibility Layer =====
// Wraps mysql2/promise to provide a similar interface to better-sqlite3
const db = {
    pool,
    prepare(sql) {
        // Convert SQLite placeholders and syntax to MySQL
        let mysqlSql = sql
            .replace(/datetime\(['"]now['"]\)/gi, 'NOW()')
            .replace(/AUTOINCREMENT/gi, 'AUTO_INCREMENT')
            .replace(/INSERT OR REPLACE INTO/gi, 'REPLACE INTO')
            .replace(/INSERT OR IGNORE INTO/gi, 'INSERT IGNORE INTO')
            .replace(/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');

        return {
            async get(...params) {
                const safeParams = params.map(p => p === undefined ? null : p);
                const [rows] = await pool.execute(mysqlSql, safeParams);
                return rows[0] || undefined;
            },
            async all(...params) {
                const safeParams = params.map(p => p === undefined ? null : p);
                const [rows] = await pool.execute(mysqlSql, safeParams);
                return rows;
            },
            async run(...params) {
                const safeParams = params.map(p => p === undefined ? null : p);
                const [result] = await pool.execute(mysqlSql, safeParams);
                return { lastInsertRowid: result.insertId, changes: result.affectedRows };
            }
        };
    },
    async exec(sql) {
        // Split on semicolons for multi-statement support, filter empty
        const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
            let mysqlStmt = stmt
                .replace(/datetime\(['"]now['"]\)/gi, 'NOW()')
                .replace(/AUTOINCREMENT/gi, 'AUTO_INCREMENT');
            await pool.query(mysqlStmt);
        }
    }
};

// ===== CREATE TABLES =====
async function initDatabase() {
    const conn = await pool.getConnection();
    try {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin','hr','manager','accountant','employee') NOT NULL,
                name VARCHAR(255) NOT NULL,
                is_active TINYINT DEFAULT 1,
                must_change_password TINYINT DEFAULT 1,
                temp_password_expires DATETIME,
                hostinger_synced TINYINT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Add hostinger_synced column if not exists (for existing DBs)
        await conn.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hostinger_synced TINYINT DEFAULT 0`);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                employee_code VARCHAR(20) UNIQUE,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(100) DEFAULT 'Telangana',
                pincode VARCHAR(10),
                department VARCHAR(100),
                designation VARCHAR(100),
                date_of_joining VARCHAR(20),
                date_of_leaving VARCHAR(20),
                annual_ctc DOUBLE DEFAULT 0,
                bank_name VARCHAR(255),
                bank_account VARCHAR(50),
                ifsc_code VARCHAR(20),
                pan VARCHAR(20),
                aadhar VARCHAR(20),
                uan VARCHAR(30),
                emergency_contact VARCHAR(255),
                emergency_phone VARCHAR(50),
                status ENUM('active','inactive','onboarding','terminated') DEFAULT 'onboarding',
                reporting_manager_id INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (reporting_manager_id) REFERENCES employees(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS offer_letters (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT,
                reference_no VARCHAR(50) UNIQUE,
                employee_name VARCHAR(255) NOT NULL,
                employee_email VARCHAR(255),
                employee_phone VARCHAR(50),
                employee_address TEXT,
                employee_city VARCHAR(100),
                employee_state VARCHAR(100),
                employee_pincode VARCHAR(10),
                designation VARCHAR(100) NOT NULL,
                department VARCHAR(100) NOT NULL,
                date_of_joining VARCHAR(20) NOT NULL,
                annual_ctc DOUBLE NOT NULL,
                salary_breakup TEXT NOT NULL,
                probation_months INT DEFAULT 6,
                notice_period_days INT DEFAULT 30,
                reporting_manager VARCHAR(255),
                work_location VARCHAR(100) DEFAULT 'Hyderabad',
                additional_terms TEXT,
                doc_aadhar VARCHAR(255),
                doc_pan VARCHAR(255),
                doc_photo VARCHAR(255),
                shift_applicable TINYINT DEFAULT 0,
                joining_bonus DOUBLE DEFAULT 0,
                relocation_expense DOUBLE DEFAULT 0,
                employment_type VARCHAR(20) DEFAULT 'permanent',
                contract_end_date VARCHAR(20),
                candidate_signature LONGTEXT,
                accepted_at DATETIME,
                status ENUM('draft','pending_approval','approved','released','accepted','rejected') DEFAULT 'draft',
                created_by INT,
                approved_by INT,
                approved_at DATETIME,
                released_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (approved_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS timesheets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                week_start VARCHAR(20) NOT NULL,
                week_end VARCHAR(20) NOT NULL,
                entries TEXT NOT NULL,
                total_hours DOUBLE DEFAULT 0,
                status ENUM('draft','submitted','approved','rejected') DEFAULT 'draft',
                submitted_at DATETIME,
                approved_by INT,
                approved_at DATETIME,
                reject_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (approved_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`leaves\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                leave_type ENUM('casual','sick','earned','unpaid','maternity','paternity','compensatory') NOT NULL,
                from_date VARCHAR(20) NOT NULL,
                to_date VARCHAR(20) NOT NULL,
                days DOUBLE NOT NULL,
                reason TEXT,
                is_lop TINYINT DEFAULT 0,
                lop_days DOUBLE DEFAULT 0,
                status ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending',
                approved_by INT,
                approved_at DATETIME,
                reject_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (approved_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS leave_balances (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                year INT NOT NULL,
                casual_total INT DEFAULT 12,
                casual_used DOUBLE DEFAULT 0,
                sick_total INT DEFAULT 12,
                sick_used DOUBLE DEFAULT 0,
                earned_total INT DEFAULT 15,
                earned_used DOUBLE DEFAULT 0,
                UNIQUE KEY uq_emp_year (employee_id, year),
                FOREIGN KEY (employee_id) REFERENCES employees(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS payslips (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                month INT NOT NULL,
                year INT NOT NULL,
                working_days INT NOT NULL,
                present_days DOUBLE NOT NULL,
                earnings TEXT NOT NULL,
                deductions TEXT NOT NULL,
                employer_contributions TEXT,
                gross_earnings DOUBLE NOT NULL,
                total_deductions DOUBLE NOT NULL,
                net_pay DOUBLE NOT NULL,
                generated_by INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_emp_month_year (employee_id, month, year),
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (generated_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS relieving_letters (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                reference_no VARCHAR(50) UNIQUE,
                employee_name VARCHAR(255) NOT NULL,
                employee_code VARCHAR(20),
                designation VARCHAR(100) NOT NULL,
                department VARCHAR(100) NOT NULL,
                date_of_joining VARCHAR(20) NOT NULL,
                date_of_leaving VARCHAR(20) NOT NULL,
                reason VARCHAR(255) DEFAULT 'Resignation',
                status ENUM('draft','approved','released') DEFAULT 'draft',
                created_by INT,
                approved_by INT,
                approved_at DATETIME,
                released_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (approved_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type ENUM('info','success','warning','error') DEFAULT 'info',
                is_read TINYINT DEFAULT 0,
                link VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_no VARCHAR(20) UNIQUE,
                employee_id INT,
                raised_by INT NOT NULL,
                category ENUM('IT Support','HR','Finance','Facilities','Admin','Access/Permissions','Other') NOT NULL,
                priority ENUM('low','medium','high','critical') DEFAULT 'medium',
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                status ENUM('open','in_progress','resolved','closed','reopened') DEFAULT 'open',
                assigned_to INT,
                cc_manager_id INT,
                resolution TEXT,
                resolved_by INT,
                resolved_at DATETIME,
                closed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (raised_by) REFERENCES users(id),
                FOREIGN KEY (assigned_to) REFERENCES users(id),
                FOREIGN KEY (cc_manager_id) REFERENCES users(id),
                FOREIGN KEY (resolved_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS ticket_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id INT NOT NULL,
                user_id INT NOT NULL,
                comment TEXT NOT NULL,
                is_internal TINYINT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS bgv_invites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                offer_id INT NOT NULL,
                candidate_name VARCHAR(255) NOT NULL,
                candidate_email VARCHAR(255) NOT NULL,
                temp_password VARCHAR(255) NOT NULL,
                access_token VARCHAR(64) UNIQUE,
                status ENUM('pending','in_progress','submitted','verified','rejected') DEFAULT 'pending',
                created_by INT,
                submitted_at DATETIME,
                verified_by INT,
                verified_at DATETIME,
                rejection_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (offer_id) REFERENCES offer_letters(id),
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (verified_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS bgv_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                invite_id INT NOT NULL,
                section ENUM('personal','emergency','family','address','edu_10th','edu_12th','edu_graduation','edu_pg','address_proofs','declaration') NOT NULL,
                data TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_invite_section (invite_id, section),
                FOREIGN KEY (invite_id) REFERENCES bgv_invites(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS bgv_documents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                invite_id INT NOT NULL,
                section VARCHAR(50) NOT NULL,
                doc_type VARCHAR(50) NOT NULL,
                file_path VARCHAR(500) NOT NULL,
                original_name VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (invite_id) REFERENCES bgv_invites(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS company_holidays (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                date VARCHAR(20) NOT NULL,
                day_of_week VARCHAR(20),
                type ENUM('national','restricted','company') DEFAULT 'national',
                year INT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS tax_declarations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                financial_year VARCHAR(20) NOT NULL,
                regime ENUM('old','new') DEFAULT 'new',
                status ENUM('draft','submitted','approved','rejected') DEFAULT 'draft',
                total_declared DOUBLE DEFAULT 0,
                total_approved DOUBLE DEFAULT 0,
                submitted_at DATETIME,
                approved_by INT,
                approved_at DATETIME,
                rejection_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_emp_fy (employee_id, financial_year),
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (approved_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS tax_declaration_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                declaration_id INT NOT NULL,
                section VARCHAR(20) NOT NULL,
                category VARCHAR(50) NOT NULL,
                description TEXT,
                declared_amount DOUBLE DEFAULT 0,
                approved_amount DOUBLE DEFAULT 0,
                proof_file VARCHAR(500),
                proof_name VARCHAR(255),
                status ENUM('pending','approved','rejected') DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (declaration_id) REFERENCES tax_declarations(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS feed_posts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                content TEXT NOT NULL,
                type ENUM('general','announcement','achievement','birthday','anniversary') DEFAULT 'general',
                likes INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS feed_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                post_id INT NOT NULL,
                user_id INT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES feed_posts(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS feed_likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                post_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_post_user (post_id, user_id),
                FOREIGN KEY (post_id) REFERENCES feed_posts(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS resignations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                resignation_date VARCHAR(20) NOT NULL,
                last_working_day VARCHAR(20) NOT NULL,
                notice_period_days INT DEFAULT 90,
                reason TEXT NOT NULL,
                personal_email VARCHAR(255),
                status ENUM('submitted','manager_approved','hr_approved','finance_approved','completed','withdrawn') DEFAULT 'submitted',
                manager_approval TINYINT DEFAULT 0,
                manager_approved_by INT,
                manager_approved_at DATETIME,
                hr_approval TINYINT DEFAULT 0,
                hr_approved_by INT,
                hr_approved_at DATETIME,
                finance_approval TINYINT DEFAULT 0,
                finance_approved_by INT,
                finance_approved_at DATETIME,
                admin_approval TINYINT DEFAULT 0,
                admin_approved_by INT,
                admin_approved_at DATETIME,
                assets_returned TINYINT DEFAULT 0,
                knowledge_transfer_done TINYINT DEFAULT 0,
                exit_interview_done TINYINT DEFAULT 0,
                remarks TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS training_modules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                type ENUM('onboarding','annual','security','compliance','custom') DEFAULT 'onboarding',
                content_type ENUM('slides','video','document') DEFAULT 'slides',
                slides LONGTEXT,
                video_url VARCHAR(500),
                duration_minutes INT DEFAULT 30,
                is_mandatory TINYINT DEFAULT 1,
                passing_score INT DEFAULT 80,
                is_active TINYINT DEFAULT 1,
                created_by INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS training_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                module_id INT NOT NULL,
                status ENUM('pending','in_progress','completed','overdue') DEFAULT 'pending',
                assigned_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                due_date VARCHAR(20),
                completed_at DATETIME,
                score INT,
                certificate_ref VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_emp_module (employee_id, module_id),
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (module_id) REFERENCES training_modules(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS form16 (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                financial_year VARCHAR(20) NOT NULL,
                part_a LONGTEXT,
                part_b LONGTEXT,
                total_income DOUBLE DEFAULT 0,
                total_tax_deducted DOUBLE DEFAULT 0,
                generated_by INT,
                generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_emp_fy (employee_id, financial_year),
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (generated_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS payslip_extras (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT NOT NULL,
                month INT NOT NULL,
                year INT NOT NULL,
                type ENUM('joining_bonus','performance_bonus','referral_bonus','extra_allowance','shift_allowance','other') NOT NULL,
                description TEXT,
                amount DOUBLE NOT NULL,
                is_taxable TINYINT DEFAULT 1,
                created_by INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees(id),
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS job_postings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                department VARCHAR(100) NOT NULL,
                location VARCHAR(100) DEFAULT 'Hyderabad',
                type ENUM('full-time','part-time','contract','internship') DEFAULT 'full-time',
                experience_min INT DEFAULT 0,
                experience_max INT DEFAULT 0,
                description TEXT,
                requirements TEXT,
                is_active TINYINT DEFAULT 1,
                created_by INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS job_applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id INT NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                experience_type ENUM('fresher','experienced') NOT NULL,
                experience_years DOUBLE DEFAULT 0,
                resume_file VARCHAR(255),
                resume_original_name VARCHAR(255),
                cover_note TEXT,
                status ENUM('received','shortlisted','interview','offered','rejected','withdrawn') DEFAULT 'received',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES job_postings(id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS contact_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                service VARCHAR(255),
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ===== SEED MANDATORY TRAINING MODULES =====
        const [trainingRows] = await conn.query('SELECT COUNT(*) as c FROM training_modules');
        if (trainingRows[0].c === 0) {
            const secSlides = [
                { title: 'Welcome to Security Training', bullets: ['This mandatory training covers essential information security practices at PrimeAxis IT Solutions.'] },
                { title: 'Password Security', bullets: ['Use strong passwords (min 12 chars, mixed case, numbers, symbols)', 'Never share passwords with anyone', 'Use different passwords for different accounts', 'Enable 2-Factor Authentication wherever possible', 'Change passwords every 90 days'] },
                { title: 'Phishing & Social Engineering', bullets: ['Always verify sender email addresses', 'Do not click suspicious links or attachments', 'Report phishing emails to IT Security team', 'Never provide credentials via email or phone', 'When in doubt, verify through official channels'] },
                { title: 'Data Protection', bullets: ['Classify data as Public, Internal, Confidential, or Restricted', 'Never store client data on personal devices', 'Use only company-approved cloud storage', 'Encrypt sensitive files before sharing', 'Clean desk policy - lock screen when away'] },
                { title: 'Device Security', bullets: ['Keep OS and software updated', 'Use company antivirus software', 'Lock your workstation (Win+L / Cmd+L)', 'Do not connect unauthorized USB devices', 'Report lost/stolen devices immediately'] },
                { title: 'Incident Reporting', bullets: ['Report any security incident within 1 hour', 'Email: security@primeaxisit.com', 'Raise a ticket under IT Support > Security', 'Do not try to fix security issues yourself', 'Preserve evidence - do not delete anything'] },
                { title: 'Training Complete', bullets: ['You have completed the Information Security Awareness training.'], note: 'Security is everyone\'s responsibility!' },
            ];
            const policySlides = [
                { title: 'Company Policies Overview', bullets: ['Welcome to PrimeAxis IT Solutions.', 'This training covers essential company policies every employee must know.'] },
                { title: 'Code of Conduct', bullets: ['Maintain professional behavior at all times', 'Respect all colleagues regardless of position', 'Follow chain of command for escalations', 'No discrimination based on gender, religion, caste, or origin', 'Represent company positively in public'] },
                { title: 'Anti-Harassment Policy', bullets: ['Zero tolerance for any form of harassment', 'Sexual harassment complaints: Internal Complaints Committee (ICC)', 'Workplace bullying will not be tolerated', 'All complaints are investigated confidentially', 'Retaliation against complainants is prohibited'] },
                { title: 'Leave & Attendance', bullets: ['Working hours: 9:30 AM - 6:30 PM (Mon-Fri)', 'Inform manager before taking leave', 'Maximum 3 consecutive unplanned leaves', 'Leaves: 12 CL + 12 SL + 15 EL per year', 'Excess leaves = Loss of Pay (LOP)'] },
                { title: 'IT & Communication Policy', bullets: ['Use company email for official communication', 'Do not install unauthorized software', 'Internet usage monitored for compliance', 'No personal use of company resources for profit', 'Back up work regularly'] },
                { title: 'Separation Policy', bullets: ['Official notice period: 90 days', 'Serve complete notice or pay in lieu', 'Complete exit clearance from all departments', 'Return all company assets before last day', 'Knowledge transfer is mandatory'] },
                { title: 'Training Complete', bullets: ['You now understand PrimeAxis IT company policies.'], note: 'For any questions, contact HR at hr@primeaxisit.com' },
            ];
            const privacySlides = [
                { title: 'Data Privacy Training', bullets: ['Annual mandatory training on data privacy and protection regulations applicable to PrimeAxis IT Solutions.'] },
                { title: 'What is Personal Data?', bullets: ['Name, email, phone number', 'Aadhar, PAN, passport numbers', 'Financial information (bank details, salary)', 'Health records', 'Biometric data', 'Any data that can identify a person'] },
                { title: 'Data Protection Principles', bullets: ['Collect only what is necessary', 'Use data only for stated purposes', 'Keep data accurate and up-to-date', 'Do not retain data longer than needed', 'Protect data with appropriate security', 'Be transparent about data usage'] },
                { title: 'Your Responsibilities', bullets: ['Handle personal data with care', 'Access only data you need for your role', 'Report data breaches within 24 hours', 'Do not share personal data without authorization', 'Use secure channels for data transfer'] },
                { title: 'Training Complete', bullets: ['Annual data privacy training completed.'], note: 'Stay vigilant about protecting personal and client data!' },
            ];
            const trainings = [
                ['Information Security Awareness', 'Learn about data protection, password security, phishing prevention, and handling sensitive company information.', 'security', 'slides', JSON.stringify(secSlides), 30, 1, 100],
                ['Company Policies & Code of Conduct', 'Understand PrimeAxis IT workplace policies, code of conduct, anti-harassment policy, and employee responsibilities.', 'compliance', 'slides', JSON.stringify(policySlides), 25, 1, 100],
                ['Data Privacy & GDPR Basics', 'Understanding data privacy regulations, GDPR compliance, and handling personal data responsibly.', 'annual', 'slides', JSON.stringify(privacySlides), 20, 1, 100]
            ];
            for (const t of trainings) {
                await conn.query('INSERT INTO training_modules (title, description, type, content_type, slides, duration_minutes, is_mandatory, passing_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', t);
            }
            console.log('✅ Mandatory training modules seeded');
        }

        // ===== SEED JOB POSTINGS =====
        const [jobRows] = await conn.query('SELECT COUNT(*) as c FROM job_postings');
        if (jobRows[0].c === 0) {
            const jobs = [
                ['Senior SAP FICO Consultant', 'SAP & ERP', 'Hyderabad', 'full-time', 5, 12, 'We are looking for an experienced SAP FICO Consultant to manage and implement financial accounting and controlling modules for enterprise clients.', 'SAP FICO certification\nMinimum 5 years SAP implementation experience\nExperience with S/4HANA migration\nStrong understanding of Indian taxation & GST\nExcellent communication skills'],
                ['VLSI Design Engineer', 'Engineering', 'Hyderabad', 'full-time', 2, 8, 'Join our semiconductor design team to work on cutting-edge VLSI chip design, verification, and physical design projects.', 'B.Tech/M.Tech in ECE or VLSI\nExperience with Verilog/VHDL\nFPGA prototyping experience\nKnowledge of synthesis tools (Synopsys/Cadence)\nStrong digital design fundamentals'],
                ['Embedded Software Developer', 'Engineering', 'Hyderabad', 'full-time', 1, 6, 'Develop firmware and embedded software for IoT devices, automotive systems, and industrial automation controllers.', 'Proficiency in Embedded C/C++\nExperience with ARM Cortex-M/R processors\nRTOS experience (FreeRTOS/Zephyr)\nKnowledge of communication protocols (SPI, I2C, UART, CAN)\nDebugging with JTAG/SWD'],
                ['Full Stack Developer (React + Node.js)', 'Engineering', 'Hyderabad', 'full-time', 2, 7, 'Build and maintain scalable web applications using React frontend and Node.js backend for our enterprise clients.', 'Strong React.js and Node.js skills\nExperience with TypeScript\nDatabase experience (PostgreSQL/MongoDB)\nREST API design\nGit and CI/CD pipelines'],
                ['SAP ABAP Developer', 'SAP & ERP', 'Hyderabad', 'full-time', 3, 10, 'Develop custom ABAP programs, reports, enhancements, and interfaces for SAP ECC and S/4HANA environments.', 'SAP ABAP certification preferred\nExperience with ABAP OO, ALV, BAPI, BADI, User Exits\nIDOC and RFC experience\nFiori/UI5 exposure is a plus\nDebugging and performance tuning skills'],
                ['Cloud DevOps Engineer', 'Infrastructure', 'Hyderabad', 'full-time', 3, 8, 'Design, implement, and manage cloud infrastructure on AWS/Azure. Automate CI/CD pipelines and ensure high availability.', 'AWS/Azure certification preferred\nExperience with Terraform/CloudFormation\nDocker and Kubernetes expertise\nCI/CD pipeline setup (Jenkins/GitHub Actions)\nLinux administration skills'],
                ['Python Developer - Data Engineering', 'Data & AI', 'Hyderabad', 'full-time', 1, 5, 'Build data pipelines, ETL processes, and analytics platforms using Python and modern data engineering tools.', 'Strong Python skills\nExperience with Pandas, PySpark, or Airflow\nSQL and database knowledge\nCloud data services (AWS Glue, BigQuery)\nBasic understanding of ML concepts'],
                ['QA Automation Engineer', 'Quality', 'Hyderabad', 'full-time', 2, 6, 'Design and implement automated testing frameworks for web, API, and mobile applications.', 'Selenium/Cypress/Playwright experience\nAPI testing with Postman/RestAssured\nJava or Python test automation\nCI/CD integration for test suites\nAgile/Scrum experience'],
                ['SAP Basis Administrator', 'SAP & ERP', 'Hyderabad', 'full-time', 4, 10, 'Manage SAP system landscapes, perform installations, upgrades, kernel patches, and ensure system availability.', 'SAP Basis certification\nExperience with SAP HANA database administration\nSystem copy and migration experience\nSolution Manager configuration\nOS/DB level administration (Linux/HANA)'],
                ['Fresher - Graduate Engineer Trainee', 'Engineering', 'Hyderabad', 'full-time', 0, 0, 'Start your career at PrimeAxis IT! We are hiring passionate fresh graduates in Computer Science, Electronics, and IT for our training and placement program.', 'B.Tech/B.E. in CSE, ECE, IT, or related field\n2024/2025 pass-out\nStrong fundamentals in programming or electronics\nWillingness to learn and adapt\nGood communication skills'],
            ];
            for (const j of jobs) {
                await conn.query('INSERT INTO job_postings (title, department, location, type, experience_min, experience_max, description, requirements) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', j);
            }
            console.log('✅ Job postings seeded');
        }

        // Migration: Add new columns if missing
        try { await conn.query("ALTER TABLE offer_letters ADD COLUMN candidate_signature LONGTEXT"); } catch(e) {}
        try { await conn.query("ALTER TABLE offer_letters ADD COLUMN accepted_at DATETIME"); } catch(e) {}
        try { await conn.query("ALTER TABLE users ADD COLUMN temp_password_expires DATETIME"); } catch(e) {}

        // ===== SEED DEFAULT ADMIN =====
        const [adminRows] = await conn.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        if (adminRows.length === 0) {
            const hash = bcrypt.hashSync('admin@123', 10);
            await conn.query(
                "INSERT INTO users (email, password, role, name, must_change_password) VALUES (?, ?, 'admin', 'System Administrator', 1)",
                ['admin@primeaxisit.com', hash]
            );
            console.log('✅ Default admin created: admin@primeaxisit.com / admin@123');
        }

        // ===== SEED TEST USERS (HR, Manager, Accountant) =====
        const testUsers = [
            { email: 'hr@primeaxisit.com', password: 'Hr@12345', role: 'hr', name: 'HR Manager' },
            { email: 'manager@primeaxisit.com', password: 'Manager@123', role: 'manager', name: 'Project Manager' },
            { email: 'accounts@primeaxisit.com', password: 'Accounts@123', role: 'accountant', name: 'Accounts Officer' },
        ];
        for (const tu of testUsers) {
            const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [tu.email]);
            if (existing.length === 0) {
                const h = bcrypt.hashSync(tu.password, 10);
                await conn.query('INSERT INTO users (email, password, role, name, must_change_password) VALUES (?, ?, ?, ?, 0)', [tu.email, h, tu.role, tu.name]);
                console.log(`✅ Test user created: ${tu.email} / ${tu.password}`);
            }
        }

        // ===== SEED COMPANY HOLIDAYS 2026 =====
        const [holidayRows] = await conn.query('SELECT COUNT(*) as c FROM company_holidays WHERE year = 2026');
        if (holidayRows[0].c === 0) {
            const holidays2026 = [
                ['Republic Day', '2026-01-26', 'Monday', 'national'],
                ['Maha Shivaratri', '2026-02-15', 'Sunday', 'national'],
                ['Holi', '2026-03-06', 'Friday', 'national'],
                ['Ugadi / Gudi Padwa', '2026-03-19', 'Thursday', 'national'],
                ['Good Friday', '2026-04-03', 'Friday', 'national'],
                ['Eid-ul-Fitr', '2026-03-21', 'Saturday', 'national'],
                ['Ram Navami', '2026-04-06', 'Monday', 'national'],
                ['Dr. Ambedkar Jayanti', '2026-04-14', 'Tuesday', 'national'],
                ['May Day / Labour Day', '2026-05-01', 'Friday', 'national'],
                ['Buddha Purnima', '2026-05-01', 'Friday', 'restricted'],
                ['Eid-ul-Adha (Bakrid)', '2026-05-27', 'Wednesday', 'national'],
                ['Muharram', '2026-06-26', 'Friday', 'restricted'],
                ['Independence Day', '2026-08-15', 'Saturday', 'national'],
                ['Janmashtami', '2026-08-14', 'Friday', 'national'],
                ['Milad-un-Nabi', '2026-08-25', 'Tuesday', 'restricted'],
                ['Ganesh Chaturthi', '2026-08-26', 'Wednesday', 'national'],
                ['Mahatma Gandhi Jayanti', '2026-10-02', 'Friday', 'national'],
                ['Dussehra / Vijayadashami', '2026-10-20', 'Tuesday', 'national'],
                ['Diwali', '2026-11-08', 'Sunday', 'national'],
                ['Guru Nanak Jayanti', '2026-11-16', 'Monday', 'national'],
                ['Christmas Day', '2026-12-25', 'Friday', 'national'],
                ['Company Foundation Day', '2026-06-15', 'Monday', 'company'],
                ['Annual Team Outing', '2026-09-25', 'Friday', 'company'],
            ];
            for (const h of holidays2026) {
                await conn.query('INSERT INTO company_holidays (name, date, day_of_week, type, year) VALUES (?, ?, ?, ?, 2026)', h);
            }
            console.log('✅ 2026 holidays seeded');
        }

    } finally {
        conn.release();
    }
}

// ===== HELPER: Generate Employee Code =====
async function generateEmployeeCode() {
    const [rows] = await pool.query('SELECT employee_code FROM employees ORDER BY id DESC LIMIT 1');
    if (!rows[0] || !rows[0].employee_code) return 'PAX-001';
    const num = parseInt(rows[0].employee_code.replace('PAX-', '')) + 1;
    return 'PAX-' + String(num).padStart(3, '0');
}

// ===== HELPER: Generate Offer Reference =====
async function generateOfferRef() {
    const year = new Date().getFullYear();
    const [rows] = await pool.query('SELECT COUNT(*) as c FROM offer_letters WHERE reference_no LIKE ?', [`PAX/OL/${year}%`]);
    const num = (rows[0].c || 0) + 1;
    return `PAX/OL/${year}/${String(num).padStart(3, '0')}`;
}

// ===== HELPER: Generate Relieving Reference =====
async function generateRelievingRef() {
    const year = new Date().getFullYear();
    const [rows] = await pool.query('SELECT COUNT(*) as c FROM relieving_letters WHERE reference_no LIKE ?', [`PAX/RL/${year}%`]);
    const num = (rows[0].c || 0) + 1;
    return `PAX/RL/${year}/${String(num).padStart(3, '0')}`;
}

// ===== HELPER: Generate Ticket Number =====
async function generateTicketNo() {
    const [rows] = await pool.query('SELECT COUNT(*) as c FROM tickets');
    const num = (rows[0].c || 0) + 1;
    return `TKT-${String(num).padStart(5, '0')}`;
}

// ===== HELPER: Generate BGV Access Token =====
function generateBGVToken() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let token = '';
    for (let i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
}

// ===== HELPER: Generate Temp Password =====
function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
    let pwd = '';
    for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    return pwd;
}

module.exports = { db, pool, initDatabase, generateEmployeeCode, generateOfferRef, generateRelievingRef, generateTicketNo, generateBGVToken, generateTempPassword };
