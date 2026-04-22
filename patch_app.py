#!/usr/bin/env python3
import sys

with open('server/app.js', 'r') as f:
    content = f.read()

old_block = """        // Notify HR/Admin
        const hrUsers = await db.prepare("SELECT id FROM users WHERE role IN ('admin','hr') AND is_active = 1").all();
        for (const u of hrUsers) {
            await db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)').run(u.id, 'New Job Application', `${first_name} ${last_name} applied for ${job.title}`, 'info', '/applications');
        }

        res.json({ id: result.lastInsertRowid, message: 'Application submitted successfully! We will review your profile and get back to you.' });"""

new_block = """        // Notify HR/Admin
        const hrUsers = await db.prepare("SELECT id FROM users WHERE role IN ('admin','hr') AND is_active = 1").all();
        for (const u of hrUsers) {
            await db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)').run(u.id, 'New Job Application', `${first_name} ${last_name} applied for ${job.title}`, 'info', '/applications');
        }

        // Send email to HR with resume attached
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.hostinger.com',
                port: parseInt(process.env.SMTP_PORT) || 465,
                secure: true,
                auth: {
                    user: process.env.SMTP_USER || 'info@primeaxisit.com',
                    pass: process.env.SMTP_PASS || '',
                },
            });

            await transporter.sendMail({
                from: `"PrimeAxis Careers" <${process.env.SMTP_USER || 'info@primeaxisit.com'}>`,
                to: 'hr@primeaxisit.com',
                replyTo: email,
                subject: `New Job Application: ${job.title} — ${first_name} ${last_name}`,
                html: `<h2>New Job Application Received</h2>
                    <table style="border-collapse:collapse;width:100%;max-width:600px">
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Position</td><td style="padding:8px;border:1px solid #ddd">${job.title}</td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #ddd">${first_name} ${last_name}</td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #ddd">${email}</td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #ddd">${phone || '\\u2014'}</td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Experience</td><td style="padding:8px;border:1px solid #ddd">${experience_type === 'fresher' ? 'Fresher' : experience_years + ' years'}</td></tr>
                        ${cover_note ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Cover Note</td><td style="padding:8px;border:1px solid #ddd">${cover_note}</td></tr>` : ''}
                    </table>`,
                attachments: [{
                    filename: req.file.originalname,
                    path: req.file.path,
                }],
            });
            console.log('Job application email sent to hr@primeaxisit.com');
        } catch (emailErr) {
            console.error('HR email send failed (application saved to DB):', emailErr.message);
        }

        res.json({ id: result.lastInsertRowid, message: 'Application submitted successfully! We will review your profile and get back to you.' });"""

if old_block in content:
    content = content.replace(old_block, new_block, 1)
    with open('server/app.js', 'w') as f:
        f.write(content)
    print('SUCCESS')
else:
    print('NOT FOUND')
    sys.exit(1)
