const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'primeaxis.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== CREATE TABLES =====
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','hr','manager','accountant','employee')),
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        must_change_password INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        employee_code TEXT UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        city TEXT,
        state TEXT DEFAULT 'Telangana',
        pincode TEXT,
        department TEXT,
        designation TEXT,
        date_of_joining TEXT,
        annual_ctc REAL DEFAULT 0,
        bank_name TEXT,
        bank_account TEXT,
        ifsc_code TEXT,
        pan TEXT,
        aadhar TEXT,
        uan TEXT,
        emergency_contact TEXT,
        emergency_phone TEXT,
        status TEXT DEFAULT 'onboarding' CHECK(status IN ('active','inactive','onboarding','terminated')),
        reporting_manager_id INTEGER REFERENCES employees(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offer_letters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER REFERENCES employees(id),
        reference_no TEXT UNIQUE,
        employee_name TEXT NOT NULL,
        employee_email TEXT,
        employee_address TEXT,
        employee_city TEXT,
        employee_state TEXT,
        employee_pincode TEXT,
        designation TEXT NOT NULL,
        department TEXT NOT NULL,
        date_of_joining TEXT NOT NULL,
        annual_ctc REAL NOT NULL,
        salary_breakup TEXT NOT NULL,
        probation_months INTEGER DEFAULT 6,
        notice_period_days INTEGER DEFAULT 30,
        reporting_manager TEXT,
        work_location TEXT DEFAULT 'Hyderabad',
        additional_terms TEXT,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','released','accepted','rejected')),
        created_by INTEGER REFERENCES users(id),
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        released_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timesheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        entries TEXT NOT NULL,
        total_hours REAL DEFAULT 0,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
        submitted_at TEXT,
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        reject_reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        leave_type TEXT NOT NULL CHECK(leave_type IN ('casual','sick','earned','unpaid','maternity','paternity','compensatory')),
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        days REAL NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        reject_reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leave_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        year INTEGER NOT NULL,
        casual_total INTEGER DEFAULT 12,
        casual_used REAL DEFAULT 0,
        sick_total INTEGER DEFAULT 12,
        sick_used REAL DEFAULT 0,
        earned_total INTEGER DEFAULT 15,
        earned_used REAL DEFAULT 0,
        UNIQUE(employee_id, year)
    );

    CREATE TABLE IF NOT EXISTS payslips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        working_days INTEGER NOT NULL,
        present_days REAL NOT NULL,
        earnings TEXT NOT NULL,
        deductions TEXT NOT NULL,
        employer_contributions TEXT,
        gross_earnings REAL NOT NULL,
        total_deductions REAL NOT NULL,
        net_pay REAL NOT NULL,
        generated_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(employee_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS relieving_letters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        reference_no TEXT UNIQUE,
        employee_name TEXT NOT NULL,
        employee_code TEXT,
        designation TEXT NOT NULL,
        department TEXT NOT NULL,
        date_of_joining TEXT NOT NULL,
        date_of_leaving TEXT NOT NULL,
        reason TEXT DEFAULT 'Resignation',
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft','approved','released')),
        created_by INTEGER REFERENCES users(id),
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        released_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info' CHECK(type IN ('info','success','warning','error')),
        is_read INTEGER DEFAULT 0,
        link TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_no TEXT UNIQUE,
        employee_id INTEGER REFERENCES employees(id),
        raised_by INTEGER NOT NULL REFERENCES users(id),
        category TEXT NOT NULL CHECK(category IN ('IT Support','HR','Finance','Facilities','Admin','Access/Permissions','Other')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed','reopened')),
        assigned_to INTEGER REFERENCES users(id),
        resolution TEXT,
        resolved_by INTEGER REFERENCES users(id),
        resolved_at TEXT,
        closed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        comment TEXT NOT NULL,
        is_internal INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bgv_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offer_id INTEGER NOT NULL REFERENCES offer_letters(id),
        candidate_name TEXT NOT NULL,
        candidate_email TEXT NOT NULL,
        temp_password TEXT NOT NULL,
        access_token TEXT UNIQUE,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','submitted','verified','rejected')),
        created_by INTEGER REFERENCES users(id),
        submitted_at TEXT,
        verified_by INTEGER REFERENCES users(id),
        verified_at TEXT,
        rejection_reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bgv_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invite_id INTEGER NOT NULL REFERENCES bgv_invites(id),
        section TEXT NOT NULL CHECK(section IN ('personal','emergency','family','address','edu_10th','edu_12th','edu_graduation','edu_pg','address_proofs','declaration')),
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(invite_id, section)
    );

    CREATE TABLE IF NOT EXISTS bgv_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invite_id INTEGER NOT NULL REFERENCES bgv_invites(id),
        section TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        original_name TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS company_holidays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        day_of_week TEXT,
        type TEXT DEFAULT 'national' CHECK(type IN ('national','restricted','company')),
        year INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tax_declarations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        financial_year TEXT NOT NULL,
        regime TEXT DEFAULT 'new' CHECK(regime IN ('old','new')),
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
        total_declared REAL DEFAULT 0,
        total_approved REAL DEFAULT 0,
        submitted_at TEXT,
        approved_by INTEGER REFERENCES users(id),
        approved_at TEXT,
        rejection_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(employee_id, financial_year)
    );

    CREATE TABLE IF NOT EXISTS tax_declaration_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        declaration_id INTEGER NOT NULL REFERENCES tax_declarations(id),
        section TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        declared_amount REAL DEFAULT 0,
        approved_amount REAL DEFAULT 0,
        proof_file TEXT,
        proof_name TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        created_at TEXT DEFAULT (datetime('now'))
    );

    -- Employee Chat / Feed
    CREATE TABLE IF NOT EXISTS feed_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        type TEXT DEFAULT 'general' CHECK(type IN ('general','announcement','achievement','birthday','anniversary')),
        likes INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feed_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES feed_posts(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feed_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES feed_posts(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(post_id, user_id)
    );

    -- Resignation / Exit Clearance
    CREATE TABLE IF NOT EXISTS resignations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        resignation_date TEXT NOT NULL,
        last_working_day TEXT NOT NULL,
        notice_period_days INTEGER DEFAULT 90,
        reason TEXT NOT NULL,
        personal_email TEXT,
        status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted','manager_approved','hr_approved','finance_approved','completed','withdrawn')),
        manager_approval INTEGER DEFAULT 0,
        manager_approved_by INTEGER REFERENCES users(id),
        manager_approved_at TEXT,
        hr_approval INTEGER DEFAULT 0,
        hr_approved_by INTEGER REFERENCES users(id),
        hr_approved_at TEXT,
        finance_approval INTEGER DEFAULT 0,
        finance_approved_by INTEGER REFERENCES users(id),
        finance_approved_at TEXT,
        admin_approval INTEGER DEFAULT 0,
        admin_approved_by INTEGER REFERENCES users(id),
        admin_approved_at TEXT,
        assets_returned INTEGER DEFAULT 0,
        knowledge_transfer_done INTEGER DEFAULT 0,
        exit_interview_done INTEGER DEFAULT 0,
        remarks TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    -- Mandatory Training
    CREATE TABLE IF NOT EXISTS training_modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'onboarding' CHECK(type IN ('onboarding','annual','security','compliance','custom')),
        content_type TEXT DEFAULT 'slides' CHECK(content_type IN ('slides','video','document')),
        slides TEXT,
        video_url TEXT,
        duration_minutes INTEGER DEFAULT 30,
        is_mandatory INTEGER DEFAULT 1,
        passing_score INTEGER DEFAULT 80,
        is_active INTEGER DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS training_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        module_id INTEGER NOT NULL REFERENCES training_modules(id),
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','overdue')),
        assigned_date TEXT DEFAULT (datetime('now')),
        due_date TEXT,
        completed_at TEXT,
        score INTEGER,
        certificate_ref TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(employee_id, module_id)
    );

    -- Form 16
    CREATE TABLE IF NOT EXISTS form16 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        financial_year TEXT NOT NULL,
        part_a TEXT,
        part_b TEXT,
        total_income REAL DEFAULT 0,
        total_tax_deducted REAL DEFAULT 0,
        generated_by INTEGER REFERENCES users(id),
        generated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(employee_id, financial_year)
    );

    -- Payslip extras (bonus, joining bonus, extra allowance)
    CREATE TABLE IF NOT EXISTS payslip_extras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('joining_bonus','performance_bonus','referral_bonus','extra_allowance','shift_allowance','other')),
        description TEXT,
        amount REAL NOT NULL,
        is_taxable INTEGER DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_postings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        department TEXT NOT NULL,
        location TEXT DEFAULT 'Hyderabad',
        type TEXT DEFAULT 'full-time' CHECK(type IN ('full-time','part-time','contract','internship')),
        experience_min INTEGER DEFAULT 0,
        experience_max INTEGER DEFAULT 0,
        description TEXT,
        requirements TEXT,
        is_active INTEGER DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES job_postings(id),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        experience_type TEXT NOT NULL CHECK(experience_type IN ('fresher','experienced')),
        experience_years REAL DEFAULT 0,
        resume_file TEXT,
        resume_original_name TEXT,
        cover_note TEXT,
        status TEXT DEFAULT 'received' CHECK(status IN ('received','shortlisted','interview','offered','rejected','withdrawn')),
        created_at TEXT DEFAULT (datetime('now'))
    );
`);

// ===== MIGRATIONS: Add columns to existing tables =====
try { db.exec('ALTER TABLE employees ADD COLUMN date_of_leaving TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE offer_letters ADD COLUMN employee_phone TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE offer_letters ADD COLUMN doc_aadhar TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE offer_letters ADD COLUMN doc_pan TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE offer_letters ADD COLUMN doc_photo TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE leaves ADD COLUMN is_lop INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE leaves ADD COLUMN lop_days REAL DEFAULT 0'); } catch(e) {}
// Offer letter new fields
try { db.exec('ALTER TABLE offer_letters ADD COLUMN shift_applicable INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE offer_letters ADD COLUMN joining_bonus REAL DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE offer_letters ADD COLUMN relocation_expense REAL DEFAULT 0'); } catch(e) {}
try { db.exec("ALTER TABLE offer_letters ADD COLUMN employment_type TEXT DEFAULT 'permanent'"); } catch(e) {}
try { db.exec('ALTER TABLE offer_letters ADD COLUMN contract_end_date TEXT'); } catch(e) {}
// Ticket manager CC
try { db.exec('ALTER TABLE tickets ADD COLUMN cc_manager_id INTEGER REFERENCES users(id)'); } catch(e) {}

// ===== SEED MANDATORY TRAINING MODULES =====
const trainingExists = db.prepare('SELECT COUNT(*) as c FROM training_modules').get();
if (trainingExists.c === 0) {
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
    const insertTraining = db.prepare('INSERT INTO training_modules (title, description, type, content_type, slides, duration_minutes, is_mandatory, passing_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    trainings.forEach(t => insertTraining.run(...t));
    console.log('✅ Mandatory training modules seeded');
}

// ===== SEED JOB POSTINGS =====
const jobsExist = db.prepare('SELECT COUNT(*) as c FROM job_postings').get();
if (jobsExist.c === 0) {
    const jobs = [
        ['Senior SAP FICO Consultant', 'SAP & ERP', 'Hyderabad', 'full-time', 5, 12,
            'We are looking for an experienced SAP FICO Consultant to manage and implement financial accounting and controlling modules for enterprise clients.',
            'SAP FICO certification\nMinimum 5 years SAP implementation experience\nExperience with S/4HANA migration\nStrong understanding of Indian taxation & GST\nExcellent communication skills'],
        ['VLSI Design Engineer', 'Engineering', 'Hyderabad', 'full-time', 2, 8,
            'Join our semiconductor design team to work on cutting-edge VLSI chip design, verification, and physical design projects.',
            'B.Tech/M.Tech in ECE or VLSI\nExperience with Verilog/VHDL\nFPGA prototyping experience\nKnowledge of synthesis tools (Synopsys/Cadence)\nStrong digital design fundamentals'],
        ['Embedded Software Developer', 'Engineering', 'Hyderabad', 'full-time', 1, 6,
            'Develop firmware and embedded software for IoT devices, automotive systems, and industrial automation controllers.',
            'Proficiency in Embedded C/C++\nExperience with ARM Cortex-M/R processors\nRTOS experience (FreeRTOS/Zephyr)\nKnowledge of communication protocols (SPI, I2C, UART, CAN)\nDebugging with JTAG/SWD'],
        ['Full Stack Developer (React + Node.js)', 'Engineering', 'Hyderabad', 'full-time', 2, 7,
            'Build and maintain scalable web applications using React frontend and Node.js backend for our enterprise clients.',
            'Strong React.js and Node.js skills\nExperience with TypeScript\nDatabase experience (PostgreSQL/MongoDB)\nREST API design\nGit and CI/CD pipelines'],
        ['SAP ABAP Developer', 'SAP & ERP', 'Hyderabad', 'full-time', 3, 10,
            'Develop custom ABAP programs, reports, enhancements, and interfaces for SAP ECC and S/4HANA environments.',
            'SAP ABAP certification preferred\nExperience with ABAP OO, ALV, BAPI, BADI, User Exits\nIDOC and RFC experience\nFiori/UI5 exposure is a plus\nDebugging and performance tuning skills'],
        ['Cloud DevOps Engineer', 'Infrastructure', 'Hyderabad', 'full-time', 3, 8,
            'Design, implement, and manage cloud infrastructure on AWS/Azure. Automate CI/CD pipelines and ensure high availability.',
            'AWS/Azure certification preferred\nExperience with Terraform/CloudFormation\nDocker and Kubernetes expertise\nCI/CD pipeline setup (Jenkins/GitHub Actions)\nLinux administration skills'],
        ['Python Developer - Data Engineering', 'Data & AI', 'Hyderabad', 'full-time', 1, 5,
            'Build data pipelines, ETL processes, and analytics platforms using Python and modern data engineering tools.',
            'Strong Python skills\nExperience with Pandas, PySpark, or Airflow\nSQL and database knowledge\nCloud data services (AWS Glue, BigQuery)\nBasic understanding of ML concepts'],
        ['QA Automation Engineer', 'Quality', 'Hyderabad', 'full-time', 2, 6,
            'Design and implement automated testing frameworks for web, API, and mobile applications.',
            'Selenium/Cypress/Playwright experience\nAPI testing with Postman/RestAssured\nJava or Python test automation\nCI/CD integration for test suites\nAgile/Scrum experience'],
        ['SAP Basis Administrator', 'SAP & ERP', 'Hyderabad', 'full-time', 4, 10,
            'Manage SAP system landscapes, perform installations, upgrades, kernel patches, and ensure system availability.',
            'SAP Basis certification\nExperience with SAP HANA database administration\nSystem copy and migration experience\nSolution Manager configuration\nOS/DB level administration (Linux/HANA)'],
        ['Fresher - Graduate Engineer Trainee', 'Engineering', 'Hyderabad', 'full-time', 0, 0,
            'Start your career at PrimeAxis IT! We are hiring passionate fresh graduates in Computer Science, Electronics, and IT for our training and placement program.',
            'B.Tech/B.E. in CSE, ECE, IT, or related field\n2024/2025 pass-out\nStrong fundamentals in programming or electronics\nWillingness to learn and adapt\nGood communication skills'],
    ];
    const insertJob = db.prepare('INSERT INTO job_postings (title, department, location, type, experience_min, experience_max, description, requirements) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    jobs.forEach(j => insertJob.run(...j));
    console.log('✅ Job postings seeded');
}

// ===== SEED DEFAULT ADMIN =====
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
    const hash = bcrypt.hashSync('admin@123', 10);
    db.prepare(`
        INSERT INTO users (email, password, role, name, must_change_password)
        VALUES (?, ?, 'admin', 'System Administrator', 1)
    `).run('admin@primeaxisit.com', hash);
    console.log('✅ Default admin created: admin@primeaxisit.com / admin@123');
}

// ===== SEED COMPANY HOLIDAYS 2026 (Indian Government + Company) =====
const holidaysExist = db.prepare('SELECT COUNT(*) as c FROM company_holidays WHERE year = 2026').get();
if (holidaysExist.c === 0) {
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
    const insertHoliday = db.prepare('INSERT INTO company_holidays (name, date, day_of_week, type, year) VALUES (?, ?, ?, ?, 2026)');
    holidays2026.forEach(h => insertHoliday.run(...h));
    console.log('✅ 2026 holidays seeded');
}

// ===== HELPER: Generate Employee Code =====
function generateEmployeeCode() {
    const last = db.prepare('SELECT employee_code FROM employees ORDER BY id DESC LIMIT 1').get();
    if (!last || !last.employee_code) return 'PAX-001';
    const num = parseInt(last.employee_code.replace('PAX-', '')) + 1;
    return 'PAX-' + String(num).padStart(3, '0');
}

// ===== HELPER: Generate Offer Reference =====
function generateOfferRef() {
    const year = new Date().getFullYear();
    const count = db.prepare('SELECT COUNT(*) as c FROM offer_letters WHERE reference_no LIKE ?').get(`PAX/OL/${year}%`);
    const num = (count.c || 0) + 1;
    return `PAX/OL/${year}/${String(num).padStart(3, '0')}`;
}

// ===== HELPER: Generate Relieving Reference =====
function generateRelievingRef() {
    const year = new Date().getFullYear();
    const count = db.prepare('SELECT COUNT(*) as c FROM relieving_letters WHERE reference_no LIKE ?').get(`PAX/RL/${year}%`);
    const num = (count.c || 0) + 1;
    return `PAX/RL/${year}/${String(num).padStart(3, '0')}`;
}

// ===== HELPER: Generate Ticket Number =====
function generateTicketNo() {
    const count = db.prepare('SELECT COUNT(*) as c FROM tickets').get();
    const num = (count.c || 0) + 1;
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

module.exports = { db, generateEmployeeCode, generateOfferRef, generateRelievingRef, generateTicketNo, generateBGVToken, generateTempPassword };
