/* =============================================
   PrimeAxis IT — HR Portal JavaScript
   ============================================= */

// ===== AUTH & API HELPERS =====
const API = '/api';
const token = () => localStorage.getItem('primeaxis_token');
const user = () => JSON.parse(localStorage.getItem('primeaxis_user') || 'null');

if (!token()) window.location.href = '/portal/login.html';

async function api(path, opts = {}) {
    const res = await fetch(API + path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token(), ...opts.headers }
    });
    const data = await res.json();
    if (res.status === 401) { localStorage.clear(); window.location.href = '/portal/login.html'; return; }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}
const apiGet = (path) => api(path);
const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const apiPut = (path, body) => api(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });

// ===== FORMAT HELPERS =====
function formatINR(n) {
    if (!n && n !== 0) return '₹0';
    const num = Math.round(n);
    const s = Math.abs(num).toString();
    if (s.length <= 3) return (num < 0 ? '-' : '') + '₹' + s;
    let last = s.substring(s.length - 3);
    let rest = s.substring(0, s.length - 3);
    return (num < 0 ? '-' : '') + '₹' + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last;
}
function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatDateLong(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }); }
function statusBadge(s) { return `<span class="badge-status ${(s||'').replace(/ /g,'_')}">${(s||'').replace(/_/g,' ')}</span>`; }
const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

// Amount in words (Indian numbering)
function numberToWords(num) {
    if (!num || num === 0) return 'Zero';
    num = Math.round(Math.abs(num));
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    function twoD(n) { return n < 20 ? ones[n] : tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : ''); }
    function threeD(n) { return n >= 100 ? ones[Math.floor(n/100)]+' Hundred'+(n%100 ? ' and '+twoD(n%100) : '') : twoD(n); }
    if (num >= 10000000) return threeD(Math.floor(num/10000000))+' Crore'+(num%10000000 ? ' '+numberToWords(num%10000000) : '');
    if (num >= 100000) return twoD(Math.floor(num/100000))+' Lakh'+(num%100000 ? ' '+numberToWords(num%100000) : '');
    if (num >= 1000) return twoD(Math.floor(num/1000))+' Thousand'+(num%1000 ? ' '+numberToWords(num%1000) : '');
    return threeD(num);
}
function amountInWords(num) { return 'Rupees ' + numberToWords(num) + ' Only'; }

// Country code dropdown for phone fields
const countryCodes = [
    { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India' },
    { code: '+1', country: 'US', flag: '🇺🇸', name: 'United States' },
    { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
    { code: '+971', country: 'AE', flag: '🇦🇪', name: 'UAE' },
    { code: '+966', country: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
    { code: '+65', country: 'SG', flag: '🇸🇬', name: 'Singapore' },
    { code: '+61', country: 'AU', flag: '🇦🇺', name: 'Australia' },
    { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany' },
    { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France' },
    { code: '+81', country: 'JP', flag: '🇯🇵', name: 'Japan' },
    { code: '+86', country: 'CN', flag: '🇨🇳', name: 'China' },
    { code: '+82', country: 'KR', flag: '🇰🇷', name: 'South Korea' },
    { code: '+60', country: 'MY', flag: '🇲🇾', name: 'Malaysia' },
    { code: '+977', country: 'NP', flag: '🇳🇵', name: 'Nepal' },
    { code: '+94', country: 'LK', flag: '🇱🇰', name: 'Sri Lanka' },
    { code: '+880', country: 'BD', flag: '🇧🇩', name: 'Bangladesh' },
    { code: '+92', country: 'PK', flag: '🇵🇰', name: 'Pakistan' },
    { code: '+27', country: 'ZA', flag: '🇿🇦', name: 'South Africa' },
    { code: '+234', country: 'NG', flag: '🇳🇬', name: 'Nigeria' },
    { code: '+254', country: 'KE', flag: '🇰🇪', name: 'Kenya' },
];

function phoneCodeOptions(selectedCode) {
    const sel = selectedCode || '+91';
    return countryCodes.map(c => `<option value="${c.code}" ${c.code === sel ? 'selected' : ''}>${c.flag} ${c.code} ${c.name}</option>`).join('');
}

function phoneFieldHTML(id, existingPhone) {
    let currentCode = '+91', currentNum = '';
    if (existingPhone) {
        const match = existingPhone.match(/^(\+\d{1,4})\s*(.*)$/);
        if (match) { currentCode = match[1]; currentNum = match[2]; }
        else { currentNum = existingPhone; }
    }
    return `<div class="phone-input-group">
        <select class="form-control phone-code" id="${id}_code">${phoneCodeOptions(currentCode)}</select>
        <input class="form-control phone-num" id="${id}_num" type="tel" value="${esc(currentNum)}" placeholder="Phone number">
    </div>`;
}

function getPhoneValue(id) {
    const code = $(`#${id}_code`);
    const num = $(`#${id}_num`);
    if (!code || !num || !num.value.trim()) return '';
    return code.value + ' ' + num.value.trim();
}

// ===== DOM REFS =====
const $ = (sel) => document.querySelector(sel);
const content = $('#content');
const pageTitle = $('#pageTitle');
const sidebarNav = $('#sidebarNav');
const modalOverlay = $('#modalOverlay');
const modalTitle = $('#modalTitle');
const modalBody = $('#modalBody');
const toastContainer = $('#toastContainer');

// ===== TOAST =====
function toast(msg, type = 'success') {
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas ${icons[type]}"></i> ${msg}`;
    toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// ===== MODAL =====
function openModal(title, html, opts = {}) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    const modalEl = modalOverlay.querySelector('.modal');
    if (opts.wide) modalEl.classList.add('modal-wide'); else modalEl.classList.remove('modal-wide');
    modalOverlay.classList.add('show');
}
function closeModal() { modalOverlay.classList.remove('show'); }
$('#modalClose').onclick = closeModal;
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };

// ===== SIDEBAR NAVIGATION =====
const u = user();
$('#userName').textContent = u?.name || 'User';
$('#userRole').textContent = u?.role || '';
$('#userAvatar').textContent = (u?.name || 'U')[0].toUpperCase();

const navConfig = {
    admin: [
        { section: 'Main', items: [
            { id: 'dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
            { id: 'feed', icon: 'fa-comments', label: 'Feed / Chat' },
            { id: 'users', icon: 'fa-user-shield', label: 'Manage Users' },
        ]},
        { section: 'HR', items: [
            { id: 'employees', icon: 'fa-users', label: 'Employees' },
            { id: 'offers', icon: 'fa-file-contract', label: 'Offer Letters' },
            { id: 'relieving', icon: 'fa-file-circle-check', label: 'Relieving Letters' },
            { id: 'resignations', icon: 'fa-person-walking-arrow-right', label: 'Resignations' },
        ]},
        { section: 'Operations', items: [
            { id: 'timesheets', icon: 'fa-clock', label: 'Timesheets' },
            { id: 'leaves', icon: 'fa-calendar-check', label: 'Leaves' },
            { id: 'payslips', icon: 'fa-receipt', label: 'Payslips' },
            { id: 'payslip-extras', icon: 'fa-gift', label: 'Payslip Extras' },
            { id: 'holidays', icon: 'fa-calendar-star', label: 'Company Holidays' },
            { id: 'tax-declarations', icon: 'fa-file-invoice-dollar', label: 'Tax Declarations' },
            { id: 'form16', icon: 'fa-file-shield', label: 'Form 16' },
        ]},
        { section: 'Training', items: [
            { id: 'training', icon: 'fa-graduation-cap', label: 'Training Modules' },
        ]},
        { section: 'Verification', items: [
            { id: 'bgv', icon: 'fa-user-shield', label: 'BGV Management' },
        ]},
        { section: 'Support', items: [
            { id: 'tickets', icon: 'fa-ticket', label: 'Support Tickets' },
        ]}
    ],
    hr: [
        { section: 'Main', items: [
            { id: 'dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
            { id: 'feed', icon: 'fa-comments', label: 'Feed / Chat' },
        ]},
        { section: 'Self Service', items: [
            { id: 'my-profile', icon: 'fa-user', label: 'My Profile' },
            { id: 'my-timesheets', icon: 'fa-clock', label: 'My Timesheets' },
            { id: 'my-leaves', icon: 'fa-calendar-check', label: 'My Leaves' },
            { id: 'my-payslips', icon: 'fa-receipt', label: 'My Payslips' },
            { id: 'my-tax', icon: 'fa-file-invoice-dollar', label: 'My Tax Declaration' },
            { id: 'my-form16', icon: 'fa-file-shield', label: 'My Form 16' },
            { id: 'my-training', icon: 'fa-graduation-cap', label: 'My Training' },
            { id: 'my-resignation', icon: 'fa-person-walking-arrow-right', label: 'My Resignation' },
        ]},
        { section: 'HR Management', items: [
            { id: 'employees', icon: 'fa-users', label: 'Employees' },
            { id: 'offers', icon: 'fa-file-contract', label: 'Offer Letters' },
            { id: 'relieving', icon: 'fa-file-circle-check', label: 'Relieving Letters' },
            { id: 'resignations', icon: 'fa-person-walking-arrow-right', label: 'Resignations' },
        ]},
        { section: 'Operations', items: [
            { id: 'leaves', icon: 'fa-calendar-check', label: 'Leaves' },
            { id: 'holidays', icon: 'fa-calendar-star', label: 'Company Holidays' },
            { id: 'tax-declarations', icon: 'fa-file-invoice-dollar', label: 'Tax Declarations' },
            { id: 'form16', icon: 'fa-file-shield', label: 'Form 16' },
        ]},
        { section: 'Training', items: [
            { id: 'training', icon: 'fa-graduation-cap', label: 'Training Modules' },
        ]},
        { section: 'Verification', items: [
            { id: 'bgv', icon: 'fa-user-shield', label: 'BGV Management' },
        ]},
        { section: 'Support', items: [
            { id: 'tickets', icon: 'fa-ticket', label: 'Support Tickets' },
            { id: 'my-tickets', icon: 'fa-ticket', label: 'Raise Ticket' },
        ]}
    ],
    manager: [
        { section: 'Main', items: [
            { id: 'dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
            { id: 'feed', icon: 'fa-comments', label: 'Feed / Chat' },
        ]},
        { section: 'Self Service', items: [
            { id: 'my-profile', icon: 'fa-user', label: 'My Profile' },
            { id: 'my-timesheets', icon: 'fa-clock', label: 'My Timesheets' },
            { id: 'my-leaves', icon: 'fa-calendar-check', label: 'My Leaves' },
            { id: 'my-payslips', icon: 'fa-receipt', label: 'My Payslips' },
            { id: 'my-tax', icon: 'fa-file-invoice-dollar', label: 'My Tax Declaration' },
            { id: 'my-form16', icon: 'fa-file-shield', label: 'My Form 16' },
            { id: 'my-training', icon: 'fa-graduation-cap', label: 'My Training' },
            { id: 'my-resignation', icon: 'fa-person-walking-arrow-right', label: 'My Resignation' },
        ]},
        { section: 'Approvals', items: [
            { id: 'timesheets', icon: 'fa-clock', label: 'Team Timesheets' },
            { id: 'leaves', icon: 'fa-calendar-check', label: 'Team Leave Requests' },
            { id: 'offers', icon: 'fa-file-contract', label: 'Offer Approvals' },
            { id: 'resignations', icon: 'fa-person-walking-arrow-right', label: 'Resignations' },
        ]},
        { section: 'Support', items: [
            { id: 'tickets', icon: 'fa-ticket', label: 'Support Tickets' },
            { id: 'my-tickets', icon: 'fa-ticket', label: 'Raise Ticket' },
        ]}
    ],
    accountant: [
        { section: 'Main', items: [
            { id: 'dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
            { id: 'feed', icon: 'fa-comments', label: 'Feed / Chat' },
        ]},
        { section: 'Self Service', items: [
            { id: 'my-profile', icon: 'fa-user', label: 'My Profile' },
            { id: 'my-timesheets', icon: 'fa-clock', label: 'My Timesheets' },
            { id: 'my-leaves', icon: 'fa-calendar-check', label: 'My Leaves' },
            { id: 'my-payslips', icon: 'fa-receipt', label: 'My Payslips' },
            { id: 'my-tax', icon: 'fa-file-invoice-dollar', label: 'My Tax Declaration' },
            { id: 'my-form16', icon: 'fa-file-shield', label: 'My Form 16' },
            { id: 'my-training', icon: 'fa-graduation-cap', label: 'My Training' },
            { id: 'holidays', icon: 'fa-calendar-star', label: 'Company Holidays' },
        ]},
        { section: 'Payroll', items: [
            { id: 'payslips', icon: 'fa-receipt', label: 'Payslips' },
            { id: 'payslip-extras', icon: 'fa-gift', label: 'Payslip Extras' },
            { id: 'employees', icon: 'fa-users', label: 'Employees' },
            { id: 'form16', icon: 'fa-file-shield', label: 'Form 16' },
        ]},
        { section: 'Support', items: [
            { id: 'my-tickets', icon: 'fa-ticket', label: 'Raise Ticket' },
        ]}
    ],
    employee: [
        { section: 'Main', items: [
            { id: 'dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
            { id: 'feed', icon: 'fa-comments', label: 'Feed / Chat' },
        ]},
        { section: 'Self Service', items: [
            { id: 'my-profile', icon: 'fa-user', label: 'My Profile' },
            { id: 'my-offer', icon: 'fa-file-contract', label: 'Offer Letter' },
            { id: 'my-timesheets', icon: 'fa-clock', label: 'Timesheets' },
            { id: 'my-leaves', icon: 'fa-calendar-check', label: 'Leaves' },
            { id: 'my-payslips', icon: 'fa-receipt', label: 'Payslips' },
            { id: 'holidays', icon: 'fa-calendar-star', label: 'Company Holidays' },
            { id: 'my-tax', icon: 'fa-file-invoice-dollar', label: 'Tax Declaration' },
            { id: 'my-form16', icon: 'fa-file-shield', label: 'Form 16' },
            { id: 'my-training', icon: 'fa-graduation-cap', label: 'Training' },
            { id: 'my-resignation', icon: 'fa-person-walking-arrow-right', label: 'Resignation' },
        ]},
        { section: 'Support', items: [
            { id: 'my-tickets', icon: 'fa-ticket', label: 'Raise Ticket' },
        ]}
    ]
};

function buildSidebar() {
    const nav = navConfig[u.role] || navConfig.employee;
    sidebarNav.innerHTML = nav.map(sec => `
        <div class="nav-section">
            <div class="nav-section-title">${sec.section}</div>
            ${sec.items.map(item => `
                <div class="nav-item" data-page="${item.id}">
                    <i class="fas ${item.icon}"></i> ${item.label}
                </div>
            `).join('')}
        </div>
    `).join('');

    sidebarNav.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => navigate(item.dataset.page);
    });
}
buildSidebar();

// ===== LOGOUT =====
$('#logoutBtn').onclick = () => { localStorage.clear(); window.location.href = '/portal/login.html'; };

// ===== MOBILE SIDEBAR =====
$('#sidebarToggle').onclick = () => $('#sidebar').classList.add('open');
$('#sidebarClose').onclick = () => $('#sidebar').classList.remove('open');

// ===== ROUTING =====
function navigate(page) {
    window.location.hash = page;
    sidebarNav.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    $('#sidebar').classList.remove('open');
    renderPage(page);
}

function renderPage(page) {
    content.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
    const pages = {
        dashboard: pageDashboard,
        feed: pageFeed,
        users: pageUsers,
        employees: pageEmployees,
        offers: pageOffers,
        relieving: pageRelievingLetters,
        resignations: pageResignations,
        timesheets: pageTimesheets,
        leaves: pageLeaves,
        payslips: pagePayslips,
        'payslip-extras': pagePayslipExtras,
        tickets: pageTickets,
        bgv: pageBGV,
        holidays: pageHolidays,
        'tax-declarations': pageTaxDeclarationsAdmin,
        form16: pageForm16,
        training: pageTraining,
        'my-profile': pageMyProfile,
        'my-offer': pageMyOffer,
        'my-timesheets': pageMyTimesheets,
        'my-leaves': pageMyLeaves,
        'my-payslips': pageMyPayslips,
        'my-relieving': pageMyRelieving,
        'my-tickets': pageMyTickets,
        'my-tax': pageMyTaxDeclaration,
        'my-form16': pageMyForm16,
        'my-training': pageMyTraining,
        'my-resignation': pageMyResignation,
    };
    const fn = pages[page] || pageDashboard;
    fn().catch(err => { content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error</h3><p>${err.message}</p></div>`; });
}

// Init
const hash = window.location.hash.replace('#', '') || 'dashboard';
navigate(hash);

// ===================================================================
//  PAGE: DASHBOARD
// ===================================================================
async function pageDashboard() {
    pageTitle.textContent = 'Dashboard';
    const stats = await apiGet('/dashboard');
    let html = '<div class="stats-grid">';

    if (['admin', 'hr'].includes(u.role)) {
        html += statCard('fa-users', 'blue', stats.totalEmployees, 'Total Employees');
        html += statCard('fa-user-check', 'green', stats.activeEmployees, 'Active Employees');
        html += statCard('fa-file-contract', 'purple', stats.pendingOffers, 'Pending Offers');
        html += statCard('fa-calendar-xmark', 'gold', stats.pendingLeaves, 'Pending Leaves');
        if (stats.openTickets !== undefined) html += statCard('fa-ticket', 'pink', stats.openTickets, 'Open Tickets');
    }
    if (['admin', 'manager'].includes(u.role)) {
        html += statCard('fa-clock', 'cyan', stats.pendingTimesheets, 'Pending Timesheets');
        html += statCard('fa-calendar-check', 'gold', stats.pendingLeaveApprovals, 'Leave Approvals');
        if (stats.pendingOfferApprovals !== undefined) html += statCard('fa-file-signature', 'purple', stats.pendingOfferApprovals, 'Offer Approvals');
    }
    if (['admin', 'accountant'].includes(u.role)) {
        html += statCard('fa-receipt', 'green', stats.payslipsThisMonth, 'Payslips This Month');
        html += statCard('fa-indian-rupee-sign', 'gold', stats.totalActiveWithCTC, 'Active with CTC');
    }
    if (u.role === 'employee') {
        const lb = stats.leaveBalance;
        if (lb) {
            html += statCard('fa-umbrella-beach', 'blue', (lb.casual_total - lb.casual_used), 'Casual Leaves Left');
            html += statCard('fa-briefcase-medical', 'green', (lb.sick_total - lb.sick_used), 'Sick Leaves Left');
            html += statCard('fa-star', 'gold', (lb.earned_total - lb.earned_used), 'Earned Leaves Left');
        }
        html += statCard('fa-clock', 'cyan', stats.pendingTimesheets || 0, 'Draft Timesheets');
        html += statCard('fa-receipt', 'purple', stats.totalPayslips || 0, 'Payslips Available');
        if (stats.openTickets !== undefined) html += statCard('fa-ticket', 'pink', stats.openTickets, 'Open Tickets');
    }

    html += '</div>';

    // Anniversaries and training widgets
    try {
        if (['admin', 'hr', 'manager'].includes(u.role)) {
            const anniversaries = await apiGet('/anniversaries');
            if (anniversaries.length > 0) {
                html += `<div class="table-card" style="margin-top:20px;padding:16px">
                    <h3 style="margin-bottom:12px"><i class="fas fa-cake-candles" style="color:var(--p-gold)"></i> Work Anniversaries This Week</h3>
                    <div class="anniversary-list">${anniversaries.map(a => `
                        <div class="anniversary-card">
                            <div class="anniversary-avatar">${(a.name || 'U')[0].toUpperCase()}</div>
                            <div><strong>${esc(a.name)}</strong><br><span style="color:var(--p-text-muted);font-size:0.8rem">${esc(a.designation || '')} · ${a.years} year(s) · ${formatDate(a.date_of_joining)}</span></div>
                        </div>
                    `).join('')}</div>
                </div>`;
            }
        }
        if (u.role === 'employee') {
            const training = await apiGet('/training/my-assignments');
            const pending = training.filter(t => t.status === 'pending' || t.status === 'in_progress');
            if (pending.length > 0) {
                html += `<div class="table-card" style="margin-top:20px;padding:16px">
                    <h3 style="margin-bottom:12px"><i class="fas fa-graduation-cap" style="color:var(--p-primary)"></i> Pending Training (${pending.length})</h3>
                    ${pending.map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--p-border)">
                        <div><strong>${esc(t.module_title || 'Training')}</strong>${t.due_date ? ` · Due: ${formatDate(t.due_date)}` : ''}</div>
                        <button class="btn btn-sm btn-primary" onclick="navigate('my-training')">Start</button>
                    </div>`).join('')}
                </div>`;
            }
        }
    } catch (e) { /* ignore widget errors */ }

    html += `<p style="color:var(--p-text-muted);font-size:0.85rem;margin-top:16px">Welcome back, <strong>${u.name}</strong>. You are logged in as <strong style="color:var(--p-primary);text-transform:capitalize">${u.role}</strong>.</p>`;
    content.innerHTML = html;
}

function statCard(icon, color, value, label) {
    return `<div class="stat-card"><div class="stat-icon ${color}"><i class="fas ${icon}"></i></div><div class="stat-info"><h4>${value ?? 0}</h4><p>${label}</p></div></div>`;
}

// ===================================================================
//  PAGE: MANAGE USERS (Admin)
// ===================================================================
async function pageUsers() {
    pageTitle.textContent = 'Manage Users';
    const users = await apiGet('/users');
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-user-shield"></i> All Users (${users.length})</h3>
                <button class="btn btn-primary" onclick="showCreateUserModal()"><i class="fas fa-plus"></i> Add User</button>
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                    ${users.map(u => `<tr>
                        <td><strong>${esc(u.name)}</strong></td>
                        <td>${esc(u.email)}</td>
                        <td><span class="badge-status active" style="text-transform:capitalize">${u.role}</span></td>
                        <td>${u.is_active ? '<span class="badge-status active">Active</span>' : '<span class="badge-status inactive">Inactive</span>'}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="resetPasswordModal(${u.id},'${esc(u.name)}')"><i class="fas fa-key"></i></button>
                            <button class="btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleUser(${u.id},${u.is_active ? 0 : 1})">${u.is_active ? '<i class="fas fa-ban"></i>' : '<i class="fas fa-check"></i>'}</button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showCreateUserModal = () => {
    openModal('Create New User', `
        <div class="form-grid">
            <div class="form-group"><label>Full Name</label><input class="form-control" id="mu_name" placeholder="John Doe"></div>
            <div class="form-group"><label>Email</label><input class="form-control" id="mu_email" placeholder="john@primeaxisit.com" type="email"></div>
            <div class="form-group"><label>Role</label><select class="form-control" id="mu_role">
                <option value="employee">Employee</option><option value="hr">HR</option><option value="manager">Manager</option><option value="accountant">Accountant</option>
            </select></div>
            <div class="form-group"><label>Temporary Password</label><input class="form-control" id="mu_pass" placeholder="Min 6 characters"></div>
        </div>
        <button class="btn btn-primary" onclick="createUser()" style="margin-top:8px"><i class="fas fa-plus"></i> Create User</button>
    `);
};

window.createUser = async () => {
    try {
        await apiPost('/users', { name: $('#mu_name').value, email: $('#mu_email').value, role: $('#mu_role').value, password: $('#mu_pass').value });
        toast('User created successfully');
        closeModal();
        pageUsers();
    } catch (e) { toast(e.message, 'error'); }
};

window.resetPasswordModal = (id, name) => {
    openModal('Reset Password — ' + name, `
        <div class="form-group"><label>New Password</label><input class="form-control" id="rp_pass" placeholder="Min 6 characters"></div>
        <button class="btn btn-primary" onclick="doResetPassword(${id})" style="margin-top:8px"><i class="fas fa-key"></i> Reset</button>
    `);
};

window.doResetPassword = async (id) => {
    try {
        await apiPost(`/users/${id}/reset-password`, { password: $('#rp_pass').value });
        toast('Password reset. User must change on next login.');
        closeModal();
    } catch (e) { toast(e.message, 'error'); }
};

window.toggleUser = async (id, active) => {
    try {
        await apiPut(`/users/${id}`, { is_active: active });
        toast(active ? 'User activated' : 'User deactivated');
        pageUsers();
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: EMPLOYEES
// ===================================================================
async function pageEmployees() {
    pageTitle.textContent = 'Employees';
    const emps = await apiGet('/employees');
    const canEdit = ['admin', 'hr'].includes(u.role);
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-users"></i> Employees (${emps.length})</h3>
                ${canEdit ? '<button class="btn btn-primary" onclick="showAddEmployeeModal()"><i class="fas fa-plus"></i> Add Employee</button>' : ''}
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Designation</th><th>Department</th><th>CTC</th><th>Status</th>${canEdit ? '<th>Actions</th>' : ''}</tr></thead>
                <tbody>
                    ${emps.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--p-text-muted)">No employees yet</td></tr>' : emps.map(e => `<tr>
                        <td><strong>${esc(e.employee_code || '')}</strong></td>
                        <td>${esc(e.name)}</td>
                        <td>${esc(e.email)}</td>
                        <td>${esc(e.designation || '—')}</td>
                        <td>${esc(e.department || '—')}</td>
                        <td>${e.annual_ctc ? formatINR(e.annual_ctc) : '—'}</td>
                        <td>${statusBadge(e.status)}</td>
                        ${canEdit ? `<td><button class="btn btn-sm btn-secondary" onclick="showEditEmployeeModal(${e.id})"><i class="fas fa-edit"></i></button></td>` : ''}
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showAddEmployeeModal = () => {
    openModal('Add New Employee', employeeForm());
};

window.showEditEmployeeModal = async (id) => {
    const emp = await apiGet(`/employees/${id}`);
    openModal('Edit Employee — ' + emp.name, employeeForm(emp));
};

function employeeForm(e = {}) {
    return `
        <div class="form-grid">
            <div class="form-group"><label>Full Name *</label><input class="form-control" id="ef_name" value="${esc(e.name || '')}"></div>
            <div class="form-group"><label>Email *</label><input class="form-control" id="ef_email" value="${esc(e.email || '')}" type="email"></div>
            <div class="form-group"><label>Phone</label>${phoneFieldHTML('ef_phone', e.phone)}</div>
            <div class="form-group"><label>Designation *</label><input class="form-control" id="ef_designation" value="${esc(e.designation || '')}"></div>
            <div class="form-group"><label>Department *</label><input class="form-control" id="ef_department" value="${esc(e.department || '')}"></div>
            <div class="form-group"><label>Date of Joining</label><input class="form-control" id="ef_doj" type="date" value="${e.date_of_joining || ''}"></div>
            <div class="form-group"><label>Annual CTC (₹)</label><input class="form-control" id="ef_ctc" type="number" value="${e.annual_ctc || ''}"></div>
            <div class="form-group"><label>Status</label><select class="form-control" id="ef_status">
                <option value="onboarding" ${e.status==='onboarding'?'selected':''}>Onboarding</option>
                <option value="active" ${e.status==='active'?'selected':''}>Active</option>
                <option value="inactive" ${e.status==='inactive'?'selected':''}>Inactive</option>
            </select></div>
            <div class="form-group full-width"><label>Address</label><input class="form-control" id="ef_address" value="${esc(e.address || '')}"></div>
            <div class="form-group"><label>City</label><input class="form-control" id="ef_city" value="${esc(e.city || '')}"></div>
            <div class="form-group"><label>State</label><input class="form-control" id="ef_state" value="${esc(e.state || 'Telangana')}"></div>
            <div class="form-group"><label>Pincode</label><input class="form-control" id="ef_pincode" value="${esc(e.pincode || '')}"></div>
            <div class="form-group"><label>PAN</label><input class="form-control" id="ef_pan" value="${esc(e.pan || '')}"></div>
            <div class="form-group"><label>Aadhar</label><input class="form-control" id="ef_aadhar" value="${esc(e.aadhar || '')}"></div>
            <div class="form-group"><label>UAN</label><input class="form-control" id="ef_uan" value="${esc(e.uan || '')}"></div>
            <div class="form-group"><label>Bank Name</label><input class="form-control" id="ef_bank" value="${esc(e.bank_name || '')}"></div>
            <div class="form-group"><label>Account No</label><input class="form-control" id="ef_accno" value="${esc(e.bank_account || '')}"></div>
            <div class="form-group"><label>IFSC Code</label><input class="form-control" id="ef_ifsc" value="${esc(e.ifsc_code || '')}"></div>
        </div>
        <button class="btn btn-primary" onclick="saveEmployee(${e.id || 0})" style="margin-top:12px"><i class="fas fa-save"></i> Save</button>
    `;
}

window.saveEmployee = async (id) => {
    const data = {
        name: $('#ef_name').value, email: $('#ef_email').value, phone: getPhoneValue('ef_phone'),
        designation: $('#ef_designation').value, department: $('#ef_department').value,
        date_of_joining: $('#ef_doj').value, annual_ctc: parseFloat($('#ef_ctc').value) || 0,
        status: $('#ef_status').value, address: $('#ef_address').value, city: $('#ef_city').value,
        state: $('#ef_state').value, pincode: $('#ef_pincode').value, pan: $('#ef_pan').value,
        aadhar: $('#ef_aadhar').value, uan: $('#ef_uan').value, bank_name: $('#ef_bank').value,
        bank_account: $('#ef_accno').value, ifsc_code: $('#ef_ifsc').value,
    };
    try {
        if (id) { await apiPut(`/employees/${id}`, data); toast('Employee updated'); }
        else { await apiPost('/employees', data); toast('Employee added'); }
        closeModal(); pageEmployees();
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: OFFER LETTERS
// ===================================================================
async function pageOffers() {
    pageTitle.textContent = 'Offer Letters';
    const offers = await apiGet('/offers');
    const canCreate = ['admin', 'hr'].includes(u.role);
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-file-contract"></i> Offer Letters (${offers.length})</h3>
                ${canCreate ? '<button class="btn btn-primary" onclick="showCreateOfferModal()"><i class="fas fa-plus"></i> Create Offer</button>' : ''}
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Ref</th><th>Candidate</th><th>Designation</th><th>Type</th><th>CTC</th><th>Joining</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                    ${offers.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--p-text-muted)">No offer letters</td></tr>' : offers.map(o => `<tr>
                        <td><strong>${esc(o.reference_no)}</strong></td>
                        <td>${esc(o.employee_name)}</td>
                        <td>${esc(o.designation)}</td>
                        <td><span class="badge ${o.employment_type === 'contract' ? 'badge-warning' : 'badge-info'}">${o.employment_type === 'contract' ? 'Contract' : 'Permanent'}</span></td>
                        <td>${formatINR(o.annual_ctc)}</td>
                        <td>${formatDate(o.date_of_joining)}</td>
                        <td>${statusBadge(o.status)}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewOffer(${o.id})"><i class="fas fa-eye"></i></button>
                            ${o.status === 'draft' && canCreate ? `<button class="btn btn-sm btn-primary" onclick="submitOffer(${o.id})"><i class="fas fa-paper-plane"></i></button>` : ''}
                            ${o.status === 'pending_approval' && ['admin','manager'].includes(u.role) ? `<button class="btn btn-sm btn-success" onclick="approveOffer(${o.id})"><i class="fas fa-check"></i></button><button class="btn btn-sm btn-danger" onclick="rejectOffer(${o.id})"><i class="fas fa-times"></i></button>` : ''}
                            ${o.status === 'approved' && canCreate ? `<button class="btn btn-sm btn-primary" onclick="releaseOffer(${o.id})"><i class="fas fa-share"></i> Release</button>` : ''}
                            ${o.status === 'released' && canCreate ? `<button class="btn btn-sm btn-success" onclick="showBGVInviteModal(${o.id}, '${esc(o.employee_name)}', '${esc(o.employee_email || '')}')"><i class="fas fa-user-shield"></i> BGV</button>` : ''}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showCreateOfferModal = () => {
    openModal('Create Offer Letter', `
        <div class="form-grid">
            <div class="form-group"><label>Candidate Name *</label><input class="form-control" id="of_name"></div>
            <div class="form-group"><label>Email</label><input class="form-control" id="of_email" type="email"></div>
            <div class="form-group"><label>Phone</label>${phoneFieldHTML('of_phone', '')}</div>
            <div class="form-group full-width"><label>Address</label><input class="form-control" id="of_address"></div>
            <div class="form-group"><label>City</label><input class="form-control" id="of_city" value="Hyderabad"></div>
            <div class="form-group"><label>State</label><input class="form-control" id="of_state" value="Telangana"></div>
            <div class="form-group"><label>Pincode</label><input class="form-control" id="of_pincode"></div>
            <div class="form-group"><label>Designation *</label><input class="form-control" id="of_desig"></div>
            <div class="form-group"><label>Department *</label><input class="form-control" id="of_dept"></div>
            <div class="form-group"><label>Date of Joining *</label><input class="form-control" id="of_doj" type="date"></div>
            <div class="form-group"><label>Annual CTC (₹) *</label><input class="form-control" id="of_ctc" type="number" placeholder="e.g. 600000" oninput="previewBreakup()"></div>
            <div class="form-group"><label>Probation (months)</label><input class="form-control" id="of_prob" type="number" value="6"></div>
            <div class="form-group"><label>Notice Period (days)</label><input class="form-control" id="of_notice" type="number" value="90"></div>
            <div class="form-group"><label>Reporting Manager</label><input class="form-control" id="of_mgr"></div>
            <div class="form-group"><label>Work Location</label><input class="form-control" id="of_loc" value="Hyderabad"></div>
            <div class="form-group"><label>Employment Type *</label><select class="form-control" id="of_emptype" onchange="toggleContractFields()"><option value="permanent">Full-Time, Permanent</option><option value="contract">Contract</option></select></div>
            <div class="form-group" id="of_contract_end_group" style="display:none"><label>Contract End Date *</label><input class="form-control" id="of_contract_end" type="date"></div>
            <div class="form-group"><label>Shift Applicable</label><select class="form-control" id="of_shift"><option value="0">No</option><option value="1">Yes</option></select></div>
            <div class="form-group"><label>Joining Bonus (₹)</label><input class="form-control" id="of_jbonus" type="number" value="0" placeholder="0"></div>
            <div class="form-group"><label>Relocation Expense (₹)</label><input class="form-control" id="of_reloc" type="number" value="0" placeholder="0"></div>
            <div class="form-group full-width"><label>Additional Terms</label><textarea class="form-control" id="of_terms" rows="3"></textarea></div>
        </div>

        <div class="doc-upload-section">
            <h3><i class="fas fa-file-upload"></i> Mandatory Documents</h3>
            <p class="doc-upload-note">All three documents must be uploaded to create an offer letter. Allowed: JPG, PNG, WebP, PDF (max 5MB each)</p>
            <div class="doc-upload-grid">
                <div class="doc-upload-card" id="card_aadhar">
                    <label class="doc-upload-label">
                        <i class="fas fa-id-card"></i>
                        <span>Aadhar Card *</span>
                        <input type="file" id="of_doc_aadhar" accept=".jpg,.jpeg,.png,.webp,.pdf" onchange="previewDocUpload(this, 'preview_aadhar', 'card_aadhar')" hidden>
                        <div class="doc-upload-btn">Choose File</div>
                    </label>
                    <div class="doc-preview" id="preview_aadhar"></div>
                </div>
                <div class="doc-upload-card" id="card_pan">
                    <label class="doc-upload-label">
                        <i class="fas fa-address-card"></i>
                        <span>PAN Card *</span>
                        <input type="file" id="of_doc_pan" accept=".jpg,.jpeg,.png,.webp,.pdf" onchange="previewDocUpload(this, 'preview_pan', 'card_pan')" hidden>
                        <div class="doc-upload-btn">Choose File</div>
                    </label>
                    <div class="doc-preview" id="preview_pan"></div>
                </div>
                <div class="doc-upload-card" id="card_photo">
                    <label class="doc-upload-label">
                        <i class="fas fa-camera"></i>
                        <span>Candidate Photo *</span>
                        <input type="file" id="of_doc_photo" accept=".jpg,.jpeg,.png,.webp,.pdf" onchange="previewDocUpload(this, 'preview_photo', 'card_photo')" hidden>
                        <div class="doc-upload-btn">Choose File</div>
                    </label>
                    <div class="doc-preview" id="preview_photo"></div>
                </div>
            </div>
        </div>

        <div id="breakupPreview"></div>
        <button class="btn btn-primary" onclick="createOffer()" style="margin-top:12px"><i class="fas fa-save"></i> Create Offer Letter</button>
    `);
};

window.toggleContractFields = () => {
    const isContract = $('#of_emptype').value === 'contract';
    document.getElementById('of_contract_end_group').style.display = isContract ? '' : 'none';
    if (!isContract) $('#of_contract_end').value = '';
};

window.previewDocUpload = (input, previewId, cardId) => {
    const preview = document.getElementById(previewId);
    const card = document.getElementById(cardId);
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const isPDF = file.type === 'application/pdf';
        if (isPDF) {
            preview.innerHTML = '<div class="doc-preview-file"><i class="fas fa-file-pdf"></i><span>' + file.name + '</span></div>';
        } else {
            const reader = new FileReader();
            reader.onload = (e) => { preview.innerHTML = '<img src="' + e.target.result + '" alt="Preview">'; };
            reader.readAsDataURL(file);
        }
        card.classList.add('uploaded');
        card.classList.remove('error');
    } else {
        preview.innerHTML = '';
        card.classList.remove('uploaded');
    }
};

window.previewBreakup = async () => {
    const ctc = parseFloat($('#of_ctc').value);
    if (!ctc || ctc <= 0) { $('#breakupPreview').innerHTML = ''; return; }
    try {
        const b = await apiPost('/salary-breakup', { annual_ctc: ctc });
        const m = b.monthly;
        $('#breakupPreview').innerHTML = `
            <div class="breakup-grid">
                <div class="breakup-card">
                    <h4>Monthly Earnings</h4>
                    <div class="breakup-row"><span>Basic Salary</span><span>${formatINR(m.basic)}</span></div>
                    <div class="breakup-row"><span>HRA</span><span>${formatINR(m.hra)}</span></div>
                    <div class="breakup-row"><span>Special Allowance</span><span>${formatINR(m.specialAllowance)}</span></div>
                    <div class="breakup-row total"><span>Gross Salary</span><span>${formatINR(m.grossSalary)}</span></div>
                </div>
                <div class="breakup-card">
                    <h4>Monthly Deductions</h4>
                    <div class="breakup-row"><span>Employee PF</span><span>${formatINR(m.employeePF)}</span></div>
                    <div class="breakup-row"><span>Professional Tax</span><span>${formatINR(m.professionalTax)}</span></div>
                    <div class="breakup-row"><span>TDS (approx)</span><span>${formatINR(m.tds)}</span></div>
                    <div class="breakup-row total"><span>Net Take-Home</span><span>${formatINR(m.netSalary)}</span></div>
                </div>
            </div>`;
    } catch (e) { /* ignore */ }
};

window.createOffer = async () => {
    // Validate mandatory documents
    const aadharFile = document.getElementById('of_doc_aadhar').files[0];
    const panFile = document.getElementById('of_doc_pan').files[0];
    const photoFile = document.getElementById('of_doc_photo').files[0];

    let hasError = false;
    ['card_aadhar', 'card_pan', 'card_photo'].forEach((cardId, i) => {
        const card = document.getElementById(cardId);
        if (![aadharFile, panFile, photoFile][i]) {
            card.classList.add('error');
            hasError = true;
        } else {
            card.classList.remove('error');
        }
    });

    if (hasError) {
        return toast('Please upload all 3 mandatory documents: Aadhar Card, PAN Card, and Photo', 'error');
    }

    const formData = new FormData();
    formData.append('employee_name', $('#of_name').value);
    formData.append('employee_email', $('#of_email').value);
    formData.append('employee_phone', getPhoneValue('of_phone'));
    formData.append('employee_address', $('#of_address').value);
    formData.append('employee_city', $('#of_city').value);
    formData.append('employee_state', $('#of_state').value);
    formData.append('employee_pincode', $('#of_pincode').value);
    formData.append('designation', $('#of_desig').value);
    formData.append('department', $('#of_dept').value);
    formData.append('date_of_joining', $('#of_doj').value);
    formData.append('annual_ctc', parseFloat($('#of_ctc').value));
    formData.append('probation_months', parseInt($('#of_prob').value));
    formData.append('notice_period_days', parseInt($('#of_notice').value));
    formData.append('reporting_manager', $('#of_mgr').value);
    formData.append('work_location', $('#of_loc').value);
    formData.append('additional_terms', $('#of_terms').value);
    formData.append('shift_applicable', parseInt($('#of_shift').value) || 0);
    formData.append('joining_bonus', parseFloat($('#of_jbonus').value) || 0);
    formData.append('relocation_expense', parseFloat($('#of_reloc').value) || 0);
    formData.append('employment_type', $('#of_emptype').value || 'permanent');
    if ($('#of_emptype').value === 'contract') {
        if (!$('#of_contract_end').value) return toast('Contract end date is required for contract employees', 'error');
        formData.append('contract_end_date', $('#of_contract_end').value);
    }
    formData.append('doc_aadhar', aadharFile);
    formData.append('doc_pan', panFile);
    formData.append('doc_photo', photoFile);

    try {
        const resp = await fetch('/api/offers', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to create offer');
        toast('Offer letter created');
        closeModal(); pageOffers();
    } catch (e) { toast(e.message, 'error'); }
};

window.submitOffer = async (id) => { try { await apiPut(`/offers/${id}/submit`); toast('Submitted for manager approval'); pageOffers(); } catch (e) { toast(e.message, 'error'); } };
window.approveOffer = async (id) => { try { await apiPut(`/offers/${id}/approve`); toast('Offer approved'); pageOffers(); } catch (e) { toast(e.message, 'error'); } };
window.rejectOffer = async (id) => { try { await apiPut(`/offers/${id}/reject`); toast('Offer sent back to draft'); pageOffers(); } catch (e) { toast(e.message, 'error'); } };
window.releaseOffer = async (id) => { try { await apiPut(`/offers/${id}/release`); toast('Offer letter released!'); pageOffers(); } catch (e) { toast(e.message, 'error'); } };

window.viewOffer = async (id) => {
    const offers = await apiGet('/offers');
    const o = offers.find(x => x.id === id);
    if (!o) return;
    openModal('Offer Letter Preview', renderOfferLetter(o) + `<br><button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Print / Download PDF</button>`);
};

function renderOfferLetter(o) {
    const b = JSON.parse(o.salary_breakup);
    const m = b.monthly, a = b.annual;
    const ctcWords = amountInWords(a.ctc);

    const companyFooter = `<div class="letter-footer">
        <div class="footer-line"></div>
        <p><strong>PrimeAxis IT Solutions</strong> | Plot No: 207, Road No: 8, Vasanth Nagar, Near JNTU Metro Station, KPHB, Hyderabad - 500072, Telangana, India</p>
        <p>Phone: +91 8333079944 | Email: info@primeaxisit.com | Web: www.primeaxisit.com</p>
    </div>`;

    const letterheadFull = `<div class="letterhead">
        <div class="lh-left">
            <img src="../assets/logo/2.png" alt="PrimeAxis IT" class="lh-logo">
            <div class="lh-company">
                <h1>PrimeAxis IT Solutions</h1>
                <p>Innovative Technology Services</p>
            </div>
        </div>
        <div class="lh-right">
            Plot No: 207, Road No: 8, Vasanth Nagar<br>
            Near JNTU Metro Station, KPHB<br>
            Hyderabad - 500072, Telangana<br>
            Phone: +91 8333079944<br>
            Email: info@primeaxisit.com
        </div>
    </div>`;

    const letterheadMini = (pg) => `<div class="letterhead-mini">
        <img src="../assets/logo/2.png" alt="PrimeAxis IT" style="height:28px">
        <span>Ref: ${esc(o.reference_no)} | Page ${pg}</span>
    </div>`;

    return `<div class="offer-preview">
        <!-- PAGE 1: Employment Offer -->
        <div class="letter-page">
            ${letterheadFull}
            <div class="ref-row">
                <span><strong>Ref No:</strong> ${esc(o.reference_no)}</span>
                <span><strong>Date:</strong> ${formatDateLong(o.created_at)}</span>
            </div>

            <div class="recipient">
                <strong>To,</strong><br>
                <strong>${esc(o.employee_name)}</strong><br>
                ${o.employee_address ? esc(o.employee_address) + '<br>' : ''}
                ${o.employee_city ? esc(o.employee_city) : ''}${o.employee_state ? ', ' + esc(o.employee_state) : ''} ${o.employee_pincode ? '- ' + esc(o.employee_pincode) : ''}
                ${o.employee_email ? '<br>Email: ' + esc(o.employee_email) : ''}
                ${o.employee_phone ? '<br>Phone: ' + esc(o.employee_phone) : ''}
            </div>

            <div class="subject">Subject: <strong>${o.employment_type === 'contract' ? 'Contract Employment Offer' : 'Offer of Employment'} — ${esc(o.designation)}</strong></div>

            <p>Dear <strong>${esc(o.employee_name)}</strong>,</p>

            <p>With reference to your application and subsequent interview, we are pleased to offer you the position of <strong>${esc(o.designation)}</strong> in the <strong>${esc(o.department)}</strong> department at <strong>PrimeAxis IT Solutions</strong>${o.employment_type === 'contract' ? ' on a <strong>contract basis</strong>' : ''}. We were impressed with your qualifications and experience, and we believe you will be a valuable addition to our team.</p>

            <p>The terms and conditions of your employment are detailed below:</p>

            <h3 class="section-title">1. Employment Details</h3>
            <table class="details-table">
                <tbody>
                    <tr><td class="label-col">Designation</td><td>${esc(o.designation)}</td></tr>
                    <tr><td class="label-col">Department</td><td>${esc(o.department)}</td></tr>
                    <tr><td class="label-col">Date of Joining</td><td><strong>${formatDateLong(o.date_of_joining)}</strong></td></tr>
                    <tr><td class="label-col">Work Location</td><td>${esc(o.work_location || 'Hyderabad, Telangana')}</td></tr>
                    ${o.reporting_manager ? `<tr><td class="label-col">Reporting To</td><td>${esc(o.reporting_manager)}</td></tr>` : ''}
                    <tr><td class="label-col">Probation Period</td><td>${o.probation_months} Months</td></tr>
                    <tr><td class="label-col">Notice Period</td><td>${Math.round(o.notice_period_days / 2)} days (during probation) / ${o.notice_period_days} days (post-confirmation)</td></tr>
                    <tr><td class="label-col">Employment Type</td><td>${o.employment_type === 'contract' ? 'Contract' : 'Full-Time, Permanent'}</td></tr>
                    ${o.employment_type === 'contract' && o.contract_end_date ? `<tr><td class="label-col">Contract Period</td><td>${formatDateLong(o.date_of_joining)} to ${formatDateLong(o.contract_end_date)}</td></tr>` : ''}
                    <tr><td class="label-col">Working Days</td><td>Monday to Friday (5-day work week)</td></tr>
                    <tr><td class="label-col">Working Hours</td><td>9:30 AM to 6:30 PM (with 1 hour lunch break)</td></tr>
                    ${o.shift_applicable ? '<tr><td class="label-col">Shift Work</td><td>Yes — Subject to project requirements</td></tr>' : ''}
                </tbody>
            </table>

            ${o.joining_bonus > 0 ? `<h3 class="section-title" style="margin-top:18px">Joining Bonus</h3>
            <p>In addition to the CTC mentioned above, you will be entitled to a <strong>one-time Joining Bonus of ${formatINR(o.joining_bonus)}</strong> (${amountInWords(o.joining_bonus)}), payable with your first month's salary, subject to applicable taxes and the condition that you complete a minimum of <strong>12 months</strong> of continuous service. If you resign or are terminated within 12 months, the entire joining bonus amount shall be recovered from your final settlement.</p>` : ''}

            ${o.relocation_expense > 0 ? `<h3 class="section-title" style="margin-top:18px">Relocation Assistance</h3>
            <p>The company shall provide a <strong>one-time Relocation Assistance of ${formatINR(o.relocation_expense)}</strong> (${amountInWords(o.relocation_expense)}) to support your relocation to the work location. This amount will be disbursed within your first month of joining, subject to submission of relevant receipts and applicable tax deductions.</p>` : ''}

            ${companyFooter}
        </div>

        <!-- PAGE 2: Compensation -->
        <div class="letter-page">
            ${letterheadMini(2)}

            <h3 class="section-title">2. Compensation Details</h3>
            <p>Your Cost to Company (CTC) is <strong>${formatINR(a.ctc)}</strong> (${ctcWords}) per annum, broken down as follows:</p>

            <table class="ctc-table">
                <thead>
                    <tr><th style="width:8%">S.No</th><th style="width:44%">Component</th><th style="width:22%">Monthly (₹)</th><th style="width:26%">Annual (₹)</th></tr>
                </thead>
                <tbody>
                    <tr class="section-header"><td colspan="4"><strong>A. Earnings</strong></td></tr>
                    <tr><td>1</td><td>Basic Salary</td><td class="amt">${formatINR(m.basic)}</td><td class="amt">${formatINR(a.basic)}</td></tr>
                    <tr><td>2</td><td>House Rent Allowance (HRA)</td><td class="amt">${formatINR(m.hra)}</td><td class="amt">${formatINR(a.hra)}</td></tr>
                    <tr><td>3</td><td>Special Allowance</td><td class="amt">${formatINR(m.specialAllowance)}</td><td class="amt">${formatINR(a.specialAllowance)}</td></tr>
                    <tr class="subtotal"><td></td><td><strong>Gross Salary (A)</strong></td><td class="amt"><strong>${formatINR(m.grossSalary)}</strong></td><td class="amt"><strong>${formatINR(a.grossSalary)}</strong></td></tr>

                    <tr class="section-header"><td colspan="4"><strong>B. Employer Contributions</strong></td></tr>
                    <tr><td>4</td><td>Employer Provident Fund (EPF @ 12%)</td><td class="amt">${formatINR(m.employerPF)}</td><td class="amt">${formatINR(a.employerPF)}</td></tr>
                    ${m.employerESI > 0 ? `<tr><td>5</td><td>Employer ESI (@ 3.25%)</td><td class="amt">${formatINR(m.employerESI)}</td><td class="amt">${formatINR(a.employerESI)}</td></tr>` : ''}
                    <tr><td>${m.employerESI > 0 ? '6' : '5'}</td><td>Gratuity</td><td class="amt">${formatINR(m.gratuity)}</td><td class="amt">${formatINR(a.gratuity)}</td></tr>

                    <tr class="total-row"><td></td><td><strong>Total CTC (A + B)</strong></td><td class="amt"><strong>${formatINR(m.ctc)}</strong></td><td class="amt"><strong>${formatINR(a.ctc)}</strong></td></tr>
                </tbody>
            </table>

            <h3 class="section-title" style="margin-top:20px">Employee Deductions (Monthly Estimate)</h3>
            <table class="ctc-table">
                <thead><tr><th style="width:8%">S.No</th><th style="width:58%">Deduction</th><th style="width:34%">Monthly (₹)</th></tr></thead>
                <tbody>
                    <tr><td>1</td><td>Employee Provident Fund (EPF @ 12%)</td><td class="amt">${formatINR(m.employeePF)}</td></tr>
                    ${m.employeeESI > 0 ? `<tr><td>2</td><td>Employee State Insurance (ESI @ 0.75%)</td><td class="amt">${formatINR(m.employeeESI)}</td></tr>` : ''}
                    <tr><td>${m.employeeESI > 0 ? '3' : '2'}</td><td>Professional Tax — Telangana</td><td class="amt">${formatINR(m.professionalTax)}</td></tr>
                    <tr><td>${m.employeeESI > 0 ? '4' : '3'}</td><td>Income Tax (TDS — New Regime, Estimated)</td><td class="amt">${formatINR(m.tds)}</td></tr>
                    <tr class="subtotal"><td></td><td><strong>Total Deductions</strong></td><td class="amt"><strong>${formatINR(m.totalDeductions)}</strong></td></tr>
                    <tr class="total-row"><td></td><td><strong>Approximate Net Monthly Take-Home</strong></td><td class="amt"><strong>${formatINR(m.netSalary)}</strong></td></tr>
                </tbody>
            </table>

            <p class="disclaimer">* The above deductions are indicative and may vary based on actual tax declarations, investment proofs submitted under applicable sections, and prevailing government regulations.</p>

            ${companyFooter}
        </div>

        <!-- PAGE 3: Terms & Conditions -->
        <div class="letter-page">
            ${letterheadMini(3)}

            <h3 class="section-title">3. General Terms & Conditions</h3>
            <ol class="terms-list">
                <li><strong>Working Hours:</strong> The regular working hours are <strong>Monday to Friday, 9:30 AM to 6:30 PM</strong>, with a 1-hour lunch break. The company follows a <strong>5-day work week</strong>. You may be required to work additional hours as necessary to meet project deadlines or business requirements.</li>

                <li><strong>Probation Period:</strong> ${o.employment_type === 'contract' ? 'Not applicable for contract employees.' : `You will be on probation for a period of <strong>${o.probation_months} months</strong> from the date of joining. During the probation period, your performance, discipline, conduct, attendance, and adherence to company policies will be reviewed regularly. The company reserves the right to extend the probation period by an additional <strong>${Math.ceil(o.probation_months/2)} months</strong> if performance or conduct is found unsatisfactory. Termination during probation can be effected with <strong>${Math.round(o.notice_period_days / 2)} days</strong> written notice from either party.`}</li>

                <li><strong>${o.employment_type === 'contract' ? 'Confirmation:' : 'Confirmation:'}</strong> ${o.employment_type === 'contract' ? 'Upon satisfactory completion of the contract period, the company may offer a permanent position or extend the contract at its sole discretion.' : 'Upon satisfactory completion of the probation period, you will be confirmed as a permanent employee of the company. A formal confirmation letter will be issued.'}</li>

                <li><strong>${o.employment_type === 'contract' ? 'Contract Duration & Termination:' : 'Notice Period:'}</strong> ${o.employment_type === 'contract' ? `This contract is for a fixed term from <strong>${formatDateLong(o.date_of_joining)}</strong> to <strong>${formatDateLong(o.contract_end_date)}</strong>. Either party may terminate this engagement with <strong>${o.notice_period_days} days</strong> written notice or payment in lieu thereof. The contract will automatically expire on the end date unless renewed in writing.` : `During probation, either party may terminate the employment with <strong>${Math.round(o.notice_period_days / 2)} days</strong> written notice or salary in lieu thereof. Post-confirmation, the notice period will be <strong>${o.notice_period_days} days</strong> from either side.`}</li>

                <li><strong>Leave Policy:</strong> You will be entitled to <strong>12 Casual Leaves</strong>, <strong>12 Sick Leaves</strong>, and <strong>15 Earned Leaves</strong> per calendar year (pro-rated for the joining year). Unused earned leaves can be carried forward as per company policy. Additional holidays include national and regional public holidays as per the annual holiday calendar.</li>

                <li><strong>Salary Confidentiality:</strong> Your compensation details are strictly confidential and shall not be disclosed to any colleague, external party, or on any public platform. Violation of this clause may result in disciplinary action, including termination.</li>

                <li><strong>Confidentiality & Non-Disclosure:</strong> You shall maintain strict confidentiality regarding all proprietary information, trade secrets, client data, source code, business strategies, and intellectual property of the company. This obligation shall survive the termination of your employment.</li>

                <li><strong>Intellectual Property:</strong> All work, inventions, software, code, designs, documentation, and creative output produced during the course of your employment shall be the sole and exclusive property of PrimeAxis IT Solutions.</li>

                <li><strong>Background Verification:</strong> This offer is contingent upon successful completion of background verification, including employment history, educational qualifications, criminal record check, and reference checks. Any discrepancy found may lead to termination of employment.</li>

                <li><strong>Company Property:</strong> All company assets, including but not limited to laptops, ID cards, access cards, mobile devices, and any other equipment provided, must be returned in good working condition upon separation from the company. Any damage or loss will be recovered from the final settlement.</li>

                <li><strong>Code of Conduct:</strong> You are expected to adhere to the company's code of conduct, IT security policies, anti-harassment policy, and all other applicable workplace policies. Violations may lead to disciplinary action.</li>

                <li><strong>Dress Code:</strong> The company follows a <strong>business casual</strong> dress code on all working days. Formal attire may be required for client meetings, presentations, or official events.</li>

                <li><strong>Non-Compete:</strong> During the period of employment and for a period of 6 months post-separation, you agree not to engage in any business activity directly competing with PrimeAxis IT Solutions in the same geographical region.</li>

                <li><strong>Information Security & Policy Compliance:</strong> Any violation of information security policies, data protection regulations (including but not limited to IT Act, 2000 and applicable data privacy laws), company code of conduct, corporate governance policies, or any act of fraud, misrepresentation, or gross misconduct may result in <strong>immediate termination of employment without notice</strong> and without any compensation or benefits. The company reserves the right to initiate legal proceedings and recover damages in such cases.</li>

                ${o.shift_applicable ? '<li><strong>Shift Work:</strong> Based on project and business requirements, you may be required to work in <strong>rotational shifts</strong>, including night shifts and weekend shifts. The company will provide appropriate shift allowances as per the prevailing policy. A minimum of <strong>7 days notice</strong> will be provided for any shift changes, except in case of emergencies.</li>' : ''}

                <li><strong>Governing Law & Jurisdiction:</strong> This employment offer shall be governed by the laws of India. Any disputes arising out of or related to this offer shall be subject to the exclusive jurisdiction of the courts in <strong>Hyderabad, Telangana</strong>.</li>

                <li><strong>Offer Validity:</strong> This offer is valid for <strong>15 days</strong> from the date of issue. Non-acceptance within this period will result in automatic withdrawal of this offer.</li>

                ${o.additional_terms ? `<li><strong>Additional Terms:</strong> ${esc(o.additional_terms)}</li>` : ''}
            </ol>

            ${companyFooter}
        </div>

        <!-- PAGE 4: Documents Required & Acceptance -->
        <div class="letter-page">
            ${letterheadMini(4)}

            <h3 class="section-title">4. Documents Required at the Time of Joining</h3>
            <p>Please ensure you submit the following documents on or before your date of joining:</p>
            <ol class="docs-list">
                <li>2 Recent passport-size colour photographs</li>
                <li>PAN Card (self-attested photocopy)</li>
                <li>Aadhar Card (self-attested photocopy)</li>
                <li>All educational certificates and mark sheets (originals for verification + self-attested photocopies)</li>
                <li>Relieving letter and experience certificate from previous employer(s)</li>
                <li>Last 3 months salary slips from previous employer</li>
                <li>Bank account details with cancelled cheque for salary processing</li>
                <li>Address proof (Aadhar / Passport / Voter ID / Utility bill)</li>
                <li>Medical fitness certificate (if applicable)</li>
            </ol>

            <p style="margin-top:24px">We are confident that your association with <strong>PrimeAxis IT Solutions</strong> will be mutually rewarding and enriching. We look forward to welcoming you aboard and wish you a successful career with us.</p>

            <p>Please sign and return a copy of this letter as acknowledgement and unconditional acceptance of the above terms and conditions.</p>

            <p style="margin-top:8px"><strong>Warm Regards,</strong></p>

            <div class="signature-block">
                <div class="sig-left">
                    <div class="sig-line"></div>
                    <strong>For PrimeAxis IT Solutions</strong><br>
                    <span>Authorized Signatory</span><br>
                    <span>HR Department</span>
                </div>
                <div class="sig-right">
                    <div class="sig-line"></div>
                    <strong>Employee Acceptance</strong><br>
                    <span>Name: ${esc(o.employee_name)}</span><br>
                    <span>Date: ________________________</span><br>
                    <span>Signature: ________________________</span>
                </div>
            </div>

            ${companyFooter}
        </div>
    </div>`;
}

// ===================================================================
//  PAGE: TIMESHEETS
// ===================================================================
async function pageTimesheets() {
    pageTitle.textContent = 'Timesheets';
    const ts = await apiGet('/timesheets');
    const isMgr = ['admin', 'manager'].includes(u.role);

    const parsedTs = ts.map(t => {
        let entries = [];
        try { entries = JSON.parse(t.entries); } catch(e) {}
        return { ...t, parsedEntries: entries };
    });

    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-clock"></i> Timesheets (${ts.length})</h3>
            </div>
            ${ts.length === 0 ? '<div style="text-align:center;padding:60px 20px;color:var(--p-text-muted)">No timesheets</div>' : parsedTs.map(t => {
                const weekStart = new Date(t.week_start + 'T00:00:00');
                const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
                const dayDates = days.map((_, i) => {
                    const d = new Date(weekStart);
                    d.setDate(weekStart.getDate() + i);
                    return d;
                });
                const dailyTotals = [0,0,0,0,0,0,0];
                t.parsedEntries.forEach(entry => {
                    if (entry.daily) {
                        entry.daily.forEach((h, i) => { dailyTotals[i] += (parseFloat(h) || 0); });
                    } else if (entry.hours) {
                        const hrs = parseFloat(entry.hours) || 0;
                        const perDay = Math.round((hrs / 5) * 100) / 100;
                        for (let i = 0; i < 5; i++) dailyTotals[i] += perDay;
                    }
                });
                const grandTotal = dailyTotals.reduce((s, h) => s + h, 0);

                return `
                <div class="ts-week-card" style="margin:16px;border:1px solid var(--p-border);border-radius:12px;overflow:hidden">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:linear-gradient(135deg,rgba(0,210,255,0.08),rgba(88,86,214,0.08));border-bottom:1px solid var(--p-border);flex-wrap:wrap;gap:8px">
                        <div>
                            <strong>${esc(t.employee_name)}</strong> <span style="color:var(--p-text-muted);font-size:0.8rem">${esc(t.employee_code || '')}</span>
                            <span style="margin-left:12px;font-size:0.85rem;color:var(--p-text-muted)"><i class="fas fa-calendar-week" style="color:var(--p-cyan);margin-right:4px"></i>${formatDate(t.week_start)} — ${formatDate(t.week_end)}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px">
                            ${statusBadge(t.status)}
                            ${isMgr && t.status === 'submitted' ? `<button class="btn btn-sm btn-success" onclick="approveTimesheet(${t.id})"><i class="fas fa-check"></i> Approve</button><button class="btn btn-sm btn-danger" onclick="rejectTimesheet(${t.id})"><i class="fas fa-times"></i> Reject</button>` : ''}
                        </div>
                    </div>
                    ${t.reject_reason ? `<div style="padding:8px 18px;background:rgba(255,59,48,0.08);color:var(--p-red);font-size:0.82rem"><i class="fas fa-exclamation-circle"></i> ${esc(t.reject_reason)}</div>` : ''}
                    <div style="overflow-x:auto">
                        <table class="ts-grid" style="width:100%;border-collapse:collapse;font-size:0.85rem">
                            <thead>
                                <tr style="background:var(--p-sidebar)">
                                    <th style="text-align:left;padding:10px 14px;min-width:140px;border-right:1px solid var(--p-border)">Project / Task</th>
                                    ${days.map((day, i) => {
                                        const d = dayDates[i];
                                        const isWeekend = i >= 5;
                                        return `<th style="text-align:center;padding:10px 8px;min-width:70px;${isWeekend ? 'opacity:0.5;' : ''}border-right:1px solid var(--p-border)">
                                            <div style="font-weight:600;color:${isWeekend ? 'var(--p-text-muted)' : 'var(--p-cyan)'}">${day}</div>
                                            <div style="font-size:0.75rem;color:var(--p-text-muted);font-weight:400">${String(d.getDate()).padStart(2,'0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}</div>
                                        </th>`;
                                    }).join('')}
                                    <th style="text-align:center;padding:10px 8px;min-width:70px;font-weight:700;color:var(--p-cyan)">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${t.parsedEntries.map(entry => {
                                    const daily = entry.daily || (entry.hours ? [0,0,0,0,0,0,0].map((_, i) => i < 5 ? Math.round((parseFloat(entry.hours)/5)*100)/100 : 0) : [0,0,0,0,0,0,0]);
                                    const rowTotal = daily.reduce((s, h) => s + (parseFloat(h) || 0), 0);
                                    return `<tr style="border-top:1px solid var(--p-border)">
                                        <td style="padding:10px 14px;font-weight:500;border-right:1px solid var(--p-border)"><i class="fas fa-project-diagram" style="color:var(--p-purple);margin-right:6px;font-size:0.75rem"></i>${esc(entry.project || 'General')}</td>
                                        ${daily.map((h, i) => `<td style="text-align:center;padding:10px 8px;${i >= 5 ? 'opacity:0.5;' : ''}border-right:1px solid var(--p-border);${parseFloat(h) > 0 ? 'color:var(--p-text)' : 'color:var(--p-text-muted)'}">${parseFloat(h) ? parseFloat(h).toFixed(2) : '—'}</td>`).join('')}
                                        <td style="text-align:center;padding:10px 8px;font-weight:700;color:var(--p-cyan)">${rowTotal.toFixed(2)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="border-top:2px solid var(--p-cyan);background:rgba(0,210,255,0.04)">
                                    <td style="padding:10px 14px;font-weight:700;border-right:1px solid var(--p-border)"><i class="fas fa-calculator" style="color:var(--p-green);margin-right:6px;font-size:0.75rem"></i>Total Hours</td>
                                    ${dailyTotals.map((h, i) => `<td style="text-align:center;padding:10px 8px;font-weight:700;${i >= 5 ? 'opacity:0.5;' : ''}border-right:1px solid var(--p-border);color:${h > 0 ? 'var(--p-green)' : 'var(--p-text-muted)'}">${h ? h.toFixed(2) : '—'}</td>`).join('')}
                                    <td style="text-align:center;padding:10px 8px;font-weight:800;font-size:1rem;color:var(--p-green)">${grandTotal.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

window.approveTimesheet = async (id) => { try { await apiPut(`/timesheets/${id}/approve`); toast('Approved'); pageTimesheets(); } catch (e) { toast(e.message, 'error'); } };
window.rejectTimesheet = async (id) => {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    try { await apiPut(`/timesheets/${id}/reject`, { reason }); toast('Rejected'); pageTimesheets(); } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: LEAVES
// ===================================================================
async function pageLeaves() {
    pageTitle.textContent = 'Leave Management';
    const leaves = await apiGet('/leaves');
    const isMgr = ['admin', 'manager'].includes(u.role);
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-calendar-check"></i> Leave Requests (${leaves.length})</h3>
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th>${isMgr ? '<th>Actions</th>' : ''}</tr></thead>
                <tbody>
                    ${leaves.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--p-text-muted)">No leave requests</td></tr>' : leaves.map(l => `<tr>
                        <td><strong>${esc(l.employee_name)}</strong></td>
                        <td><span class="badge-status active" style="text-transform:capitalize">${l.leave_type}</span></td>
                        <td>${formatDate(l.from_date)}</td>
                        <td>${formatDate(l.to_date)}</td>
                        <td>${l.days}${l.lop_days > 0 ? ` <span class="badge-lop">${l.lop_days}d LOP</span>` : ''}</td>
                        <td>${esc(l.reason || '—')}</td>
                        <td>${statusBadge(l.status)}</td>
                        ${isMgr ? `<td>
                            ${l.status === 'pending' ? `<button class="btn btn-sm btn-success" onclick="approveLeave(${l.id})"><i class="fas fa-check"></i></button><button class="btn btn-sm btn-danger" onclick="rejectLeave(${l.id})"><i class="fas fa-times"></i></button>` : ''}
                        </td>` : ''}
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.approveLeave = async (id) => { try { await apiPut(`/leaves/${id}/approve`); toast('Leave approved'); pageLeaves(); } catch (e) { toast(e.message, 'error'); } };
window.rejectLeave = async (id) => {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    try { await apiPut(`/leaves/${id}/reject`, { reason }); toast('Leave rejected'); pageLeaves(); } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: PAYSLIPS
// ===================================================================
async function pagePayslips() {
    pageTitle.textContent = 'Payslips';
    const payslips = await apiGet('/payslips');
    const canGen = ['admin', 'accountant'].includes(u.role);
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-receipt"></i> Payslips (${payslips.length})</h3>
                ${canGen ? `<div style="display:flex;gap:8px">
                    <button class="btn btn-primary" onclick="showGeneratePayslipModal()"><i class="fas fa-plus"></i> Generate Single</button>
                    <button class="btn btn-secondary" onclick="showBulkPayslipModal()"><i class="fas fa-layer-group"></i> Bulk Generate</button>
                </div>` : ''}
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Employee</th><th>Period</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Actions</th></tr></thead>
                <tbody>
                    ${payslips.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--p-text-muted)">No payslips generated</td></tr>' : payslips.map(p => `<tr>
                        <td><strong>${esc(p.employee_name)}</strong> <span style="color:var(--p-text-muted);font-size:0.75rem">${esc(p.employee_code || '')}</span></td>
                        <td>${monthNames[p.month]} ${p.year}</td>
                        <td>${formatINR(p.gross_earnings)}</td>
                        <td style="color:var(--p-red)">${formatINR(p.total_deductions)}</td>
                        <td style="color:var(--p-green);font-weight:700">${formatINR(p.net_pay)}</td>
                        <td><button class="btn btn-sm btn-secondary" onclick="viewPayslip(${p.id})"><i class="fas fa-eye"></i></button></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showGeneratePayslipModal = async () => {
    const emps = await apiGet('/employees');
    const activeEmps = emps.filter(e => e.status === 'active' && e.annual_ctc > 0);
    const now = new Date();
    openModal('Generate Payslip', `
        <div class="form-grid">
            <div class="form-group"><label>Employee *</label><select class="form-control" id="ps_emp" onchange="autoCalcPayslip()">
                <option value="">Select Employee</option>
                ${activeEmps.map(e => `<option value="${e.id}">${esc(e.name)} (${esc(e.employee_code)}) — ${formatINR(e.annual_ctc)}/yr</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Month *</label><select class="form-control" id="ps_month" onchange="autoCalcPayslip()">
                ${monthNames.slice(1).map((m, i) => `<option value="${i + 1}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${m}</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Year *</label><input class="form-control" id="ps_year" type="number" value="${now.getFullYear()}" onchange="autoCalcPayslip()"></div>
        </div>
        <div id="ps_calc_result" style="margin-top:12px"></div>
        <div id="ps_actions" style="margin-top:12px;display:none">
            <button class="btn btn-primary" onclick="generatePayslipFromCalc()" style="margin-top:8px"><i class="fas fa-receipt"></i> Generate Payslip</button>
        </div>
    `);
};

window._psCalcData = null;

window.autoCalcPayslip = async () => {
    const empId = parseInt($('#ps_emp')?.value);
    const month = parseInt($('#ps_month')?.value);
    const year = parseInt($('#ps_year')?.value);
    const resultDiv = document.getElementById('ps_calc_result');
    const actionsDiv = document.getElementById('ps_actions');
    if (!empId || !month || !year) {
        if (resultDiv) resultDiv.innerHTML = '<p style="color:var(--p-text-muted)">Select employee, month, and year to auto-calculate</p>';
        if (actionsDiv) actionsDiv.style.display = 'none';
        window._psCalcData = null;
        return;
    }
    if (resultDiv) resultDiv.innerHTML = '<p style="color:var(--p-primary)"><i class="fas fa-spinner fa-spin"></i> Calculating...</p>';
    try {
        const data = await apiPost('/payslips/auto-calculate', { employee_id: empId, month, year });
        window._psCalcData = data;
        const p = data.preview;
        resultDiv.innerHTML = `
            <div class="ps-calc-breakdown">
                <h4 style="margin:0 0 12px;color:var(--p-text)"><i class="fas fa-calculator"></i> Auto-Calculated Breakdown</h4>
                <div class="ps-calc-grid">
                    <div class="ps-calc-card">
                        <div class="ps-calc-card-title"><i class="fas fa-calendar-days"></i> Attendance Summary</div>
                        <div class="ps-calc-row"><span>Total Days in Month</span><strong>${data.totalDaysInMonth}</strong></div>
                        <div class="ps-calc-row"><span>Weekends (Sat/Sun)</span><strong class="text-muted">−${data.weekends}</strong></div>
                        <div class="ps-calc-row"><span>Company Holidays</span><strong class="text-muted">−${data.holidaysOnWeekdays}</strong></div>
                        <div class="ps-calc-row ps-calc-highlight"><span>Working Days</span><strong>${data.workingDays}</strong></div>
                        <div class="ps-calc-row"><span>Approved Leaves</span><strong class="text-danger">−${data.totalLeaveDays}</strong></div>
                        ${data.lopDays > 0 ? `<div class="ps-calc-row"><span>Loss of Pay Days</span><strong class="text-danger">${data.lopDays}</strong></div>` : ''}
                        <div class="ps-calc-row ps-calc-highlight"><span>Present Days</span><strong style="color:var(--p-green)">${data.presentDays}</strong></div>
                    </div>
                    <div class="ps-calc-card">
                        <div class="ps-calc-card-title"><i class="fas fa-indian-rupee-sign"></i> Salary Preview</div>
                        <div class="ps-calc-row"><span>Basic Salary</span><strong>${formatINR(p.earnings.basic)}</strong></div>
                        <div class="ps-calc-row"><span>HRA</span><strong>${formatINR(p.earnings.hra)}</strong></div>
                        <div class="ps-calc-row"><span>Special Allowance</span><strong>${formatINR(p.earnings.specialAllowance)}</strong></div>
                        <div class="ps-calc-row ps-calc-highlight"><span>Gross Earnings</span><strong>${formatINR(p.earnings.grossEarnings)}</strong></div>
                        <div class="ps-calc-row"><span>PF Deduction</span><strong class="text-danger">−${formatINR(p.deductions.employeePF)}</strong></div>
                        <div class="ps-calc-row"><span>Professional Tax</span><strong class="text-danger">−${formatINR(p.deductions.professionalTax)}</strong></div>
                        <div class="ps-calc-row"><span>TDS (${data.taxRegime === 'old' ? 'Old' : 'New'} Regime)</span><strong class="text-danger">−${formatINR(p.deductions.tds)}</strong></div>
                        ${p.deductions.employeeESI > 0 ? `<div class="ps-calc-row"><span>ESI</span><strong class="text-danger">−${formatINR(p.deductions.employeeESI)}</strong></div>` : ''}
                        ${p.lossOfPay > 0 ? `<div class="ps-calc-row"><span>Loss of Pay Deduction</span><strong class="text-danger">−${formatINR(p.lossOfPay)}</strong></div>` : ''}
                        <div class="ps-calc-row ps-calc-net"><span>NET PAY</span><strong>${formatINR(p.netPay)}</strong></div>
                    </div>
                </div>
                ${data.extras && data.extras.length > 0 ? `<div class="ps-calc-detail">
                    <strong><i class="fas fa-gift"></i> Extras / Bonuses this month:</strong>
                    ${data.extras.map(e => `<span class="ps-extra-tag ${e.is_taxable ? 'taxable' : ''}">${(e.type||'').replace(/_/g,' ')} — ${formatINR(e.amount)}${e.is_taxable ? ' (Taxable)' : ''}</span>`).join('')}
                    <div style="margin-top:4px;font-weight:600;color:var(--p-green)">Total Extras: ${formatINR(data.extras.reduce((s,e) => s + e.amount, 0))}</div>
                </div>` : ''}
                ${data.holidays.length > 0 ? `<div class="ps-calc-detail">
                    <strong><i class="fas fa-calendar-star"></i> Holidays this month:</strong>
                    ${data.holidays.map(h => `<span class="ps-hol-tag ${h.isWeekend ? 'weekend' : ''}">${h.name} (${new Date(h.date).getDate()} ${h.day_of_week || ''}${h.isWeekend ? ' — Weekend' : ''})</span>`).join('')}
                </div>` : ''}
                ${data.approvedLeaves.length > 0 ? `<div class="ps-calc-detail">
                    <strong><i class="fas fa-calendar-minus"></i> Approved Leaves:</strong>
                    ${data.approvedLeaves.map(l => `<span class="ps-leave-tag ${l.is_lop ? 'lop' : ''}">${l.type} (${l.days}d${l.lop_days > 0 ? ', ' + l.lop_days + 'd LOP' : ''}) ${formatDate(l.from)} → ${formatDate(l.to)}</span>`).join('')}
                </div>` : '<div class="ps-calc-detail" style="color:var(--p-green)"><i class="fas fa-check-circle"></i> No leaves taken — Full attendance</div>'}
            </div>`;
        actionsDiv.style.display = 'block';
    } catch (e) {
        resultDiv.innerHTML = `<p style="color:var(--p-red)"><i class="fas fa-exclamation-circle"></i> ${esc(e.message)}</p>`;
        actionsDiv.style.display = 'none';
        window._psCalcData = null;
    }
};

window.generatePayslipFromCalc = async () => {
    const data = window._psCalcData;
    if (!data) { toast('Please calculate first', 'error'); return; }
    try {
        await apiPost('/payslips/generate', {
            employee_id: data.employee.id,
            month: data.month,
            year: data.year,
            working_days: data.workingDays,
            present_days: data.presentDays,
        });
        toast('Payslip generated successfully'); closeModal(); pagePayslips();
    } catch (e) { toast(e.message, 'error'); }
};

window.showBulkPayslipModal = () => {
    const now = new Date();
    openModal('Bulk Generate Payslips', `
        <p style="color:var(--p-text-muted);margin-bottom:16px">Generate payslips for all active employees. Working days auto-calculated from calendar, holidays & approved leaves (incl. LOP).</p>
        <div class="form-grid">
            <div class="form-group"><label>Month *</label><select class="form-control" id="bp_month">
                ${monthNames.slice(1).map((m, i) => `<option value="${i + 1}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${m}</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Year *</label><input class="form-control" id="bp_year" type="number" value="${now.getFullYear()}"></div>
        </div>
        <button class="btn btn-primary" onclick="bulkGenerate()" style="margin-top:12px"><i class="fas fa-layer-group"></i> Generate All</button>
    `);
};

window.bulkGenerate = async () => {
    try {
        const result = await apiPost('/payslips/generate-bulk', {
            month: parseInt($('#bp_month').value), year: parseInt($('#bp_year').value),
        });
        toast(result.message); closeModal(); pagePayslips();
    } catch (e) { toast(e.message, 'error'); }
};

window.viewPayslip = async (id) => {
    const ps = (await apiGet('/payslips')).find(p => p.id === id);
    if (!ps) return;
    let emp = null;
    try { emp = await apiGet(`/employees/${ps.employee_id}`); } catch(e) {}
    const earn = JSON.parse(ps.earnings);
    const ded = JSON.parse(ps.deductions);
    const empContrib = ps.employer_contributions ? JSON.parse(ps.employer_contributions) : {};
    openModal('Payslip', renderPayslip(ps, emp, earn, ded, empContrib) + `<br><button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Print / Download PDF</button>`);
};

function renderPayslip(ps, emp, earn, ded, empContrib) {
    return `<div class="payslip-preview">
        <div class="ps-company-header">
            <img src="../assets/logo/2.png" alt="PrimeAxis IT" style="height:40px">
            <div>
                <h2>PrimeAxis IT Solutions</h2>
                <p>Plot No: 207, Road No: 8, Vasanth Nagar, Near JNTU Metro Station, KPHB</p>
                <p>Hyderabad - 500072, Telangana, India</p>
            </div>
        </div>

        <div class="ps-title">
            <h3>PAYSLIP FOR THE MONTH OF ${(monthNames[ps.month] || '').toUpperCase()} ${ps.year}</h3>
        </div>

        <table class="ps-emp-table">
            <tbody>
                <tr>
                    <td class="label">Employee Name</td><td class="value"><strong>${esc(ps.employee_name)}</strong></td>
                    <td class="label">Employee ID</td><td class="value"><strong>${esc(ps.employee_code || '—')}</strong></td>
                </tr>
                <tr>
                    <td class="label">Designation</td><td class="value">${esc(ps.designation || '—')}</td>
                    <td class="label">Department</td><td class="value">${esc(ps.department || '—')}</td>
                </tr>
                <tr>
                    <td class="label">Date of Joining</td><td class="value">${emp ? formatDate(emp.date_of_joining) : '—'}</td>
                    <td class="label">PAN</td><td class="value">${emp ? esc(emp.pan || '—') : '—'}</td>
                </tr>
                <tr>
                    <td class="label">UAN</td><td class="value">${emp ? esc(emp.uan || '—') : '—'}</td>
                    <td class="label">Phone</td><td class="value">${emp ? esc(emp.phone || '—') : '—'}</td>
                </tr>
                <tr>
                    <td class="label">Bank Name</td><td class="value">${emp ? esc(emp.bank_name || '—') : '—'}</td>
                    <td class="label">Account No.</td><td class="value">${emp ? esc(emp.bank_account || '—') : '—'}</td>
                </tr>
                <tr>
                    <td class="label">IFSC Code</td><td class="value">${emp ? esc(emp.ifsc_code || '—') : '—'}</td>
                    <td class="label">Pay Period</td><td class="value"><strong>${monthNames[ps.month]} ${ps.year}</strong></td>
                </tr>
            </tbody>
        </table>

        <table class="ps-attendance-table">
            <thead><tr><th>Total Working Days</th><th>Days Worked</th><th>Leave / LOP Days</th></tr></thead>
            <tbody><tr><td><strong>${ps.working_days}</strong></td><td><strong>${ps.present_days}</strong></td><td><strong>${ps.working_days - ps.present_days}</strong></td></tr></tbody>
        </table>

        <table class="ps-salary-table">
            <thead>
                <tr>
                    <th style="width:5%">S.No</th>
                    <th style="width:30%">Earnings</th>
                    <th style="width:15%">Amount (₹)</th>
                    <th style="width:5%">S.No</th>
                    <th style="width:30%">Deductions</th>
                    <th style="width:15%">Amount (₹)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td><td>Basic Salary</td><td class="amt">${formatINR(earn.basic)}</td>
                    <td>1</td><td>Provident Fund (PF)</td><td class="amt">${formatINR(ded.employeePF)}</td>
                </tr>
                <tr>
                    <td>2</td><td>House Rent Allowance</td><td class="amt">${formatINR(earn.hra)}</td>
                    <td>2</td><td>Professional Tax (PT)</td><td class="amt">${formatINR(ded.professionalTax)}</td>
                </tr>
                <tr>
                    <td>3</td><td>Special Allowance</td><td class="amt">${formatINR(earn.specialAllowance)}</td>
                    <td>3</td><td>Income Tax (TDS)</td><td class="amt">${formatINR(ded.tds)}</td>
                </tr>
                ${ded.employeeESI > 0 ? `<tr>
                    <td></td><td></td><td></td>
                    <td>4</td><td>Employee State Insurance</td><td class="amt">${formatINR(ded.employeeESI)}</td>
                </tr>` : ''}
                <tr class="ps-total-row">
                    <td></td><td><strong>Gross Earnings</strong></td><td class="amt"><strong>${formatINR(ps.gross_earnings)}</strong></td>
                    <td></td><td><strong>Total Deductions</strong></td><td class="amt"><strong>${formatINR(ps.total_deductions)}</strong></td>
                </tr>
            </tbody>
        </table>

        <div class="ps-netpay">
            <div class="ps-netpay-row">
                <span>NET PAY</span>
                <span class="amount">${formatINR(ps.net_pay)}</span>
            </div>
            <div class="ps-netpay-words">
                <strong>Amount in Words:</strong> ${amountInWords(ps.net_pay)}
            </div>
        </div>

        ${empContrib && empContrib.employerPF ? `<div class="ps-employer-contrib">
            <strong>Employer Contributions:</strong> Provident Fund: ${formatINR(empContrib.employerPF)}${empContrib.employerESI > 0 ? ' | ESI: ' + formatINR(empContrib.employerESI) : ''}
        </div>` : ''}

        ${empContrib && empContrib.regime ? `<div class="ps-tax-regime-info">
            <strong>Tax Regime:</strong> ${empContrib.regime === 'old' ? 'Old Regime' : 'New Regime'}
            ${empContrib.totalExemptions > 0 ? ` | <strong>Declared Exemptions:</strong> ${formatINR(empContrib.totalExemptions)}` : ''}
            ${empContrib.tdsAnnual !== undefined ? ` | <strong>Annual TDS:</strong> ${formatINR(empContrib.tdsAnnual)}` : ''}
        </div>` : ''}

        <div class="ps-footer-note">
            <p>This is a computer-generated payslip and does not require a signature.</p>
        </div>

        <div class="ps-company-footer">
            <div class="footer-line"></div>
            <p><strong>PrimeAxis IT Solutions</strong> | Plot No: 207, Road No: 8, Vasanth Nagar, KPHB, Hyderabad - 500072, Telangana</p>
            <p>Phone: +91 8333079944 | Email: info@primeaxisit.com | Web: www.primeaxisit.com</p>
        </div>
    </div>`;
}

// ===================================================================
//  EMPLOYEE SELF-SERVICE PAGES
// ===================================================================
async function pageMyProfile() {
    pageTitle.textContent = 'My Profile';
    const profile = await apiGet('/my/profile');
    if (!profile) { content.innerHTML = '<div class="empty-state"><i class="fas fa-user-slash"></i><h3>Profile Not Found</h3><p>Your employee profile has not been set up yet. Please contact HR.</p></div>'; return; }
    content.innerHTML = `
        <div class="stats-grid">
            ${statCard('fa-id-badge', 'blue', profile.employee_code, 'Employee Code')}
            ${statCard('fa-briefcase', 'purple', profile.designation || '—', 'Designation')}
            ${statCard('fa-building', 'cyan', profile.department || '—', 'Department')}
            ${statCard('fa-calendar', 'green', formatDate(profile.date_of_joining), 'Joining Date')}
        </div>
        <div class="form-grid" style="margin-top:20px">
            <div class="table-card" style="padding:20px">
                <h3 style="margin-bottom:16px;font-family:Poppins,sans-serif"><i class="fas fa-user" style="color:var(--p-primary)"></i> Personal Details</h3>
                ${infoRow('Full Name', profile.name)}${infoRow('Email', profile.email)}${infoRow('Phone', profile.phone)}
                ${infoRow('Address', [profile.address, profile.city, profile.state, profile.pincode].filter(Boolean).join(', '))}
                ${infoRow('PAN', profile.pan)}${infoRow('Aadhar', profile.aadhar)}${infoRow('UAN', profile.uan)}
            </div>
            <div class="table-card" style="padding:20px">
                <h3 style="margin-bottom:16px;font-family:Poppins,sans-serif"><i class="fas fa-university" style="color:var(--p-green)"></i> Bank Details</h3>
                ${infoRow('Bank', profile.bank_name)}${infoRow('Account', profile.bank_account)}${infoRow('IFSC', profile.ifsc_code)}
                <h3 style="margin:20px 0 12px;font-family:Poppins,sans-serif"><i class="fas fa-phone-alt" style="color:var(--p-gold)"></i> Emergency Contact
                    <button class="btn btn-sm btn-secondary" onclick="showEditEmergencyModal('${esc(profile.emergency_contact || '')}', '${esc(profile.emergency_phone || '')}')" style="float:right;margin-top:-4px"><i class="fas fa-edit"></i> Edit</button>
                </h3>
                ${infoRow('Contact Name', profile.emergency_contact)}${infoRow('Contact Phone', profile.emergency_phone)}
            </div>
        </div>`;
}

window.showEditEmergencyModal = (currentName, currentPhone) => {
    openModal('Update Emergency Contact', `
        <p style="color:var(--p-text-muted);margin-bottom:16px;font-size:0.9rem">Update your emergency contact details. This will be used in case of any workplace emergency.</p>
        <div class="form-group"><label>Contact Person Name *</label><input class="form-control" id="em_name" value="${currentName}"></div>
        <div class="form-group"><label>Contact Phone Number *</label><input class="form-control" id="em_phone" type="tel" value="${currentPhone}" placeholder="+91 XXXXXXXXXX"></div>
        <button class="btn btn-primary" onclick="updateEmergencyContact()" style="margin-top:12px;width:100%"><i class="fas fa-save"></i> Update Emergency Contact</button>
    `);
};

window.updateEmergencyContact = async () => {
    const name = $('#em_name').value.trim();
    const phone = $('#em_phone').value.trim();
    if (!name || !phone) return toast('Both name and phone are required', 'error');
    try {
        await apiPut('/my/emergency-contact', { emergency_contact: name, emergency_phone: phone });
        toast('Emergency contact updated');
        closeModal();
        pageMyProfile();
    } catch (e) { toast(e.message, 'error'); }
};
function infoRow(label, val) { return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--p-border)"><span style="color:var(--p-text-muted);font-size:0.85rem">${label}</span><strong style="font-size:0.85rem">${esc(val || '—')}</strong></div>`; }

async function pageMyOffer() {
    pageTitle.textContent = 'My Offer Letter';
    const o = await apiGet('/my/offer');
    if (!o) { content.innerHTML = '<div class="empty-state"><i class="fas fa-file-contract"></i><h3>No Offer Letter</h3><p>Your offer letter has not been released yet.</p></div>'; return; }
    content.innerHTML = renderOfferLetter(o) + `<br><button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Print / Download PDF</button>`;
}

async function pageMyTimesheets() {
    pageTitle.textContent = 'My Timesheets';
    const ts = await apiGet('/my/timesheets');

    // Parse entries for each timesheet to show daily breakdown
    const parsedTs = ts.map(t => {
        let entries = [];
        try { entries = JSON.parse(t.entries); } catch(e) {}
        return { ...t, parsedEntries: entries };
    });

    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-clock"></i> My Timesheets</h3>
                <button class="btn btn-primary" onclick="showCreateTimesheetModal()"><i class="fas fa-plus"></i> New Timesheet</button>
            </div>
            ${ts.length === 0 ? '<div style="text-align:center;padding:60px 20px;color:var(--p-text-muted)"><i class="fas fa-clock" style="font-size:2.5rem;margin-bottom:12px;display:block;opacity:0.3"></i>No timesheets yet. Create your first one!</div>' : parsedTs.map(t => {
                const weekStart = new Date(t.week_start + 'T00:00:00');
                const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
                const dayDates = days.map((_, i) => {
                    const d = new Date(weekStart);
                    d.setDate(weekStart.getDate() + i);
                    return d;
                });
                // Build daily hours from entries
                const dailyTotals = [0,0,0,0,0,0,0];
                t.parsedEntries.forEach(entry => {
                    if (entry.daily) {
                        entry.daily.forEach((h, i) => { dailyTotals[i] += (parseFloat(h) || 0); });
                    } else if (entry.hours) {
                        // Legacy: distribute evenly across weekdays
                        const hrs = parseFloat(entry.hours) || 0;
                        const perDay = Math.round((hrs / 5) * 100) / 100;
                        for (let i = 0; i < 5; i++) dailyTotals[i] += perDay;
                    }
                });
                const grandTotal = dailyTotals.reduce((s, h) => s + h, 0);

                return `
                <div class="ts-week-card" style="margin:16px;border:1px solid var(--p-border);border-radius:12px;overflow:hidden">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:linear-gradient(135deg,rgba(0,210,255,0.08),rgba(88,86,214,0.08));border-bottom:1px solid var(--p-border)">
                        <div>
                            <span style="font-weight:600;font-size:0.95rem"><i class="fas fa-calendar-week" style="color:var(--p-cyan);margin-right:6px"></i>${formatDate(t.week_start)} — ${formatDate(t.week_end)}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px">
                            ${statusBadge(t.status)}
                            ${t.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="submitTimesheet(${t.id})"><i class="fas fa-paper-plane"></i> Submit</button>` : ''}
                        </div>
                    </div>
                    ${t.reject_reason ? `<div style="padding:8px 18px;background:rgba(255,59,48,0.08);color:var(--p-red);font-size:0.82rem"><i class="fas fa-exclamation-circle"></i> Rejected: ${esc(t.reject_reason)}</div>` : ''}
                    <div style="overflow-x:auto">
                        <table class="ts-grid" style="width:100%;border-collapse:collapse;font-size:0.85rem">
                            <thead>
                                <tr style="background:var(--p-sidebar)">
                                    <th style="text-align:left;padding:10px 14px;min-width:140px;border-right:1px solid var(--p-border)">Project / Task</th>
                                    ${days.map((day, i) => {
                                        const d = dayDates[i];
                                        const isWeekend = i >= 5;
                                        return `<th style="text-align:center;padding:10px 8px;min-width:70px;${isWeekend ? 'opacity:0.5;' : ''}border-right:1px solid var(--p-border)">
                                            <div style="font-weight:600;color:${isWeekend ? 'var(--p-text-muted)' : 'var(--p-cyan)'}">${day}</div>
                                            <div style="font-size:0.75rem;color:var(--p-text-muted);font-weight:400">${String(d.getDate()).padStart(2,'0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}</div>
                                        </th>`;
                                    }).join('')}
                                    <th style="text-align:center;padding:10px 8px;min-width:70px;font-weight:700;color:var(--p-cyan)">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${t.parsedEntries.map(entry => {
                                    const daily = entry.daily || (entry.hours ? [0,0,0,0,0,0,0].map((_, i) => i < 5 ? Math.round((parseFloat(entry.hours)/5)*100)/100 : 0) : [0,0,0,0,0,0,0]);
                                    const rowTotal = daily.reduce((s, h) => s + (parseFloat(h) || 0), 0);
                                    return `<tr style="border-top:1px solid var(--p-border)">
                                        <td style="padding:10px 14px;font-weight:500;border-right:1px solid var(--p-border)"><i class="fas fa-project-diagram" style="color:var(--p-purple);margin-right:6px;font-size:0.75rem"></i>${esc(entry.project || 'General')}</td>
                                        ${daily.map((h, i) => `<td style="text-align:center;padding:10px 8px;${i >= 5 ? 'opacity:0.5;' : ''}border-right:1px solid var(--p-border);${parseFloat(h) > 0 ? 'color:var(--p-text)' : 'color:var(--p-text-muted)'}">${parseFloat(h) ? parseFloat(h).toFixed(2) : '—'}</td>`).join('')}
                                        <td style="text-align:center;padding:10px 8px;font-weight:700;color:var(--p-cyan)">${rowTotal.toFixed(2)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="border-top:2px solid var(--p-cyan);background:rgba(0,210,255,0.04)">
                                    <td style="padding:10px 14px;font-weight:700;border-right:1px solid var(--p-border)"><i class="fas fa-calculator" style="color:var(--p-green);margin-right:6px;font-size:0.75rem"></i>Total Hours</td>
                                    ${dailyTotals.map((h, i) => `<td style="text-align:center;padding:10px 8px;font-weight:700;${i >= 5 ? 'opacity:0.5;' : ''}border-right:1px solid var(--p-border);color:${h > 0 ? 'var(--p-green)' : 'var(--p-text-muted)'}">${h ? h.toFixed(2) : '—'}</td>`).join('')}
                                    <td style="text-align:center;padding:10px 8px;font-weight:800;font-size:1rem;color:var(--p-green)">${grandTotal.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

window.showCreateTimesheetModal = () => {
    const today = new Date();
    const monday = new Date(today);
    const dow = today.getDay();
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = d => d.toISOString().split('T')[0];
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const dayDates = days.map((_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
    });

    // Larger modal for weekly grid
    openModal('New Weekly Timesheet', `
        <div style="margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div class="form-group" style="margin:0;flex:1;min-width:140px"><label>Week Start</label><input class="form-control" id="ts_start" type="date" value="${fmt(monday)}" onchange="tsUpdateWeekDates()"></div>
            <div class="form-group" style="margin:0;flex:1;min-width:140px"><label>Week End (auto)</label><input class="form-control" id="ts_end" type="date" value="${fmt(sunday)}" readonly style="opacity:0.6"></div>
            <button class="btn btn-sm" onclick="tsAddRow()" style="align-self:end;margin-bottom:2px"><i class="fas fa-plus"></i> Add Row</button>
        </div>
        <div style="overflow-x:auto;border:1px solid var(--p-border);border-radius:10px">
            <table id="tsGrid" style="width:100%;border-collapse:collapse;font-size:0.85rem">
                <thead>
                    <tr style="background:linear-gradient(135deg,rgba(0,210,255,0.1),rgba(88,86,214,0.1))">
                        <th style="text-align:left;padding:10px 12px;min-width:150px;border-right:1px solid var(--p-border)">Project / Task</th>
                        ${days.map((day, i) => `<th id="tsDay${i}" style="text-align:center;padding:10px 6px;min-width:68px;border-right:1px solid var(--p-border)">
                            <div style="font-weight:600;color:${i >= 5 ? 'var(--p-text-muted)' : 'var(--p-cyan)'}">${day}</div>
                            <div style="font-size:0.72rem;color:var(--p-text-muted);font-weight:400">${String(dayDates[i].getDate()).padStart(2,'0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dayDates[i].getMonth()]}</div>
                        </th>`).join('')}
                        <th style="text-align:center;padding:10px 6px;min-width:60px;color:var(--p-cyan);font-weight:700">Total</th>
                        <th style="width:36px"></th>
                    </tr>
                </thead>
                <tbody id="tsRows">
                    <tr class="ts-entry-row" style="border-top:1px solid var(--p-border)">
                        <td style="padding:6px 8px;border-right:1px solid var(--p-border)"><input class="form-control ts-proj" placeholder="Project name" style="font-size:0.82rem;padding:6px 8px"></td>
                        ${days.map((_, i) => `<td style="padding:4px;border-right:1px solid var(--p-border)"><input class="form-control ts-day" data-day="${i}" type="number" min="0" max="24" step="0.5" value="${i < 5 ? '8' : '0'}" oninput="tsCalcTotals()" style="text-align:center;font-size:0.82rem;padding:6px 4px;${i >= 5 ? 'opacity:0.6' : ''}"></td>`).join('')}
                        <td class="ts-row-total" style="text-align:center;padding:8px;font-weight:700;color:var(--p-cyan)">40.00</td>
                        <td style="padding:4px"><button class="btn btn-sm" onclick="tsRemoveRow(this)" style="color:var(--p-red);padding:4px 6px" title="Remove"><i class="fas fa-trash-alt"></i></button></td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr style="border-top:2px solid var(--p-cyan);background:rgba(0,210,255,0.04)">
                        <td style="padding:10px 12px;font-weight:700;border-right:1px solid var(--p-border)"><i class="fas fa-calculator" style="color:var(--p-green);margin-right:6px"></i>Daily Total</td>
                        ${days.map((_, i) => `<td id="tsDayTotal${i}" style="text-align:center;padding:10px 6px;font-weight:700;border-right:1px solid var(--p-border);color:var(--p-green)">—</td>`).join('')}
                        <td id="tsGrandTotal" style="text-align:center;padding:10px 6px;font-weight:800;font-size:1rem;color:var(--p-green)">40.00</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end">
            <button class="btn" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="saveTimesheet()"><i class="fas fa-save"></i> Save Draft</button>
        </div>
    `, { wide: true });
    tsCalcTotals();
};

window.tsAddRow = () => {
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const row = document.createElement('tr');
    row.className = 'ts-entry-row';
    row.style.borderTop = '1px solid var(--p-border)';
    row.innerHTML = `
        <td style="padding:6px 8px;border-right:1px solid var(--p-border)"><input class="form-control ts-proj" placeholder="Project name" style="font-size:0.82rem;padding:6px 8px"></td>
        ${days.map((_, i) => `<td style="padding:4px;border-right:1px solid var(--p-border)"><input class="form-control ts-day" data-day="${i}" type="number" min="0" max="24" step="0.5" value="0" oninput="tsCalcTotals()" style="text-align:center;font-size:0.82rem;padding:6px 4px;${i >= 5 ? 'opacity:0.6' : ''}"></td>`).join('')}
        <td class="ts-row-total" style="text-align:center;padding:8px;font-weight:700;color:var(--p-cyan)">0.00</td>
        <td style="padding:4px"><button class="btn btn-sm" onclick="tsRemoveRow(this)" style="color:var(--p-red);padding:4px 6px" title="Remove"><i class="fas fa-trash-alt"></i></button></td>
    `;
    document.getElementById('tsRows').appendChild(row);
};

window.tsRemoveRow = (btn) => {
    const rows = document.querySelectorAll('.ts-entry-row');
    if (rows.length <= 1) { toast('Need at least one row', 'error'); return; }
    btn.closest('tr').remove();
    tsCalcTotals();
};

window.tsCalcTotals = () => {
    const dayTotals = [0,0,0,0,0,0,0];
    document.querySelectorAll('.ts-entry-row').forEach(row => {
        let rowTotal = 0;
        row.querySelectorAll('.ts-day').forEach(inp => {
            const v = parseFloat(inp.value) || 0;
            const day = parseInt(inp.dataset.day);
            dayTotals[day] += v;
            rowTotal += v;
        });
        row.querySelector('.ts-row-total').textContent = rowTotal.toFixed(2);
    });
    let grand = 0;
    dayTotals.forEach((t, i) => {
        const el = document.getElementById(`tsDayTotal${i}`);
        if (el) { el.textContent = t > 0 ? t.toFixed(2) : '—'; el.style.color = t > 0 ? 'var(--p-green)' : 'var(--p-text-muted)'; }
        grand += t;
    });
    const ge = document.getElementById('tsGrandTotal');
    if (ge) ge.textContent = grand.toFixed(2);
};

window.tsUpdateWeekDates = () => {
    const startVal = document.getElementById('ts_start').value;
    if (!startVal) return;
    const start = new Date(startVal + 'T00:00:00');
    // Snap to Monday
    const dow = start.getDay();
    if (dow !== 1) start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
    document.getElementById('ts_start').value = start.toISOString().split('T')[0];
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    document.getElementById('ts_end').value = end.toISOString().split('T')[0];
    // Update column headers
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const el = document.getElementById(`tsDay${i}`);
        if (el) el.querySelector('div:last-child').textContent = `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}`;
    }
};

window.saveTimesheet = async () => {
    const rows = document.querySelectorAll('.ts-entry-row');
    const entries = [];
    let totalHours = 0;
    rows.forEach(row => {
        const proj = row.querySelector('.ts-proj').value || 'General';
        const daily = [];
        row.querySelectorAll('.ts-day').forEach(inp => { daily.push(parseFloat(inp.value) || 0); });
        const rowTotal = daily.reduce((s, h) => s + h, 0);
        if (rowTotal > 0) {
            entries.push({ project: proj, daily, hours: rowTotal });
            totalHours += rowTotal;
        }
    });
    if (entries.length === 0 || totalHours <= 0) { toast('Enter at least some hours', 'error'); return; }
    try {
        await apiPost('/timesheets', { week_start: $('#ts_start').value, week_end: $('#ts_end').value, entries });
        toast('Timesheet saved as draft'); closeModal(); pageMyTimesheets();
    } catch (e) { toast(e.message, 'error'); }
};

window.submitTimesheet = async (id) => { try { await apiPut(`/timesheets/${id}/submit`); toast('Submitted for approval'); pageMyTimesheets(); } catch (e) { toast(e.message, 'error'); } };

async function pageMyLeaves() {
    pageTitle.textContent = 'My Leaves';
    const [leaves, balance] = await Promise.all([apiGet('/my/leaves'), apiGet('/my/leave-balance')]);
    let balHtml = '';
    if (balance) {
        balHtml = `<div class="stats-grid" style="margin-bottom:20px">
            ${statCard('fa-umbrella-beach', 'blue', `${balance.casual_total - balance.casual_used}/${balance.casual_total}`, 'Casual')}
            ${statCard('fa-briefcase-medical', 'green', `${balance.sick_total - balance.sick_used}/${balance.sick_total}`, 'Sick')}
            ${statCard('fa-star', 'gold', `${balance.earned_total - balance.earned_used}/${balance.earned_total}`, 'Earned')}
        </div>`;
    }
    content.innerHTML = balHtml + `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-calendar-check"></i> My Leave Requests</h3>
                <button class="btn btn-primary" onclick="showApplyLeaveModal()"><i class="fas fa-plus"></i> Apply Leave</button>
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
                <tbody>
                    ${leaves.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--p-text-muted)">No leave requests</td></tr>' : leaves.map(l => `<tr>
                        <td style="text-transform:capitalize">${l.leave_type}</td>
                        <td>${formatDate(l.from_date)}</td><td>${formatDate(l.to_date)}</td>
                        <td>${l.days}${l.lop_days > 0 ? ` <span class="badge-lop">${l.lop_days}d LOP</span>` : ''}</td>
                        <td>${esc(l.reason || '—')}</td><td>${statusBadge(l.status)}</td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showApplyLeaveModal = () => {
    openModal('Apply for Leave', `
        <div class="form-grid">
            <div class="form-group"><label>Leave Type *</label><select class="form-control" id="lv_type" onchange="checkLeaveLOP()">
                <option value="casual">Casual Leave</option><option value="sick">Sick Leave</option>
                <option value="earned">Earned Leave</option><option value="unpaid">Unpaid Leave</option>
            </select></div>
            <div class="form-group"><label>From Date *</label><input class="form-control" id="lv_from" type="date" onchange="checkLeaveLOP()"></div>
            <div class="form-group"><label>To Date *</label><input class="form-control" id="lv_to" type="date" onchange="checkLeaveLOP()"></div>
            <div class="form-group full-width"><label>Reason</label><textarea class="form-control" id="lv_reason" rows="2"></textarea></div>
        </div>
        <div id="lv_lop_info" style="margin-top:8px"></div>
        <button class="btn btn-primary" onclick="applyLeave()" style="margin-top:8px"><i class="fas fa-paper-plane"></i> Submit</button>
    `);
};

window.checkLeaveLOP = async () => {
    const type = $('#lv_type')?.value;
    const from = $('#lv_from')?.value;
    const to = $('#lv_to')?.value;
    const infoDiv = document.getElementById('lv_lop_info');
    if (!type || !from || !to || !infoDiv) return;
    if (new Date(to) < new Date(from)) { infoDiv.innerHTML = ''; return; }
    try {
        const data = await apiPost('/leaves/check-lop', { leave_type: type, from_date: from, to_date: to });
        if (data.error) {
            infoDiv.innerHTML = `<div class="lop-warning"><i class="fas fa-info-circle"></i> ${esc(data.error)}</div>`;
            return;
        }
        let html = `<div class="lop-info-box">
            <div class="lop-info-row"><span>Working Days in Range</span><strong>${data.days}</strong></div>`;
        if (data.leave_type !== 'unpaid' && data.balance) {
            html += `<div class="lop-info-row"><span>Available ${type} Balance</span><strong>${data.available}</strong></div>`;
        }
        if (data.is_lop) {
            html += `<div class="lop-info-row lop-danger"><span><i class="fas fa-exclamation-triangle"></i> Loss of Pay Days</span><strong>${data.lop_days} day(s)</strong></div>`;
            if (data.leave_type === 'unpaid') {
                html += `<div class="lop-note">All unpaid leave days are treated as Loss of Pay and will be deducted from salary.</div>`;
            } else {
                html += `<div class="lop-note">${data.lop_days} day(s) exceed your ${type} leave balance and will be deducted from salary as LOP.</div>`;
            }
        } else {
            html += `<div class="lop-info-row lop-safe"><span><i class="fas fa-check-circle"></i> Within balance</span><strong>No LOP</strong></div>`;
        }
        html += '</div>';
        infoDiv.innerHTML = html;
    } catch (e) { infoDiv.innerHTML = ''; }
};

window.applyLeave = async () => {
    try {
        const res = await apiPost('/leaves', { leave_type: $('#lv_type').value, from_date: $('#lv_from').value, to_date: $('#lv_to').value, reason: $('#lv_reason').value });
        const msg = res.is_lop ? `Leave applied: ${res.days} day(s), ${res.lop_days} day(s) LOP` : `Leave applied for ${res.days} day(s)`;
        toast(msg, res.is_lop ? 'warning' : 'success'); closeModal(); pageMyLeaves();
    } catch (e) { toast(e.message, 'error'); }
};

async function pageMyPayslips() {
    pageTitle.textContent = 'My Payslips';
    const payslips = await apiGet('/payslips');
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header"><h3><i class="fas fa-receipt"></i> My Payslips</h3></div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Period</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>View</th></tr></thead>
                <tbody>
                    ${payslips.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--p-text-muted)">No payslips available yet</td></tr>' : payslips.map(p => `<tr>
                        <td>${monthNames[p.month]} ${p.year}</td>
                        <td>${formatINR(p.gross_earnings)}</td>
                        <td style="color:var(--p-red)">${formatINR(p.total_deductions)}</td>
                        <td style="color:var(--p-green);font-weight:700">${formatINR(p.net_pay)}</td>
                        <td><button class="btn btn-sm btn-secondary" onclick="viewPayslip(${p.id})"><i class="fas fa-eye"></i></button></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

// ===================================================================
//  PAGE: RELIEVING LETTERS (Admin/HR)
// ===================================================================
async function pageRelievingLetters() {
    pageTitle.textContent = 'Relieving Letters';
    const letters = await apiGet('/relieving-letters');
    const canCreate = ['admin', 'hr'].includes(u.role);
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-file-circle-check"></i> Relieving Letters (${letters.length})</h3>
                ${canCreate ? '<button class="btn btn-primary" onclick="showCreateRelievingModal()"><i class="fas fa-plus"></i> Create Relieving Letter</button>' : ''}
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Ref</th><th>Employee</th><th>Code</th><th>Designation</th><th>Leaving Date</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                    ${letters.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--p-text-muted)">No relieving letters</td></tr>' : letters.map(r => `<tr>
                        <td><strong>${esc(r.reference_no)}</strong></td>
                        <td>${esc(r.employee_name)}</td>
                        <td>${esc(r.employee_code || '—')}</td>
                        <td>${esc(r.designation)}</td>
                        <td>${formatDate(r.date_of_leaving)}</td>
                        <td>${esc(r.reason || '—')}</td>
                        <td>${statusBadge(r.status)}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewRelieving(${r.id})"><i class="fas fa-eye"></i></button>
                            ${r.status === 'draft' && u.role === 'admin' ? `<button class="btn btn-sm btn-success" onclick="approveRelieving(${r.id})"><i class="fas fa-check"></i></button>` : ''}
                            ${r.status === 'approved' && canCreate ? `<button class="btn btn-sm btn-primary" onclick="releaseRelieving(${r.id})"><i class="fas fa-share"></i> Release</button>` : ''}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showCreateRelievingModal = async () => {
    const emps = await apiGet('/employees');
    openModal('Create Relieving Letter', `
        <div class="form-grid">
            <div class="form-group"><label>Employee *</label><select class="form-control" id="rl_emp">
                <option value="">Select Employee</option>
                ${emps.map(e => `<option value="${e.id}">${esc(e.name)} (${esc(e.employee_code)}) — ${esc(e.designation)}</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Last Working Date *</label><input class="form-control" id="rl_date" type="date"></div>
            <div class="form-group full-width"><label>Reason for Separation</label><select class="form-control" id="rl_reason">
                <option value="Resignation">Resignation</option>
                <option value="Mutual Separation">Mutual Separation</option>
                <option value="End of Contract">End of Contract</option>
                <option value="Retirement">Retirement</option>
            </select></div>
        </div>
        <button class="btn btn-primary" onclick="createRelieving()" style="margin-top:12px"><i class="fas fa-save"></i> Create</button>
    `);
};

window.createRelieving = async () => {
    try {
        await apiPost('/relieving-letters', {
            employee_id: parseInt($('#rl_emp').value),
            date_of_leaving: $('#rl_date').value,
            reason: $('#rl_reason').value,
        });
        toast('Relieving letter created');
        closeModal(); pageRelievingLetters();
    } catch (e) { toast(e.message, 'error'); }
};

window.approveRelieving = async (id) => { try { await apiPut(`/relieving-letters/${id}/approve`); toast('Approved'); pageRelievingLetters(); } catch (e) { toast(e.message, 'error'); } };
window.releaseRelieving = async (id) => { try { await apiPut(`/relieving-letters/${id}/release`); toast('Relieving letter released'); pageRelievingLetters(); } catch (e) { toast(e.message, 'error'); } };

window.viewRelieving = async (id) => {
    const letters = await apiGet('/relieving-letters');
    const r = letters.find(x => x.id === id);
    if (!r) return;
    openModal('Relieving Letter', renderRelievingLetter(r) + `<br><button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Print / Download PDF</button>`);
};

function renderRelievingLetter(r) {
    return `<div class="offer-preview">
        <div class="letter-page">
            <div class="letterhead">
                <div class="lh-left">
                    <img src="../assets/logo/2.png" alt="PrimeAxis IT" class="lh-logo">
                    <div class="lh-company">
                        <h1>PrimeAxis IT Solutions</h1>
                        <p>Innovative Technology Services</p>
                    </div>
                </div>
                <div class="lh-right">
                    Plot No: 207, Road No: 8, Vasanth Nagar<br>
                    Near JNTU Metro Station, KPHB<br>
                    Hyderabad - 500072, Telangana<br>
                    Phone: +91 8333079944<br>
                    Email: info@primeaxisit.com
                </div>
            </div>

            <div class="ref-row">
                <span><strong>Ref No:</strong> ${esc(r.reference_no)}</span>
                <span><strong>Date:</strong> ${formatDateLong(r.released_at || r.created_at)}</span>
            </div>

            <h2 class="letter-title">RELIEVING LETTER</h2>

            <div class="recipient">
                <strong>To,</strong><br>
                <strong>${esc(r.employee_name)}</strong><br>
                Employee ID: ${esc(r.employee_code || '—')}
            </div>

            <p>Dear <strong>${esc(r.employee_name)}</strong>,</p>

            <p>This is with reference to your ${esc(r.reason || 'resignation')} and in accordance with the terms of your employment with PrimeAxis IT Solutions.</p>

            <p>We hereby confirm that <strong>${esc(r.employee_name)}</strong> (Employee ID: <strong>${esc(r.employee_code || '')}</strong>) was employed with <strong>PrimeAxis IT Solutions</strong> as <strong>${esc(r.designation)}</strong> in the <strong>${esc(r.department)}</strong> department from <strong>${formatDateLong(r.date_of_joining)}</strong> to <strong>${formatDateLong(r.date_of_leaving)}</strong>.</p>

            <p>${esc(r.employee_name)} is hereby relieved from the duties and responsibilities of the organization with effect from <strong>${formatDateLong(r.date_of_leaving)}</strong>.</p>

            <p>During the tenure with our organization, we found ${esc(r.employee_name)} to be sincere, dedicated, and hardworking. All assignments and responsibilities entrusted were completed satisfactorily.</p>

            <p>We confirm that:</p>
            <ol class="terms-list" style="margin-bottom:16px">
                <li>All company assets, including laptop, ID card, access card, and any other equipment, have been returned in good condition.</li>
                <li>All outstanding dues and settlements have been cleared as per company policy.</li>
                <li>There are no pending obligations or liabilities from either party.</li>
                <li>The employee has complied with all exit formalities as required by the company.</li>
            </ol>

            <p>We wish <strong>${esc(r.employee_name)}</strong> all the very best in future professional endeavors.</p>

            <p style="margin-top:8px"><em>This letter is issued upon request of the employee for record and reference purposes.</em></p>

            <div class="signature-block">
                <div class="sig-left">
                    <div class="sig-line"></div>
                    <strong>For PrimeAxis IT Solutions</strong><br>
                    <span>Authorized Signatory</span><br>
                    <span>HR Department</span>
                </div>
                <div class="sig-right" style="text-align:center">
                    <div style="width:80px;height:80px;border:2px dashed #ccc;border-radius:8px;display:flex;align-items:center;justify-content:center;margin:0 auto 8px">
                        <span style="font-size:10px;color:#aaa">Company<br>Seal</span>
                    </div>
                </div>
            </div>

            <div class="letter-footer">
                <div class="footer-line"></div>
                <p><strong>PrimeAxis IT Solutions</strong> | Plot No: 207, Road No: 8, Vasanth Nagar, Near JNTU Metro Station, KPHB, Hyderabad - 500072, Telangana, India</p>
                <p>Phone: +91 8333079944 | Email: info@primeaxisit.com | Web: www.primeaxisit.com</p>
            </div>
        </div>
    </div>`;
}

// ===================================================================
//  PAGE: SUPPORT TICKETS (Admin/HR/Manager view)
// ===================================================================
const ticketCategories = ['IT Support','HR','Finance','Facilities','Admin','Access/Permissions','Other'];
const ticketPriorities = ['low','medium','high','critical'];

function priorityBadge(p) {
    const colors = { low: 'blue', medium: 'gold', high: 'red', critical: 'red' };
    const style = p === 'critical' ? 'background:var(--p-red);color:#fff;' : '';
    return `<span class="badge-status ${colors[p] || 'blue'}" style="${style};text-transform:capitalize">${p}</span>`;
}

function categoryIcon(cat) {
    const icons = { 'IT Support': 'fa-laptop-code', 'HR': 'fa-people-group', 'Finance': 'fa-indian-rupee-sign', 'Facilities': 'fa-building', 'Admin': 'fa-gear', 'Access/Permissions': 'fa-key', 'Other': 'fa-circle-question' };
    return icons[cat] || 'fa-ticket';
}

async function pageTickets() {
    pageTitle.textContent = 'Support Tickets';
    const tickets = await apiGet('/tickets');
    const isAdmin = ['admin', 'hr'].includes(u.role);

    const openCount = tickets.filter(t => ['open','in_progress','reopened'].includes(t.status)).length;
    const resolvedCount = tickets.filter(t => ['resolved','closed'].includes(t.status)).length;

    content.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px">
            ${statCard('fa-ticket', 'blue', tickets.length, 'Total Tickets')}
            ${statCard('fa-circle-exclamation', 'gold', openCount, 'Open / In Progress')}
            ${statCard('fa-circle-check', 'green', resolvedCount, 'Resolved / Closed')}
            ${statCard('fa-fire', 'red', tickets.filter(t => t.priority === 'critical' && !['resolved','closed'].includes(t.status)).length, 'Critical Open')}
        </div>
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-ticket"></i> All Tickets (${tickets.length})</h3>
                <div style="display:flex;gap:8px;align-items:center">
                    <select class="form-control" id="filterStatus" onchange="filterTicketsTable()" style="width:auto;padding:6px 10px;font-size:0.8rem">
                        <option value="">All Status</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="reopened">Reopened</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                    <select class="form-control" id="filterCategory" onchange="filterTicketsTable()" style="width:auto;padding:6px 10px;font-size:0.8rem">
                        <option value="">All Categories</option>
                        ${ticketCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="table-wrapper"><table id="ticketsTable">
                <thead><tr><th>Ticket #</th><th>Raised By</th><th>Category</th><th>Subject</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                    ${tickets.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--p-text-muted)">No tickets yet</td></tr>' : tickets.map(t => `<tr data-status="${t.status}" data-category="${t.category}">
                        <td><strong>${esc(t.ticket_no)}</strong></td>
                        <td>${esc(t.raised_by_name)}</td>
                        <td><i class="fas ${categoryIcon(t.category)}" style="margin-right:4px;opacity:0.6"></i>${esc(t.category)}</td>
                        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.subject)}</td>
                        <td>${priorityBadge(t.priority)}</td>
                        <td>${statusBadge(t.status)}</td>
                        <td>${t.assigned_to_name ? esc(t.assigned_to_name) : '<span style="color:var(--p-text-muted)">Unassigned</span>'}</td>
                        <td style="white-space:nowrap">${formatDate(t.created_at)}</td>
                        <td><button class="btn btn-sm btn-secondary" onclick="openTicketDetail(${t.id})"><i class="fas fa-eye"></i></button></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.filterTicketsTable = () => {
    const status = $('#filterStatus').value;
    const category = $('#filterCategory').value;
    document.querySelectorAll('#ticketsTable tbody tr').forEach(tr => {
        const matchStatus = !status || tr.dataset.status === status;
        const matchCat = !category || tr.dataset.category === category;
        tr.style.display = (matchStatus && matchCat) ? '' : 'none';
    });
};

window.openTicketDetail = async (id) => {
    const t = await apiGet(`/tickets/${id}`);
    const isAdmin = ['admin', 'hr', 'manager'].includes(u.role);
    const canAssign = ['admin', 'hr'].includes(u.role);

    let usersOptions = '';
    if (canAssign) {
        try {
            const users = await apiGet('/users');
            usersOptions = users.filter(u => u.is_active).map(u => `<option value="${u.id}" ${t.assigned_to === u.id ? 'selected' : ''}>${esc(u.name)} (${u.role})</option>`).join('');
        } catch(e) {}
    }

    openModal(`${t.ticket_no} — ${esc(t.subject)}`, `
        <div class="ticket-detail">
            <div class="ticket-meta">
                <div><span class="label">Category:</span> <i class="fas ${categoryIcon(t.category)}"></i> ${esc(t.category)}</div>
                <div><span class="label">Priority:</span> ${priorityBadge(t.priority)}</div>
                <div><span class="label">Status:</span> ${statusBadge(t.status)}</div>
                <div><span class="label">Raised By:</span> ${esc(t.raised_by_name)}</div>
                <div><span class="label">Created:</span> ${formatDate(t.created_at)}</div>
                ${t.assigned_to_name ? `<div><span class="label">Assigned To:</span> ${esc(t.assigned_to_name)}</div>` : ''}
                ${t.resolution ? `<div style="grid-column:1/-1"><span class="label">Resolution:</span> ${esc(t.resolution)}</div>` : ''}
            </div>

            <div class="ticket-description">
                <h4>Description</h4>
                <p>${esc(t.description).replace(/\n/g, '<br>')}</p>
            </div>

            ${t.comments && t.comments.length > 0 ? `
                <div class="ticket-comments">
                    <h4>Comments (${t.comments.length})</h4>
                    ${t.comments.map(c => `
                        <div class="comment ${c.is_internal ? 'internal' : ''}">
                            <div class="comment-header">
                                <strong>${esc(c.user_name)}</strong>
                                <span class="comment-role">${c.user_role}</span>
                                ${c.is_internal ? '<span class="comment-internal">Internal Note</span>' : ''}
                                <span class="comment-date">${formatDate(c.created_at)}</span>
                            </div>
                            <p>${esc(c.comment).replace(/\n/g, '<br>')}</p>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <div class="ticket-actions">
                <h4>Add Comment</h4>
                <textarea class="form-control" id="tk_comment" rows="3" placeholder="Type your reply..."></textarea>
                ${isAdmin ? '<label style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--p-text-muted)"><input type="checkbox" id="tk_internal"> Internal note (not visible to employee)</label>' : ''}
                <button class="btn btn-primary" onclick="addTicketComment(${t.id})" style="margin-top:8px"><i class="fas fa-paper-plane"></i> Send</button>
            </div>

            ${isAdmin ? `
                <div class="ticket-admin-actions">
                    <h4>Manage Ticket</h4>
                    <div class="form-grid">
                        ${canAssign ? `<div class="form-group">
                            <label>Assign To</label>
                            <select class="form-control" id="tk_assign">
                                <option value="">Unassigned</option>
                                ${usersOptions}
                            </select>
                            <button class="btn btn-sm btn-secondary" onclick="assignTicket(${t.id})" style="margin-top:6px"><i class="fas fa-user-plus"></i> Assign</button>
                        </div>` : ''}
                        <div class="form-group">
                            <label>Update Status</label>
                            <select class="form-control" id="tk_status">
                                <option value="open" ${t.status==='open'?'selected':''}>Open</option>
                                <option value="in_progress" ${t.status==='in_progress'?'selected':''}>In Progress</option>
                                <option value="resolved" ${t.status==='resolved'?'selected':''}>Resolved</option>
                                <option value="closed" ${t.status==='closed'?'selected':''}>Closed</option>
                            </select>
                            <textarea class="form-control" id="tk_resolution" placeholder="Resolution notes (optional)" rows="2" style="margin-top:6px">${esc(t.resolution || '')}</textarea>
                            <button class="btn btn-sm btn-success" onclick="updateTicketStatus(${t.id})" style="margin-top:6px"><i class="fas fa-check"></i> Update</button>
                        </div>
                    </div>
                </div>
            ` : ''}

            ${!isAdmin && ['resolved','closed'].includes(t.status) ? `
                <button class="btn btn-secondary" onclick="reopenTicket(${t.id})" style="margin-top:12px"><i class="fas fa-rotate-left"></i> Reopen Ticket</button>
            ` : ''}
        </div>
    `);
};

window.addTicketComment = async (id) => {
    const comment = $('#tk_comment')?.value;
    if (!comment?.trim()) { toast('Enter a comment', 'error'); return; }
    const isInternal = $('#tk_internal')?.checked || false;
    try {
        await apiPost(`/tickets/${id}/comment`, { comment, is_internal: isInternal });
        toast('Comment added'); openTicketDetail(id);
    } catch (e) { toast(e.message, 'error'); }
};

window.assignTicket = async (id) => {
    try {
        await apiPut(`/tickets/${id}/assign`, { assigned_to: parseInt($('#tk_assign').value) || null });
        toast('Ticket assigned'); openTicketDetail(id);
    } catch (e) { toast(e.message, 'error'); }
};

window.updateTicketStatus = async (id) => {
    try {
        await apiPut(`/tickets/${id}/status`, { status: $('#tk_status').value, resolution: $('#tk_resolution')?.value });
        toast('Ticket updated'); closeModal();
        if (['admin','hr','manager'].includes(u.role)) pageTickets(); else pageMyTickets();
    } catch (e) { toast(e.message, 'error'); }
};

window.reopenTicket = async (id) => {
    try {
        await apiPut(`/tickets/${id}/reopen`);
        toast('Ticket reopened'); openTicketDetail(id);
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: MY TICKETS (Employee self-service)
// ===================================================================
async function pageMyTickets() {
    pageTitle.textContent = 'My Support Tickets';
    const tickets = await apiGet('/tickets');
    const openCount = tickets.filter(t => ['open','in_progress','reopened'].includes(t.status)).length;

    content.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px">
            ${statCard('fa-ticket', 'blue', tickets.length, 'My Tickets')}
            ${statCard('fa-circle-exclamation', 'gold', openCount, 'Open / In Progress')}
            ${statCard('fa-circle-check', 'green', tickets.filter(t => ['resolved','closed'].includes(t.status)).length, 'Resolved')}
        </div>
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-ticket"></i> My Tickets</h3>
                <button class="btn btn-primary" onclick="showRaiseTicketModal()"><i class="fas fa-plus"></i> Raise Ticket</button>
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Ticket #</th><th>Category</th><th>Subject</th><th>Priority</th><th>Status</th><th>Assigned To</th><th>Created</th><th>View</th></tr></thead>
                <tbody>
                    ${tickets.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--p-text-muted)">No tickets raised yet. Click "Raise Ticket" to get help!</td></tr>' : tickets.map(t => `<tr>
                        <td><strong>${esc(t.ticket_no)}</strong></td>
                        <td><i class="fas ${categoryIcon(t.category)}" style="margin-right:4px;opacity:0.6"></i>${esc(t.category)}</td>
                        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.subject)}</td>
                        <td>${priorityBadge(t.priority)}</td>
                        <td>${statusBadge(t.status)}</td>
                        <td>${t.assigned_to_name ? esc(t.assigned_to_name) : '<span style="color:var(--p-text-muted)">Pending</span>'}</td>
                        <td style="white-space:nowrap">${formatDate(t.created_at)}</td>
                        <td><button class="btn btn-sm btn-secondary" onclick="openTicketDetail(${t.id})"><i class="fas fa-eye"></i></button></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showRaiseTicketModal = () => {
    openModal('Raise Support Ticket', `
        <div class="form-grid">
            <div class="form-group">
                <label>Category *</label>
                <select class="form-control" id="tk_cat">
                    ${ticketCategories.map(c => `<option value="${c}"><i class="fas"></i> ${c}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Priority</label>
                <select class="form-control" id="tk_pri">
                    <option value="low">Low — General query, no urgency</option>
                    <option value="medium" selected>Medium — Needs attention within a day</option>
                    <option value="high">High — Blocking my work</option>
                    <option value="critical">Critical — System down / Urgent</option>
                </select>
            </div>
            <div class="form-group full-width">
                <label>Subject *</label>
                <input class="form-control" id="tk_subj" placeholder="Brief summary of your issue">
            </div>
            <div class="form-group full-width">
                <label>Description *</label>
                <textarea class="form-control" id="tk_desc" rows="5" placeholder="Describe your issue in detail...\n\nInclude:\n• What happened?\n• When did it start?\n• Steps to reproduce (if applicable)\n• Any error messages?"></textarea>
            </div>
        </div>
        <button class="btn btn-primary" onclick="raiseTicket()" style="margin-top:12px"><i class="fas fa-paper-plane"></i> Submit Ticket</button>
    `);
};

window.raiseTicket = async () => {
    try {
        const res = await apiPost('/tickets', {
            category: $('#tk_cat').value,
            priority: $('#tk_pri').value,
            subject: $('#tk_subj').value,
            description: $('#tk_desc').value,
        });
        toast(`Ticket ${res.ticket_no} raised successfully`);
        closeModal(); pageMyTickets();
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: MY RELIEVING LETTER (Employee self-service)
// ===================================================================
async function pageMyRelieving() {
    pageTitle.textContent = 'My Relieving Letter';
    const r = await apiGet('/my/relieving-letter');
    if (!r) { content.innerHTML = '<div class="empty-state"><i class="fas fa-file-circle-check"></i><h3>No Relieving Letter</h3><p>Your relieving letter has not been issued yet.</p></div>'; return; }
    content.innerHTML = renderRelievingLetter(r) + `<br><button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Print / Download PDF</button>`;
}

// ===================================================================
//  PAGE: COMPANY HOLIDAYS
// ===================================================================
async function pageHolidays() {
    pageTitle.textContent = 'Company Holidays';
    const year = new Date().getFullYear();
    const holidays = await apiGet(`/holidays?year=${year}`);
    const canManage = ['admin', 'hr'].includes(u.role);

    const typeColors = { national: '#ef4444', restricted: '#f59e0b', company: '#6366f1' };
    const typeIcons = { national: 'fa-flag', restricted: 'fa-star', company: 'fa-building' };
    const typeLabels = { national: 'National', restricted: 'Restricted', company: 'Company' };
    const now = new Date().toISOString().split('T')[0];

    const natCount = holidays.filter(h => h.type === 'national').length;
    const resCount = holidays.filter(h => h.type === 'restricted').length;
    const comCount = holidays.filter(h => h.type === 'company').length;
    const upcoming = holidays.filter(h => h.date >= now);
    const nextHoliday = upcoming[0];

    // Group by month
    const months = {};
    holidays.forEach(h => {
        const d = new Date(h.date + 'T00:00:00');
        const mKey = d.toLocaleString('en-IN', { month: 'long' });
        if (!months[mKey]) months[mKey] = { items: [], monthNum: d.getMonth() };
        months[mKey].items.push(h);
    });

    content.innerHTML = `
        <div class="hol-page">
            <!-- Stats Cards -->
            <div class="hol-stats-row">
                <div class="hol-stat-card" style="--accent:#ef4444">
                    <div class="hol-stat-icon"><i class="fas fa-flag"></i></div>
                    <div class="hol-stat-info"><span class="hol-stat-num">${natCount}</span><span class="hol-stat-label">National Holidays</span></div>
                </div>
                <div class="hol-stat-card" style="--accent:#f59e0b">
                    <div class="hol-stat-icon"><i class="fas fa-star"></i></div>
                    <div class="hol-stat-info"><span class="hol-stat-num">${resCount}</span><span class="hol-stat-label">Restricted Holidays</span></div>
                </div>
                <div class="hol-stat-card" style="--accent:#6366f1">
                    <div class="hol-stat-icon"><i class="fas fa-building"></i></div>
                    <div class="hol-stat-info"><span class="hol-stat-num">${comCount}</span><span class="hol-stat-label">Company Holidays</span></div>
                </div>
                <div class="hol-stat-card" style="--accent:#10b981">
                    <div class="hol-stat-icon"><i class="fas fa-calendar-day"></i></div>
                    <div class="hol-stat-info"><span class="hol-stat-num">${holidays.length}</span><span class="hol-stat-label">Total Holidays</span></div>
                </div>
            </div>

            ${nextHoliday ? `<div class="hol-next-card">
                <div class="hol-next-left">
                    <span class="hol-next-tag"><i class="fas fa-bell"></i> Next Holiday</span>
                    <h3>${esc(nextHoliday.name)}</h3>
                    <p>${formatDateLong(nextHoliday.date)} &bull; ${nextHoliday.day_of_week || ''}</p>
                </div>
                <div class="hol-next-right">
                    <span class="hol-countdown">${Math.ceil((new Date(nextHoliday.date + 'T00:00:00') - new Date()) / 86400000)}</span>
                    <span class="hol-countdown-label">days away</span>
                </div>
            </div>` : ''}

            <div class="hol-toolbar">
                <h3><i class="fas fa-calendar-star"></i> ${year} Holiday Calendar</h3>
                ${canManage ? `<button class="btn btn-primary" onclick="showAddHolidayModal()"><i class="fas fa-plus"></i> Add Holiday</button>` : ''}
            </div>

            <div class="hol-months-grid">
                ${Object.entries(months).map(([month, { items }]) => `
                    <div class="hol-month-card">
                        <div class="hol-month-header">${month}</div>
                        <div class="hol-month-body">
                            ${items.map(h => {
                                const d = new Date(h.date + 'T00:00:00');
                                const isPast = h.date < now;
                                const isToday = h.date === now;
                                return `<div class="hol-item ${isPast ? 'past' : ''} ${isToday ? 'today' : ''}">
                                    <div class="hol-item-date">
                                        <span class="hol-item-day">${d.getDate()}</span>
                                        <span class="hol-item-dow">${(h.day_of_week || '').substring(0, 3)}</span>
                                    </div>
                                    <div class="hol-item-details">
                                        <span class="hol-item-name">${esc(h.name)}</span>
                                        <span class="hol-item-type" style="--tc:${typeColors[h.type]}"><i class="fas ${typeIcons[h.type]}"></i> ${typeLabels[h.type]}</span>
                                    </div>
                                    ${canManage ? `<button class="btn-icon-del" onclick="deleteHoliday(${h.id})" title="Delete"><i class="fas fa-trash-alt"></i></button>` : ''}
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

window.showAddHolidayModal = () => {
    openModal('Add Holiday', `
        <div class="form-group"><label>Holiday Name *</label><input class="form-control" id="hol_name"></div>
        <div class="form-group"><label>Date *</label><input class="form-control" id="hol_date" type="date"></div>
        <div class="form-group"><label>Type</label><select class="form-control" id="hol_type">
            <option value="national">National Holiday</option>
            <option value="restricted">Restricted Holiday</option>
            <option value="company">Company Holiday</option>
        </select></div>
        <button class="btn btn-primary" onclick="addHoliday()" style="margin-top:12px;width:100%"><i class="fas fa-save"></i> Add Holiday</button>
    `);
};

window.addHoliday = async () => {
    try {
        await apiPost('/holidays', { name: $('#hol_name').value, date: $('#hol_date').value, type: $('#hol_type').value });
        toast('Holiday added'); closeModal(); pageHolidays();
    } catch (e) { toast(e.message, 'error'); }
};

window.deleteHoliday = async (id) => {
    if (!confirm('Delete this holiday?')) return;
    try {
        await api('/holidays/' + id, { method: 'DELETE' });
        toast('Holiday deleted'); pageHolidays();
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: TAX DECLARATION (Employee Self-Service)
// ===================================================================
async function pageMyTaxDeclaration() {
    pageTitle.textContent = 'Tax Declaration';
    const result = await apiGet('/my/tax-declaration');
    if (!result || !result.declaration) { content.innerHTML = '<div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><h3>No Profile</h3><p>Employee profile required. Contact HR.</p></div>'; return; }

    const decl = result.declaration;
    const items = result.items;
    const sections = await apiGet('/tax/sections');
    const isDraft = decl.status === 'draft';
    const isOld = decl.regime === 'old';

    // Build section-wise totals
    const sectionTotals = {};
    items.forEach(i => { sectionTotals[i.section] = (sectionTotals[i.section] || 0) + i.declared_amount; });

    let html = `
        <div class="tax-header">
            <div class="tax-header-info">
                <h3><i class="fas fa-file-invoice-dollar"></i> Income Tax Declaration — FY ${esc(decl.financial_year)}</h3>
                <p>Status: ${statusBadge(decl.status)} | Regime: <strong>${decl.regime === 'old' ? 'Old Regime' : 'New Regime (Default)'}</strong></p>
            </div>
            <div class="tax-header-total">
                <span>Total Exemptions Declared</span>
                <strong>${formatINR(decl.total_declared)}</strong>
            </div>
        </div>`;

    // Regime selector
    if (isDraft) {
        html += `<div class="tax-regime-selector">
            <div class="regime-info">
                <i class="fas fa-info-circle"></i>
                <div>
                    <strong>Choose Tax Regime</strong>
                    <p><strong>New Regime (Default FY 2024-25+)</strong>: Lower rates, minimal deductions (only Std. Deduction ₹75,000 + NPS employer).<br>
                    <strong>Old Regime</strong>: Higher rates but allows all deductions: 80C, 80D, HRA, 24(b), LTA, etc.</p>
                </div>
            </div>
            <div class="regime-toggle">
                <button class="btn ${!isOld ? 'btn-primary' : 'btn-secondary'}" onclick="switchRegime('new')">New Regime</button>
                <button class="btn ${isOld ? 'btn-primary' : 'btn-secondary'}" onclick="switchRegime('old')">Old Regime</button>
            </div>
        </div>`;
    }

    if (!isOld) {
        html += `<div class="tax-new-regime-note">
            <i class="fas fa-lightbulb"></i>
            <div>
                <h4>New Regime — Limited Deductions</h4>
                <p>Under the New Tax Regime, most exemptions are not available. You get:</p>
                <ul>
                    <li>Standard Deduction: ₹75,000 (auto-applied)</li>
                    <li>NPS Employer Contribution under 80CCD(2) (auto-applied)</li>
                    <li>EPF Contribution (auto-deducted from salary)</li>
                </ul>
                <p>Switch to <strong>Old Regime</strong> if you want to claim HRA, 80C, 80D, Sec 24(b), and other deductions.</p>
            </div>
        </div>`;
    } else {
        // Show all sections for Old Regime
        html += '<div class="tax-sections">';
        for (const [secKey, sec] of Object.entries(sections)) {
            const secItems = items.filter(i => i.section === secKey);
            const secTotal = sectionTotals[secKey] || 0;
            const isHRA = secKey === 'HRA';

            html += `<div class="tax-section-card">
                <div class="tax-section-header" onclick="toggleTaxSection('${secKey}')">
                    <div class="tax-section-title">
                        <i class="fas fa-chevron-right tax-chevron" id="chev_${secKey}"></i>
                        <h4>${esc(sec.name)}</h4>
                    </div>
                    <div class="tax-section-meta">
                        ${sec.maxLimit ? `<span class="tax-limit">Max: ${formatINR(sec.maxLimit)}</span>` : '<span class="tax-limit">No Limit</span>'}
                        <span class="tax-amount ${secTotal > 0 ? 'has-value' : ''}">${formatINR(secTotal)}</span>
                    </div>
                </div>
                <div class="tax-section-body" id="body_${secKey}" style="display:none">`;

            if (isHRA) {
                const hraItem = secItems.find(i => i.category === 'hra_rent');
                let hraData = {};
                try { hraData = hraItem ? JSON.parse(hraItem.description) : {}; } catch(e) {}
                html += `<div class="hra-form">
                    <p class="hra-info"><i class="fas fa-home"></i> HRA Exemption = MIN(Actual HRA, 50%/40% of Basic, Rent − 10% of Basic). <strong>Landlord PAN mandatory if annual rent > ₹1,00,000.</strong></p>
                    <div class="bgv-form-grid" style="margin-top:12px">
                        <div class="form-group"><label>Monthly Rent (₹) *</label><input class="form-control" id="hra_rent" type="number" value="${hraData.monthly_rent || ''}" ${!isDraft ? 'disabled' : ''}></div>
                        <div class="form-group"><label>Rental City *</label><input class="form-control" id="hra_city" value="${esc(hraData.rental_city || '')}" placeholder="e.g. Hyderabad" ${!isDraft ? 'disabled' : ''}></div>
                        <div class="form-group"><label>Landlord Name *</label><input class="form-control" id="hra_landlord" value="${esc(hraData.landlord_name || '')}" ${!isDraft ? 'disabled' : ''}></div>
                        <div class="form-group"><label>Landlord PAN</label><input class="form-control" id="hra_pan" maxlength="10" style="text-transform:uppercase" value="${esc(hraData.landlord_pan || '')}" placeholder="Required if rent > ₹1L/year" ${!isDraft ? 'disabled' : ''}></div>
                    </div>
                    ${isDraft ? `<button class="btn btn-primary btn-sm" onclick="saveHRA()" style="margin-top:8px"><i class="fas fa-save"></i> Calculate & Save HRA</button>` : ''}
                    ${hraItem ? `<div class="hra-result"><i class="fas fa-check-circle"></i> HRA Exemption Calculated: <strong>${formatINR(hraItem.declared_amount)}</strong>/year</div>` : ''}
                </div>`;
            } else {
                sec.categories.forEach(cat => {
                    const item = secItems.find(i => i.category === cat.id);
                    const amt = item ? item.declared_amount : 0;
                    html += `<div class="tax-item-row">
                        <div class="tax-item-info">
                            <span class="tax-item-name">${esc(cat.name)}</span>
                            ${cat.maxLimit ? `<span class="tax-item-limit">Max: ${formatINR(cat.maxLimit)}</span>` : ''}
                        </div>
                        <div class="tax-item-input">
                            <div class="tax-input-group">
                                <span>₹</span>
                                <input class="form-control" type="number" id="tax_${secKey}_${cat.id}" value="${amt || ''}" placeholder="0" ${!isDraft ? 'disabled' : ''} onchange="saveTaxItem('${secKey}', '${cat.id}', this.value)">
                            </div>
                            ${isDraft && item ? `<label class="tax-proof-label">
                                <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onchange="uploadTaxProof(${item.id}, this)" hidden>
                                <span class="btn btn-sm btn-secondary"><i class="fas fa-upload"></i> Proof</span>
                            </label>` : ''}
                            ${item && item.proof_name ? `<span class="tax-proof-done"><i class="fas fa-check-circle"></i> ${esc(item.proof_name)}</span>` : ''}
                        </div>
                    </div>`;
                });
            }
            html += '</div></div>';
        }
        html += '</div>';
    }

    // Action buttons
    if (isDraft) {
        html += `<div class="tax-actions">
            <button class="btn btn-success" onclick="submitTaxDeclaration()" style="flex:1"><i class="fas fa-paper-plane"></i> Submit Declaration for Review</button>
        </div>`;
    }
    if (decl.status === 'rejected') {
        html += `<div class="tax-rejection"><i class="fas fa-exclamation-triangle"></i> Rejection Reason: ${esc(decl.rejection_reason || 'Not specified')}</div>`;
    }

    content.innerHTML = html;
}

window.toggleTaxSection = (secKey) => {
    const body = document.getElementById(`body_${secKey}`);
    const chev = document.getElementById(`chev_${secKey}`);
    if (body.style.display === 'none') {
        body.style.display = 'block';
        chev.classList.replace('fa-chevron-right', 'fa-chevron-down');
    } else {
        body.style.display = 'none';
        chev.classList.replace('fa-chevron-down', 'fa-chevron-right');
    }
};

window.switchRegime = async (regime) => {
    try {
        await apiPut('/my/tax-declaration/regime', { regime });
        toast(`Switched to ${regime === 'old' ? 'Old' : 'New'} Regime`);
        pageMyTaxDeclaration();
    } catch (e) { toast(e.message, 'error'); }
};

window.saveTaxItem = async (section, category, value) => {
    try {
        await apiPost('/my/tax-declaration/item', { section, category, declared_amount: parseFloat(value) || 0 });
    } catch (e) { toast(e.message, 'error'); }
};

window.saveHRA = async () => {
    const rent = parseFloat($('#hra_rent').value);
    if (!rent || rent <= 0) return toast('Enter monthly rent', 'error');
    try {
        const result = await apiPost('/my/tax-declaration/hra', {
            monthly_rent: rent,
            landlord_name: $('#hra_landlord').value,
            landlord_pan: $('#hra_pan').value,
            rental_city: $('#hra_city').value
        });
        toast(`HRA exemption: ${formatINR(result.hra_exemption)}/year`);
        pageMyTaxDeclaration();
    } catch (e) { toast(e.message, 'error'); }
};

window.uploadTaxProof = async (itemId, input) => {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('proof', input.files[0]);
    try {
        const res = await fetch(`/api/my/tax-declaration/upload/${itemId}`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token() },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast('Proof uploaded');
        pageMyTaxDeclaration();
    } catch (e) { toast(e.message, 'error'); }
};

window.submitTaxDeclaration = async () => {
    if (!confirm('Submit your tax declaration? You cannot edit after submission.')) return;
    try {
        await apiPut('/my/tax-declaration/submit');
        toast('Tax declaration submitted!');
        pageMyTaxDeclaration();
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: TAX DECLARATIONS (Admin/HR/Accountant)
// ===================================================================
async function pageTaxDeclarationsAdmin() {
    pageTitle.textContent = 'Tax Declarations';
    const decls = await apiGet('/tax-declarations');

    content.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px">
            ${statCard('fa-file-invoice-dollar', 'blue', decls.length, 'Total Declarations')}
            ${statCard('fa-paper-plane', 'gold', decls.filter(d=>d.status==='submitted').length, 'Pending Review')}
            ${statCard('fa-check-circle', 'green', decls.filter(d=>d.status==='approved').length, 'Approved')}
            ${statCard('fa-indian-rupee-sign', 'purple', formatINR(decls.reduce((s,d) => s + (d.total_approved || 0), 0)), 'Total Exemptions')}
        </div>
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-file-invoice-dollar"></i> Employee Tax Declarations</h3>
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Employee</th><th>Code</th><th>Department</th><th>Regime</th><th>Declared</th><th>Approved</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                    ${decls.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--p-text-muted)">No tax declarations yet</td></tr>' : decls.map(d => `<tr>
                        <td><strong>${esc(d.employee_name)}</strong></td>
                        <td>${esc(d.employee_code)}</td>
                        <td>${esc(d.department)}</td>
                        <td><span class="badge-status ${d.regime}">${d.regime === 'old' ? 'Old' : 'New'}</span></td>
                        <td>${formatINR(d.total_declared)}</td>
                        <td>${formatINR(d.total_approved)}</td>
                        <td>${statusBadge(d.status)}</td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewTaxDeclaration(${d.id})"><i class="fas fa-eye"></i></button>
                            ${d.status === 'submitted' ? `<button class="btn btn-sm btn-success" onclick="approveTaxDecl(${d.id})"><i class="fas fa-check"></i></button><button class="btn btn-sm btn-danger" onclick="rejectTaxDecl(${d.id})"><i class="fas fa-times"></i></button>` : ''}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.viewTaxDeclaration = async (id) => {
    try {
        const { declaration: decl, items } = await apiGet(`/tax-declarations/${id}`);
        const sections = await apiGet('/tax/sections');
        const row = (l, v) => `<tr><td style="color:var(--p-text-muted)">${l}</td><td><strong>${esc(v || '—')}</strong></td></tr>`;
        let html = `<div class="bgv-review">
            <div class="bgv-review-header">
                <h3>${esc(decl.employee_name)} (${esc(decl.employee_code)})</h3>
                <p>${esc(decl.designation)} | ${esc(decl.department)} | CTC: ${formatINR(decl.annual_ctc)}</p>
                <p>FY: ${esc(decl.financial_year)} | Regime: <strong>${decl.regime === 'old' ? 'Old' : 'New'}</strong> | ${statusBadge(decl.status)}</p>
            </div>`;
        for (const [secKey, sec] of Object.entries(sections)) {
            const secItems = items.filter(i => i.section === secKey);
            if (secItems.length === 0) continue;
            html += `<div class="bgv-section"><h4>${esc(sec.name)}</h4><table class="bgv-table">`;
            secItems.forEach(item => {
                const cat = sec.categories.find(c => c.id === item.category);
                html += row(cat ? cat.name : item.category, formatINR(item.declared_amount) + (item.proof_name ? ` <a href="/api/uploads/${item.proof_file}" target="_blank" class="doc-link" style="margin-left:8px"><i class="fas fa-file"></i> ${esc(item.proof_name)}</a>` : ''));
            });
            html += '</table></div>';
        }
        html += `<div class="bgv-section"><h4>Summary</h4><table class="bgv-table">
            ${row('Total Declared', formatINR(decl.total_declared))}
            ${row('Total Approved', formatINR(decl.total_approved))}
        </table></div></div>`;

        if (decl.status === 'submitted') {
            html += `<div style="display:flex;gap:12px;margin-top:16px">
                <button class="btn btn-success" onclick="approveTaxDecl(${id})" style="flex:1"><i class="fas fa-check"></i> Approve</button>
                <button class="btn btn-danger" onclick="rejectTaxDecl(${id})" style="flex:1"><i class="fas fa-times"></i> Reject</button>
            </div>`;
        }
        openModal('Tax Declaration Review', html);
    } catch (e) { toast(e.message, 'error'); }
};

window.approveTaxDecl = async (id) => {
    try { await apiPut(`/tax-declarations/${id}/approve`); toast('Tax declaration approved'); closeModal(); pageTaxDeclarationsAdmin(); } catch (e) { toast(e.message, 'error'); }
};

window.rejectTaxDecl = async (id) => {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    try { await apiPut(`/tax-declarations/${id}/reject`, { reason }); toast('Declaration rejected'); closeModal(); pageTaxDeclarationsAdmin(); } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: BGV MANAGEMENT
// ===================================================================
async function pageBGV() {
    pageTitle.textContent = 'Background Verification';
    const invites = await apiGet('/bgv/invites');
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-user-shield"></i> BGV Invites (${invites.length})</h3>
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Candidate</th><th>Email</th><th>Offer Ref</th><th>Designation</th><th>Status</th><th>Sent On</th><th>Actions</th></tr></thead>
                <tbody>
                    ${invites.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--p-text-muted)">No BGV invites yet. Release an offer letter and click BGV to send an invite.</td></tr>' : invites.map(inv => `<tr>
                        <td><strong>${esc(inv.candidate_name)}</strong></td>
                        <td>${esc(inv.candidate_email)}</td>
                        <td>${esc(inv.reference_no)}</td>
                        <td>${esc(inv.designation)}</td>
                        <td>${statusBadge(inv.status)}</td>
                        <td>${formatDate(inv.created_at)}</td>
                        <td>
                            ${inv.status === 'submitted' ? `
                                <button class="btn btn-sm btn-secondary" onclick="viewBGVSubmission(${inv.id})"><i class="fas fa-eye"></i> Review</button>
                                <button class="btn btn-sm btn-success" onclick="verifyBGV(${inv.id})"><i class="fas fa-check"></i></button>
                                <button class="btn btn-sm btn-danger" onclick="rejectBGV(${inv.id})"><i class="fas fa-times"></i></button>
                            ` : ''}
                            ${inv.status === 'verified' ? `<button class="btn btn-sm btn-secondary" onclick="viewBGVSubmission(${inv.id})"><i class="fas fa-eye"></i> View</button>` : ''}
                            ${inv.status === 'pending' || inv.status === 'in_progress' ? `<span style="color:var(--p-text-muted);font-size:0.82rem">Awaiting candidate</span>` : ''}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showBGVInviteModal = async (offerId, candidateName, candidateEmail) => {
    // Check if BGV already exists
    try {
        const existing = await apiGet(`/bgv/by-offer/${offerId}`);
        if (existing) {
            toast(`BGV already sent to ${existing.candidate_email}. Status: ${existing.status}`, 'info');
            return;
        }
    } catch (e) { /* no existing invite */ }

    openModal('Send BGV Invite', `
        <div class="bgv-invite-form">
            <div class="bgv-invite-info">
                <i class="fas fa-user-shield"></i>
                <p>Send a Background Verification form to <strong>${esc(candidateName)}</strong>. The candidate will receive login credentials to fill in their personal details, education, address proofs, and more.</p>
            </div>
            <div class="form-group">
                <label>Candidate Email *</label>
                <input class="form-control" id="bgv_email" type="email" value="${esc(candidateEmail)}" placeholder="candidate@gmail.com">
            </div>
            <button class="btn btn-primary" onclick="sendBGVInvite(${offerId})" style="margin-top:12px; width:100%">
                <i class="fas fa-paper-plane"></i> Create BGV Invite
            </button>
        </div>
    `);
};

window.sendBGVInvite = async (offerId) => {
    const email = $('#bgv_email').value.trim();
    if (!email) return toast('Candidate email is required', 'error');

    try {
        const result = await apiPost('/bgv/invite', { offer_id: offerId, candidate_email: email });
        closeModal();
        openModal('BGV Invite Created', `
            <div class="bgv-credentials">
                <div class="bgv-credentials-header">
                    <i class="fas fa-check-circle" style="color:#22c55e;font-size:2rem"></i>
                    <h3>BGV Invite Sent Successfully!</h3>
                </div>
                <p style="color:var(--p-text-muted)">Share these credentials with <strong>${esc(result.candidate_name)}</strong>:</p>
                <div class="credential-box">
                    <div class="credential-row">
                        <span class="credential-label"><i class="fas fa-link"></i> BGV Link</span>
                        <code class="credential-value">${window.location.origin}${result.bgv_link}</code>
                    </div>
                    <div class="credential-row">
                        <span class="credential-label"><i class="fas fa-envelope"></i> Login Email</span>
                        <code class="credential-value">${esc(result.candidate_email)}</code>
                    </div>
                    <div class="credential-row">
                        <span class="credential-label"><i class="fas fa-key"></i> Temp Password</span>
                        <code class="credential-value">${esc(result.temp_password)}</code>
                    </div>
                </div>
                <p style="color:#f59e0b;font-size:0.85rem;margin-top:12px"><i class="fas fa-exclamation-triangle"></i> Copy these credentials now. The password will not be shown again.</p>
                <button class="btn btn-secondary" onclick="copyBGVCredentials('${esc(result.candidate_email)}', '${esc(result.temp_password)}', '${window.location.origin}${result.bgv_link}')" style="margin-top:8px"><i class="fas fa-copy"></i> Copy All</button>
            </div>
        `);
    } catch (e) { toast(e.message, 'error'); }
};

window.copyBGVCredentials = (email, pwd, link) => {
    const text = `BGV Verification Link:
${link}

Login Email: ${email}
Temporary Password: ${pwd}

Please complete your Background Verification form using the link above.`;
    navigator.clipboard.writeText(text).then(() => toast('Credentials copied!'));
};

window.viewBGVSubmission = async (inviteId) => {
    try {
        const { invite, submissions, documents } = await apiGet(`/bgv/invites/${inviteId}`);
        const getSection = (name) => {
            const s = submissions.find(x => x.section === name);
            return s ? JSON.parse(s.data) : null;
        };
        const getDocs = (section) => documents.filter(d => d.section === section);

        const personal = getSection('personal');
        const emergency = getSection('emergency');
        const family = getSection('family');
        const address = getSection('address');
        const edu10 = getSection('edu_10th');
        const edu12 = getSection('edu_12th');
        const eduGrad = getSection('edu_graduation');
        const eduPG = getSection('edu_pg');
        const declaration = getSection('declaration');
        const proofDocs = getDocs('address_proofs');

        const row = (label, val) => val ? `<tr><td style="color:var(--p-text-muted);width:35%">${label}</td><td><strong>${esc(val)}</strong></td></tr>` : '';
        const docLink = (doc) => `<a href="/api/uploads/${doc.file_path}" target="_blank" class="doc-link"><i class="fas fa-file"></i> ${esc(doc.original_name || doc.doc_type)}</a>`;

        let html = `<div class="bgv-review">
            <div class="bgv-review-header">
                <h3>${esc(invite.candidate_name)}</h3>
                <p>${esc(invite.candidate_email)} | ${esc(invite.reference_no)} | ${esc(invite.designation)}</p>
                <span class="badge-status ${invite.status}">${invite.status}</span>
            </div>`;

        if (personal) {
            html += `<div class="bgv-section"><h4><i class="fas fa-user"></i> Personal Details</h4><table class="bgv-table">
                ${row('Full Name', personal.full_name)}${row('Date of Birth', personal.dob)}${row('Gender', personal.gender)}
                ${row('Blood Group', personal.blood_group)}${row('Marital Status', personal.marital_status)}
                ${row('Nationality', personal.nationality)}${row('Aadhar Number', personal.aadhar_no)}
                ${row('PAN Number', personal.pan_no)}${row('Personal Email', personal.personal_email)}
                ${row('Personal Phone', personal.personal_phone)}
            </table></div>`;
        }
        if (emergency) {
            html += `<div class="bgv-section"><h4><i class="fas fa-phone-alt"></i> Emergency Contact</h4><table class="bgv-table">
                ${row('Contact Name', emergency.name)}${row('Relationship', emergency.relationship)}
                ${row('Phone', emergency.phone)}${row('Alt. Phone', emergency.alt_phone)}
            </table></div>`;
        }
        if (family) {
            html += `<div class="bgv-section"><h4><i class="fas fa-users"></i> Family Details</h4><table class="bgv-table">
                ${row("Father's Name", family.father_name)}${row("Father's Occupation", family.father_occupation)}
                ${row("Mother's Name", family.mother_name)}${row("Mother's Occupation", family.mother_occupation)}
                ${row("Spouse Name", family.spouse_name)}${row("No. of Dependents", family.dependents)}
            </table></div>`;
        }
        if (address) {
            html += `<div class="bgv-section"><h4><i class="fas fa-map-marker-alt"></i> Address Details</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div><h5 style="color:var(--p-accent)">Current Address</h5><table class="bgv-table">
                        ${row('Address', address.current_address)}${row('City', address.current_city)}
                        ${row('State', address.current_state)}${row('Pincode', address.current_pincode)}
                    </table></div>
                    <div><h5 style="color:var(--p-accent)">Permanent Address</h5><table class="bgv-table">
                        ${row('Address', address.permanent_address)}${row('City', address.permanent_city)}
                        ${row('State', address.permanent_state)}${row('Pincode', address.permanent_pincode)}
                    </table></div>
                </div>
            </div>`;
        }

        const eduSection = (title, data, docs) => {
            if (!data) return '';
            let h = `<div class="bgv-section"><h4><i class="fas fa-graduation-cap"></i> ${title}</h4><table class="bgv-table">
                ${row('Institution', data.institution)}${row('Board/University', data.board)}
                ${row('Year of Passing', data.year)}${row('Percentage/CGPA', data.percentage)}
                ${row('Degree/Stream', data.degree)}
            </table>`;
            if (docs.length) h += `<div class="bgv-docs">${docs.map(docLink).join(' ')}</div>`;
            return h + '</div>';
        };
        html += eduSection('10th Standard', edu10, getDocs('edu_10th'));
        html += eduSection('12th Standard', edu12, getDocs('edu_12th'));
        html += eduSection('Graduation', eduGrad, getDocs('edu_graduation'));
        html += eduSection('Post Graduation', eduPG, getDocs('edu_pg'));

        if (proofDocs.length) {
            html += `<div class="bgv-section"><h4><i class="fas fa-id-card"></i> Address Proofs (${proofDocs.length})</h4><div class="bgv-docs">${proofDocs.map(docLink).join(' ')}</div></div>`;
        }

        if (declaration) {
            html += `<div class="bgv-section"><h4><i class="fas fa-file-signature"></i> Declaration</h4>
                <p style="color:${declaration.agreed ? '#22c55e' : '#ef4444'}">
                    <i class="fas fa-${declaration.agreed ? 'check-circle' : 'times-circle'}"></i>
                    ${declaration.agreed ? 'Candidate has agreed to the declaration' : 'Declaration not agreed'}
                </p>
                ${declaration.submitted_at ? `<p style="color:var(--p-text-muted);font-size:.85rem">Submitted on: ${formatDate(declaration.submitted_at)}</p>` : ''}
            </div>`;
        }

        html += '</div>';

        if (invite.status === 'submitted') {
            html += `<div style="display:flex;gap:12px;margin-top:16px">
                <button class="btn btn-success" onclick="verifyBGV(${inviteId})" style="flex:1"><i class="fas fa-check"></i> Verify BGV</button>
                <button class="btn btn-danger" onclick="rejectBGV(${inviteId})" style="flex:1"><i class="fas fa-times"></i> Reject BGV</button>
            </div>`;
        }

        openModal('BGV Submission Review', html);
    } catch (e) { toast(e.message, 'error'); }
};

window.verifyBGV = async (id) => {
    try { await apiPut(`/bgv/invites/${id}/verify`); toast('BGV verified!'); closeModal(); pageBGV(); } catch (e) { toast(e.message, 'error'); }
};
window.rejectBGV = async (id) => {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    try { await apiPut(`/bgv/invites/${id}/reject`, { reason }); toast('BGV rejected'); closeModal(); pageBGV(); } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: FEED / CHAT
// ===================================================================
async function pageFeed() {
    pageTitle.textContent = 'Feed / Chat';
    const posts = await apiGet('/feed');
    let html = `
        <div class="feed-composer">
            <div class="feed-composer-avatar">${(u.name || 'U')[0].toUpperCase()}</div>
            <div class="feed-composer-body">
                <textarea class="form-control" id="feed_content" rows="3" placeholder="Share something with the team..."></textarea>
                <div class="feed-composer-actions">
                    <select class="form-control" id="feed_type" style="width:auto">
                        <option value="general">💬 General</option>
                        ${['admin','hr'].includes(u.role) ? '<option value="announcement">📢 Announcement</option>' : ''}
                        <option value="achievement">🏆 Achievement</option>
                    </select>
                    <button class="btn btn-primary" onclick="createFeedPost()"><i class="fas fa-paper-plane"></i> Post</button>
                </div>
            </div>
        </div>
        <div class="feed-list">`;
    if (posts.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-comments"></i><h3>No Posts Yet</h3><p>Be the first to share something!</p></div>';
    } else {
        posts.forEach(p => {
            const typeIcons = { general: '💬', announcement: '📢', achievement: '🏆', birthday: '🎂', anniversary: '🎉' };
            const isOwner = p.user_id === u.id;
            html += `
            <div class="feed-card ${p.type === 'announcement' ? 'announcement' : ''}">
                <div class="feed-card-header">
                    <div class="feed-avatar">${(p.user_name || 'U')[0].toUpperCase()}</div>
                    <div class="feed-meta">
                        <strong>${esc(p.user_name)}</strong>
                        <span>${typeIcons[p.type] || '💬'} ${p.type} · ${formatDate(p.created_at)}</span>
                    </div>
                    ${isOwner ? `<button class="btn btn-sm btn-danger" onclick="deleteFeedPost(${p.id})" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <div class="feed-card-body"><p>${esc(p.content).replace(/\n/g, '<br>')}</p></div>
                <div class="feed-card-actions">
                    <button class="btn btn-sm ${p.user_liked ? 'btn-primary' : 'btn-secondary'}" onclick="toggleFeedLike(${p.id})">
                        <i class="fas fa-heart"></i> ${p.like_count || 0}
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="toggleFeedComments(${p.id})">
                        <i class="fas fa-comment"></i> ${p.comment_count || 0}
                    </button>
                </div>
                <div class="feed-comments" id="feed_comments_${p.id}" style="display:none"></div>
            </div>`;
        });
    }
    html += '</div>';
    content.innerHTML = html;
}

window.createFeedPost = async () => {
    const c = $('#feed_content')?.value?.trim();
    if (!c) return toast('Write something first', 'error');
    try {
        await apiPost('/feed', { content: c, type: $('#feed_type').value });
        toast('Posted!'); pageFeed();
    } catch (e) { toast(e.message, 'error'); }
};

window.deleteFeedPost = async (id) => {
    if (!confirm('Delete this post?')) return;
    try { await api(`/feed/${id}`, { method: 'DELETE' }); toast('Post deleted'); pageFeed(); } catch (e) { toast(e.message, 'error'); }
};

window.toggleFeedLike = async (id) => {
    try { await apiPost(`/feed/${id}/like`); pageFeed(); } catch (e) { toast(e.message, 'error'); }
};

window.toggleFeedComments = async (id) => {
    const div = document.getElementById(`feed_comments_${id}`);
    if (div.style.display !== 'none') { div.style.display = 'none'; return; }
    div.style.display = 'block';
    try {
        const comments = await apiGet(`/feed/${id}/comments`);
        div.innerHTML = `
            ${comments.map(c => `<div class="feed-comment">
                <strong>${esc(c.user_name)}</strong> <span class="feed-comment-date">${formatDate(c.created_at)}</span>
                <p>${esc(c.content)}</p>
            </div>`).join('')}
            <div class="feed-comment-form">
                <input class="form-control" id="fc_${id}" placeholder="Write a comment...">
                <button class="btn btn-sm btn-primary" onclick="addFeedComment(${id})"><i class="fas fa-paper-plane"></i></button>
            </div>`;
    } catch (e) { div.innerHTML = '<p>Error loading comments</p>'; }
};

window.addFeedComment = async (postId) => {
    const input = $(`#fc_${postId}`);
    if (!input?.value?.trim()) return;
    try {
        await apiPost(`/feed/${postId}/comments`, { content: input.value.trim() });
        toggleFeedComments(postId);
        toggleFeedComments(postId);
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: RESIGNATIONS (Admin/HR/Manager)
// ===================================================================
async function pageResignations() {
    pageTitle.textContent = 'Resignations';
    const resignations = await apiGet('/resignations');
    const statusColors = { submitted: 'gold', manager_approved: 'blue', hr_approved: 'blue', finance_approved: 'blue', completed: 'green', withdrawn: 'red' };
    content.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px">
            ${statCard('fa-person-walking-arrow-right', 'blue', resignations.length, 'Total Resignations')}
            ${statCard('fa-clock', 'gold', resignations.filter(r => r.status !== 'completed' && r.status !== 'withdrawn').length, 'Pending Clearance')}
            ${statCard('fa-circle-check', 'green', resignations.filter(r => r.status === 'completed').length, 'Completed')}
        </div>
        <div class="table-card">
            <div class="table-header"><h3><i class="fas fa-person-walking-arrow-right"></i> Resignations (${resignations.length})</h3></div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Employee</th><th>Resignation Date</th><th>Last Working Day</th><th>Notice (Days)</th><th>Status</th><th>Clearance</th><th>Actions</th></tr></thead>
                <tbody>
                    ${resignations.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--p-text-muted)">No resignations</td></tr>' : resignations.map(r => `<tr>
                        <td><strong>${esc(r.employee_name || 'Employee #'+r.employee_id)}</strong></td>
                        <td>${formatDate(r.resignation_date)}</td>
                        <td>${formatDate(r.last_working_day)}</td>
                        <td>${r.notice_period_days}</td>
                        <td>${statusBadge(r.status)}</td>
                        <td>
                            <span class="clearance-dot ${r.manager_approval ? 'done' : ''}" title="Manager">M</span>
                            <span class="clearance-dot ${r.hr_approval ? 'done' : ''}" title="HR">H</span>
                            <span class="clearance-dot ${r.finance_approval ? 'done' : ''}" title="Finance">F</span>
                            <span class="clearance-dot ${r.admin_approval ? 'done' : ''}" title="Admin">A</span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="viewResignation(${r.id})"><i class="fas fa-eye"></i></button>
                            ${canApproveResignation(r) ? `<button class="btn btn-sm btn-success" onclick="approveResignation(${r.id})"><i class="fas fa-check"></i></button>` : ''}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

function canApproveResignation(r) {
    if (r.status === 'completed' || r.status === 'withdrawn') return false;
    if (u.role === 'manager' && !r.manager_approval) return true;
    if (u.role === 'hr' && !r.hr_approval) return true;
    if (u.role === 'accountant' && !r.finance_approval) return true;
    if (u.role === 'admin') return !r.manager_approval || !r.hr_approval || !r.finance_approval || !r.admin_approval;
    return false;
}

window.viewResignation = async (id) => {
    const resignations = await apiGet('/resignations');
    const r = resignations.find(x => x.id === id);
    if (!r) return;
    openModal('Resignation Details', `
        <div class="resignation-detail">
            <div class="form-grid">
                ${infoRow('Employee', r.employee_name || 'Employee #'+r.employee_id)}
                ${infoRow('Resignation Date', formatDate(r.resignation_date))}
                ${infoRow('Last Working Day', formatDate(r.last_working_day))}
                ${infoRow('Notice Period', r.notice_period_days + ' days')}
                ${infoRow('Reason', r.reason)}
                ${infoRow('Personal Email', r.personal_email)}
                ${infoRow('Status', r.status)}
            </div>
            <h4 style="margin:16px 0 8px">Exit Clearance</h4>
            <div class="clearance-tracker">
                <div class="clearance-step ${r.manager_approval ? 'done' : 'pending'}">
                    <i class="fas ${r.manager_approval ? 'fa-check-circle' : 'fa-clock'}"></i>
                    <span>Manager</span>
                    ${r.manager_approved_at ? '<small>'+formatDate(r.manager_approved_at)+'</small>' : ''}
                </div>
                <div class="clearance-step ${r.hr_approval ? 'done' : 'pending'}">
                    <i class="fas ${r.hr_approval ? 'fa-check-circle' : 'fa-clock'}"></i>
                    <span>HR</span>
                    ${r.hr_approved_at ? '<small>'+formatDate(r.hr_approved_at)+'</small>' : ''}
                </div>
                <div class="clearance-step ${r.finance_approval ? 'done' : 'pending'}">
                    <i class="fas ${r.finance_approval ? 'fa-check-circle' : 'fa-clock'}"></i>
                    <span>Finance</span>
                    ${r.finance_approved_at ? '<small>'+formatDate(r.finance_approved_at)+'</small>' : ''}
                </div>
                <div class="clearance-step ${r.admin_approval ? 'done' : 'pending'}">
                    <i class="fas ${r.admin_approval ? 'fa-check-circle' : 'fa-clock'}"></i>
                    <span>Admin</span>
                    ${r.admin_approved_at ? '<small>'+formatDate(r.admin_approved_at)+'</small>' : ''}
                </div>
            </div>
            <div class="form-grid" style="margin-top:12px">
                ${infoRow('Assets Returned', r.assets_returned ? 'Yes' : 'No')}
                ${infoRow('Knowledge Transfer', r.knowledge_transfer_done ? 'Yes' : 'No')}
                ${infoRow('Exit Interview', r.exit_interview_done ? 'Yes' : 'No')}
            </div>
            ${canApproveResignation(r) ? `
                <h4 style="margin:16px 0 8px">Approve Clearance</h4>
                <div class="form-grid">
                    <div class="form-group"><label><input type="checkbox" id="res_assets" ${r.assets_returned?'checked':''}> Assets Returned</label></div>
                    <div class="form-group"><label><input type="checkbox" id="res_kt" ${r.knowledge_transfer_done?'checked':''}> Knowledge Transfer Done</label></div>
                    <div class="form-group"><label><input type="checkbox" id="res_exit" ${r.exit_interview_done?'checked':''}> Exit Interview Completed</label></div>
                    <div class="form-group full-width"><label>Remarks</label><textarea class="form-control" id="res_remarks" rows="2">${esc(r.remarks||'')}</textarea></div>
                </div>
                <button class="btn btn-success" onclick="approveResignation(${r.id})" style="margin-top:8px;width:100%"><i class="fas fa-check"></i> Approve My Clearance</button>
            ` : ''}
        </div>
    `);
};

window.approveResignation = async (id) => {
    const deptMap = { manager: 'manager', hr: 'hr', accountant: 'finance', admin: 'admin' };
    const dept = deptMap[u.role];
    if (!dept) return toast('You cannot approve', 'error');
    try {
        await apiPut(`/resignations/${id}/approve/${dept}`);
        toast('Clearance approved');
        closeModal();
        if (u.role === 'employee') pageMyResignation(); else pageResignations();
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: MY RESIGNATION (Employee self-service)
// ===================================================================
async function pageMyResignation() {
    pageTitle.textContent = 'My Resignation';
    const resignations = await apiGet('/resignations');
    const myRes = resignations.length > 0 ? resignations[0] : null;

    if (!myRes) {
        content.innerHTML = `
            <div class="table-card" style="padding:24px;max-width:600px;margin:0 auto">
                <h3 style="margin-bottom:16px"><i class="fas fa-person-walking-arrow-right"></i> Submit Resignation</h3>
                <p style="color:var(--p-text-muted);margin-bottom:16px">A 90-day notice period will be calculated automatically. Please ensure you discuss with your manager before submitting.</p>
                <div class="form-group"><label>Reason for Resignation *</label><textarea class="form-control" id="res_reason" rows="4" placeholder="Please provide your reason..."></textarea></div>
                <div class="form-group"><label>Personal Email *</label><input class="form-control" id="res_email" type="email" placeholder="your.personal@email.com"></div>
                <button class="btn btn-danger" onclick="submitResignation()" style="width:100%;margin-top:8px"><i class="fas fa-paper-plane"></i> Submit Resignation</button>
            </div>`;
    } else {
        content.innerHTML = `
            <div class="table-card" style="padding:24px;max-width:700px;margin:0 auto">
                <h3 style="margin-bottom:16px"><i class="fas fa-person-walking-arrow-right"></i> Resignation Status</h3>
                <div class="form-grid">
                    ${infoRow('Resignation Date', formatDate(myRes.resignation_date))}
                    ${infoRow('Last Working Day', formatDate(myRes.last_working_day))}
                    ${infoRow('Notice Period', myRes.notice_period_days + ' days')}
                    ${infoRow('Status', myRes.status.replace(/_/g, ' '))}
                    ${infoRow('Reason', myRes.reason)}
                </div>
                <h4 style="margin:20px 0 12px">Exit Clearance Progress</h4>
                <div class="clearance-tracker">
                    <div class="clearance-step ${myRes.manager_approval ? 'done' : 'pending'}">
                        <i class="fas ${myRes.manager_approval ? 'fa-check-circle' : 'fa-clock'}"></i>
                        <span>Manager</span>
                    </div>
                    <div class="clearance-step ${myRes.hr_approval ? 'done' : 'pending'}">
                        <i class="fas ${myRes.hr_approval ? 'fa-check-circle' : 'fa-clock'}"></i>
                        <span>HR</span>
                    </div>
                    <div class="clearance-step ${myRes.finance_approval ? 'done' : 'pending'}">
                        <i class="fas ${myRes.finance_approval ? 'fa-check-circle' : 'fa-clock'}"></i>
                        <span>Finance</span>
                    </div>
                    <div class="clearance-step ${myRes.admin_approval ? 'done' : 'pending'}">
                        <i class="fas ${myRes.admin_approval ? 'fa-check-circle' : 'fa-clock'}"></i>
                        <span>Admin</span>
                    </div>
                </div>
                ${myRes.status !== 'completed' && myRes.status !== 'withdrawn' ? `
                    <button class="btn btn-secondary" onclick="withdrawResignation(${myRes.id})" style="margin-top:16px"><i class="fas fa-rotate-left"></i> Withdraw Resignation</button>
                ` : ''}
            </div>`;
    }
}

window.submitResignation = async () => {
    const reason = $('#res_reason')?.value?.trim();
    const email = $('#res_email')?.value?.trim();
    if (!reason) return toast('Please provide a reason', 'error');
    if (!email) return toast('Personal email is required', 'error');
    if (!confirm('Are you sure you want to submit your resignation? A 90-day notice period will apply.')) return;
    try {
        await apiPost('/resignations', { reason, personal_email: email });
        toast('Resignation submitted');
        pageMyResignation();
    } catch (e) { toast(e.message, 'error'); }
};

window.withdrawResignation = async (id) => {
    if (!confirm('Withdraw your resignation?')) return;
    try {
        await apiPut(`/resignations/${id}/withdraw`);
        toast('Resignation withdrawn');
        pageMyResignation();
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: TRAINING MODULES (Admin/HR)
// ===================================================================
async function pageTraining() {
    pageTitle.textContent = 'Training Modules';
    const modules = await apiGet('/training/modules');
    const assignments = await apiGet('/training/assignments');
    const emps = await apiGet('/employees');
    const activeEmps = emps.filter(e => e.status === 'active');

    content.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px">
            ${statCard('fa-graduation-cap', 'blue', modules.length, 'Total Modules')}
            ${statCard('fa-book-open', 'green', modules.filter(m => m.is_mandatory).length, 'Mandatory')}
            ${statCard('fa-users', 'gold', assignments.length, 'Total Assignments')}
            ${statCard('fa-check-circle', 'purple', assignments.filter(a => a.status === 'completed').length, 'Completed')}
        </div>
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-graduation-cap"></i> Training Modules</h3>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-secondary" onclick="assignAllNewTraining()"><i class="fas fa-users"></i> Assign All to New Joiners</button>
                </div>
            </div>
            <div class="training-grid">
                ${modules.map(m => `
                    <div class="training-card">
                        <div class="training-card-header">
                            <div class="training-type-badge ${m.type}">${m.type}</div>
                            ${m.is_mandatory ? '<span class="badge-status red">Mandatory</span>' : ''}
                        </div>
                        <h4>${esc(m.title)}</h4>
                        <p>${esc(m.description || '')}</p>
                        <div class="training-card-meta">
                            <span><i class="fas fa-${m.content_type === 'video' ? 'play-circle' : 'images'}"></i> ${m.content_type}</span>
                            <span><i class="fas fa-clock"></i> ${m.duration_minutes} min</span>
                            ${m.passing_score ? `<span><i class="fas fa-trophy"></i> Pass: ${m.passing_score}%</span>` : ''}
                        </div>
                        <div class="training-card-actions">
                            <button class="btn btn-sm btn-secondary" onclick="previewTrainingModule(${m.id})"><i class="fas fa-eye"></i> Preview</button>
                            <button class="btn btn-sm btn-primary" onclick="showAssignTrainingModal(${m.id}, '${esc(m.title)}')"><i class="fas fa-user-plus"></i> Assign</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="table-card" style="margin-top:20px">
            <div class="table-header"><h3><i class="fas fa-clipboard-list"></i> Assignment Status</h3></div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Employee</th><th>Module</th><th>Status</th><th>Due Date</th><th>Completed</th><th>Score</th></tr></thead>
                <tbody>
                    ${assignments.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--p-text-muted)">No assignments yet</td></tr>' : assignments.map(a => `<tr>
                        <td><strong>${esc(a.employee_name || 'Employee')}</strong></td>
                        <td>${esc(a.module_title || 'Module')}</td>
                        <td>${statusBadge(a.status)}</td>
                        <td>${formatDate(a.due_date)}</td>
                        <td>${a.completed_at ? formatDate(a.completed_at) : '—'}</td>
                        <td>${a.score !== null ? a.score + '%' : '—'}</td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showAssignTrainingModal = async (moduleId, title) => {
    const emps = await apiGet('/employees');
    const activeEmps = emps.filter(e => e.status === 'active');
    openModal('Assign Training — ' + title, `
        <div class="form-group"><label>Employee *</label><select class="form-control" id="ta_emp">
            <option value="">Select Employee</option>
            ${activeEmps.map(e => `<option value="${e.id}">${esc(e.name)} (${esc(e.employee_code)})</option>`).join('')}
        </select></div>
        <div class="form-group"><label>Due Date</label><input class="form-control" id="ta_due" type="date"></div>
        <button class="btn btn-primary" onclick="assignTraining(${moduleId})" style="margin-top:8px"><i class="fas fa-user-plus"></i> Assign</button>
    `);
};

window.assignTraining = async (moduleId) => {
    const empId = parseInt($('#ta_emp').value);
    if (!empId) return toast('Select an employee', 'error');
    try {
        await apiPost('/training/assign', { employee_id: empId, module_id: moduleId, due_date: $('#ta_due').value || null });
        toast('Training assigned'); closeModal(); pageTraining();
    } catch (e) { toast(e.message, 'error'); }
};

window.assignAllNewTraining = async () => {
    if (!confirm('Assign all mandatory modules to employees without assignments?')) return;
    try {
        const result = await apiPost('/training/assign-all-new');
        toast(result.message || 'Assigned'); pageTraining();
    } catch (e) { toast(e.message, 'error'); }
};

window.previewTrainingModule = async (id) => {
    const modules = await apiGet('/training/modules');
    const m = modules.find(x => x.id === id);
    if (!m) return;
    let slides = [];
    try { slides = m.slides ? JSON.parse(m.slides) : []; } catch(e) {}

    if (m.content_type === 'video' && m.video_url) {
        openModal(m.title, `<div class="training-video"><video controls style="width:100%;max-height:500px"><source src="${esc(m.video_url)}"></video></div>`);
        return;
    }
    if (slides.length === 0) { openModal(m.title, '<p>No content available</p>'); return; }

    let html = `<div class="slide-viewer" id="slideViewer">
        <div class="slide-content" id="slideContent"></div>
        <div class="slide-controls">
            <button class="btn btn-secondary" onclick="prevSlide()"><i class="fas fa-chevron-left"></i> Prev</button>
            <span id="slideCounter">1 / ${slides.length}</span>
            <button class="btn btn-secondary" onclick="nextSlide()">Next <i class="fas fa-chevron-right"></i></button>
        </div>
    </div>`;
    openModal(m.title, html);
    window._slides = slides;
    window._currentSlide = 0;
    renderSlide(0);
};

function renderSlide(idx) {
    const s = window._slides[idx];
    if (!s) return;
    const sc = document.getElementById('slideContent');
    if (!sc) return;
    let bullets = s.bullets || [];
    if (bullets.length === 0 && s.content) {
        bullets = s.content.split(/\\n|\n/).map(b => b.replace(/^[•]\s*/, '').trim()).filter(Boolean);
    }
    sc.innerHTML = `<div class="slide">
        <h2>${esc(s.title || '')}</h2>
        ${bullets.map(b => `<div class="slide-bullet"><i class="fas fa-chevron-right"></i> ${esc(b)}</div>`).join('')}
        ${s.note ? `<div class="slide-note"><i class="fas fa-info-circle"></i> ${esc(s.note)}</div>` : ''}
    </div>`;
    const counter = document.getElementById('slideCounter');
    if (counter) counter.textContent = `${idx + 1} / ${window._slides.length}`;
}

window.prevSlide = () => { if (window._currentSlide > 0) { window._currentSlide--; renderSlide(window._currentSlide); } };
window.nextSlide = () => { if (window._currentSlide < window._slides.length - 1) { window._currentSlide++; renderSlide(window._currentSlide); } };

// ===================================================================
//  PAGE: MY TRAINING (Employee)
// ===================================================================
async function pageMyTraining() {
    pageTitle.textContent = 'My Training';
    const assignments = await apiGet('/training/my-assignments');
    const modules = await apiGet('/training/modules');

    const pending = assignments.filter(a => a.status === 'pending' || a.status === 'in_progress');
    const completed = assignments.filter(a => a.status === 'completed');

    content.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px">
            ${statCard('fa-graduation-cap', 'blue', assignments.length, 'Total Assigned')}
            ${statCard('fa-spinner', 'gold', pending.length, 'Pending')}
            ${statCard('fa-check-circle', 'green', completed.length, 'Completed')}
        </div>
        <div class="training-grid">
            ${assignments.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-graduation-cap"></i><h3>No Training Assigned</h3><p>You have no training modules assigned yet.</p></div>' :
            assignments.map(a => {
                const m = modules.find(x => x.id === a.module_id) || {};
                return `<div class="training-card ${a.status === 'completed' ? 'completed' : ''}">
                    <div class="training-card-header">
                        <div class="training-type-badge ${m.type || 'custom'}">${m.type || 'custom'}</div>
                        ${statusBadge(a.status)}
                    </div>
                    <h4>${esc(m.title || 'Training Module')}</h4>
                    <p>${esc(m.description || '')}</p>
                    <div class="training-card-meta">
                        <span><i class="fas fa-clock"></i> ${m.duration_minutes || 0} min</span>
                        ${a.due_date ? `<span><i class="fas fa-calendar"></i> Due: ${formatDate(a.due_date)}</span>` : ''}
                        ${a.score !== null ? `<span><i class="fas fa-trophy"></i> Score: ${a.score}%</span>` : ''}
                    </div>
                    <div class="training-card-actions">
                        ${a.status !== 'completed' ? `
                            <button class="btn btn-sm btn-secondary" onclick="startTraining(${a.id}, ${m.id})"><i class="fas fa-play"></i> Start</button>
                            <button class="btn btn-sm btn-success" onclick="completeTraining(${a.id})"><i class="fas fa-check"></i> Mark Complete</button>
                        ` : '<span style="color:var(--p-green)"><i class="fas fa-check-circle"></i> Completed</span>'}
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

window.startTraining = async (assignmentId, moduleId) => {
    await previewTrainingModule(moduleId);
};

window.completeTraining = async (assignmentId) => {
    try {
        await apiPut(`/training/complete/${assignmentId}`, { score: 100 });
        toast('Training completed!'); pageMyTraining();
    } catch (e) { toast(e.message, 'error'); }
};

// ===================================================================
//  PAGE: FORM 16 (Admin/HR/Accountant)
// ===================================================================
async function pageForm16() {
    pageTitle.textContent = 'Form 16';
    const forms = await apiGet('/form16');
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-file-shield"></i> Form 16 (${forms.length})</h3>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-primary" onclick="showGenerateForm16Modal()"><i class="fas fa-plus"></i> Generate Single</button>
                    <button class="btn btn-secondary" onclick="generateBulkForm16()"><i class="fas fa-layer-group"></i> Bulk Generate</button>
                </div>
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Employee</th><th>Financial Year</th><th>Total Income</th><th>Tax Deducted</th><th>Generated</th><th>Actions</th></tr></thead>
                <tbody>
                    ${forms.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--p-text-muted)">No Form 16 generated</td></tr>' : forms.map(f => `<tr>
                        <td><strong>${esc(f.employee_name || 'Employee')}</strong></td>
                        <td>${esc(f.financial_year)}</td>
                        <td>${formatINR(f.total_income)}</td>
                        <td>${formatINR(f.total_tax_deducted)}</td>
                        <td>${formatDate(f.created_at)}</td>
                        <td><button class="btn btn-sm btn-secondary" onclick="viewForm16(${f.id})"><i class="fas fa-eye"></i></button></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showGenerateForm16Modal = async () => {
    const emps = await apiGet('/employees');
    const activeEmps = emps.filter(e => e.status === 'active' && e.annual_ctc > 0);
    openModal('Generate Form 16', `
        <div class="form-grid">
            <div class="form-group"><label>Employee *</label><select class="form-control" id="f16_emp">
                <option value="">Select Employee</option>
                ${activeEmps.map(e => `<option value="${e.id}">${esc(e.name)} (${esc(e.employee_code)})</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Financial Year *</label><input class="form-control" id="f16_fy" value="${new Date().getFullYear()-1}-${new Date().getFullYear()}" placeholder="2024-2025"></div>
        </div>
        <button class="btn btn-primary" onclick="generateForm16()" style="margin-top:8px"><i class="fas fa-file-shield"></i> Generate</button>
    `);
};

window.generateForm16 = async () => {
    const empId = parseInt($('#f16_emp').value);
    if (!empId) return toast('Select an employee', 'error');
    try {
        await apiPost('/form16/generate', { employee_id: empId, financial_year: $('#f16_fy').value });
        toast('Form 16 generated'); closeModal(); pageForm16();
    } catch (e) { toast(e.message, 'error'); }
};

window.generateBulkForm16 = async () => {
    const fy = prompt('Financial Year (e.g. 2024-2025):', `${new Date().getFullYear()-1}-${new Date().getFullYear()}`);
    if (!fy) return;
    try {
        const result = await apiPost('/form16/generate-bulk', { financial_year: fy });
        toast(result.message || 'Bulk Form 16 generated'); pageForm16();
    } catch (e) { toast(e.message, 'error'); }
};

window.viewForm16 = async (id) => {
    const forms = await apiGet('/form16');
    const f = forms.find(x => x.id === id);
    if (!f) return;
    let partA = {}, partB = {};
    try { partA = JSON.parse(f.part_a || '{}'); } catch(e) {}
    try { partB = JSON.parse(f.part_b || '{}'); } catch(e) {}

    openModal('Form 16 — ' + (f.employee_name || ''), `
        <div class="form16-preview">
            <div class="form16-header">
                <h2>FORM No. 16</h2>
                <p>[See rule 31(1)(a)]</p>
                <h3>Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source from income chargeable under the head "Salaries"</h3>
            </div>
            <div class="form16-section">
                <h4>Part A — Tax Deducted at Source</h4>
                <table class="details-table">
                    <tr><td class="label-col">Name of Employer</td><td>PrimeAxis IT Solutions</td></tr>
                    <tr><td class="label-col">TAN of Employer</td><td>HYDP00000A</td></tr>
                    <tr><td class="label-col">PAN of Employee</td><td>${esc(partA.pan || '—')}</td></tr>
                    <tr><td class="label-col">Employee Name</td><td>${esc(f.employee_name)}</td></tr>
                    <tr><td class="label-col">Financial Year</td><td>${esc(f.financial_year)}</td></tr>
                    <tr><td class="label-col">Assessment Year</td><td>${esc(partA.assessment_year || '—')}</td></tr>
                </table>
                ${partA.quarterly_tds ? `<h5 style="margin:12px 0 8px">Quarter-wise TDS</h5>
                <table class="ctc-table">
                    <thead><tr><th>Quarter</th><th>From</th><th>To</th><th>TDS (₹)</th></tr></thead>
                    <tbody>${partA.quarterly_tds.map(q => `<tr><td>${q.quarter}</td><td>${q.from}</td><td>${q.to}</td><td class="amt">${formatINR(q.tds)}</td></tr>`).join('')}
                    <tr class="total-row"><td colspan="3"><strong>Total</strong></td><td class="amt"><strong>${formatINR(f.total_tax_deducted)}</strong></td></tr></tbody>
                </table>` : ''}
            </div>
            <div class="form16-section">
                <h4>Part B — Details of Salary</h4>
                <table class="details-table">
                    <tr><td class="label-col">Gross Salary</td><td>${formatINR(partB.gross_salary)}</td></tr>
                    <tr><td class="label-col">Standard Deduction (u/s 16)</td><td>${formatINR(partB.standard_deduction || 75000)}</td></tr>
                    <tr><td class="label-col">Tax Regime</td><td>${partB.regime === 'old' ? 'Old Regime' : 'New Regime'}</td></tr>
                    ${partB.total_exemptions ? `<tr><td class="label-col">Total Exemptions Declared</td><td>${formatINR(partB.total_exemptions)}</td></tr>` : ''}
                    <tr><td class="label-col"><strong>Total Income</strong></td><td><strong>${formatINR(f.total_income)}</strong></td></tr>
                    <tr><td class="label-col"><strong>Tax on Total Income</strong></td><td><strong>${formatINR(f.total_tax_deducted)}</strong></td></tr>
                </table>
            </div>
            <div class="form16-footer">
                <p>This is a computer-generated Form 16 and does not require a signature.</p>
                <p><strong>PrimeAxis IT Solutions</strong> | CIN: U72200TG2024PTC000001 | TAN: HYDP00000A</p>
            </div>
        </div>
        <button class="btn btn-primary" onclick="window.print()" style="margin-top:12px"><i class="fas fa-print"></i> Print / Download PDF</button>
    `);
};

// ===================================================================
//  PAGE: MY FORM 16 (Employee)
// ===================================================================
async function pageMyForm16() {
    pageTitle.textContent = 'My Form 16';
    const forms = await apiGet('/form16');
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header"><h3><i class="fas fa-file-shield"></i> My Form 16 Certificates</h3></div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Financial Year</th><th>Total Income</th><th>Tax Deducted</th><th>Generated</th><th>View</th></tr></thead>
                <tbody>
                    ${forms.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--p-text-muted)">No Form 16 available yet. It will be generated by your employer after the financial year ends.</td></tr>' : forms.map(f => `<tr>
                        <td><strong>${esc(f.financial_year)}</strong></td>
                        <td>${formatINR(f.total_income)}</td>
                        <td>${formatINR(f.total_tax_deducted)}</td>
                        <td>${formatDate(f.created_at)}</td>
                        <td><button class="btn btn-sm btn-secondary" onclick="viewForm16(${f.id})"><i class="fas fa-eye"></i></button></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

// ===================================================================
//  PAGE: PAYSLIP EXTRAS (Admin/Accountant)
// ===================================================================
async function pagePayslipExtras() {
    pageTitle.textContent = 'Payslip Extras';
    const extras = await apiGet('/payslip-extras');
    const now = new Date();
    content.innerHTML = `
        <div class="table-card">
            <div class="table-header">
                <h3><i class="fas fa-gift"></i> Payslip Extras / Bonuses (${extras.length})</h3>
                <button class="btn btn-primary" onclick="showAddPayslipExtraModal()"><i class="fas fa-plus"></i> Add Extra</button>
            </div>
            <div class="table-wrapper"><table>
                <thead><tr><th>Employee</th><th>Period</th><th>Type</th><th>Description</th><th>Amount</th><th>Taxable</th><th>Actions</th></tr></thead>
                <tbody>
                    ${extras.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--p-text-muted)">No extras added</td></tr>' : extras.map(e => `<tr>
                        <td><strong>${esc(e.employee_name || 'Employee')}</strong></td>
                        <td>${monthNames[e.month]} ${e.year}</td>
                        <td><span class="badge-status active" style="text-transform:capitalize">${(e.type||'').replace(/_/g,' ')}</span></td>
                        <td>${esc(e.description || '—')}</td>
                        <td style="color:var(--p-green);font-weight:700">${formatINR(e.amount)}</td>
                        <td>${e.is_taxable ? '<span style="color:var(--p-red)">Yes</span>' : 'No'}</td>
                        <td><button class="btn btn-sm btn-danger" onclick="deletePayslipExtra(${e.id})"><i class="fas fa-trash"></i></button></td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
        </div>`;
}

window.showAddPayslipExtraModal = async () => {
    const emps = await apiGet('/employees');
    const activeEmps = emps.filter(e => e.status === 'active');
    const now = new Date();
    openModal('Add Payslip Extra / Bonus', `
        <div class="form-grid">
            <div class="form-group"><label>Employee *</label><select class="form-control" id="pe_emp">
                <option value="">Select Employee</option>
                ${activeEmps.map(e => `<option value="${e.id}">${esc(e.name)} (${esc(e.employee_code)})</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Type *</label><select class="form-control" id="pe_type">
                <option value="joining_bonus">Joining Bonus</option>
                <option value="performance_bonus">Performance Bonus</option>
                <option value="referral_bonus">Referral Bonus</option>
                <option value="extra_allowance">Extra Allowance</option>
                <option value="shift_allowance">Shift Allowance</option>
                <option value="other">Other</option>
            </select></div>
            <div class="form-group"><label>Month *</label><select class="form-control" id="pe_month">
                ${monthNames.slice(1).map((m, i) => `<option value="${i + 1}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${m}</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Year *</label><input class="form-control" id="pe_year" type="number" value="${now.getFullYear()}"></div>
            <div class="form-group"><label>Amount (₹) *</label><input class="form-control" id="pe_amount" type="number" placeholder="e.g. 50000"></div>
            <div class="form-group"><label>Taxable</label><select class="form-control" id="pe_taxable">
                <option value="1" selected>Yes — Subject to TDS</option>
                <option value="0">No — Tax-free</option>
            </select></div>
            <div class="form-group full-width"><label>Description</label><input class="form-control" id="pe_desc" placeholder="e.g. Q4 Performance Bonus"></div>
        </div>
        <button class="btn btn-primary" onclick="addPayslipExtra()" style="margin-top:8px"><i class="fas fa-save"></i> Add Extra</button>
    `);
};

window.addPayslipExtra = async () => {
    try {
        await apiPost('/payslip-extras', {
            employee_id: parseInt($('#pe_emp').value),
            month: parseInt($('#pe_month').value),
            year: parseInt($('#pe_year').value),
            type: $('#pe_type').value,
            description: $('#pe_desc').value,
            amount: parseFloat($('#pe_amount').value),
            is_taxable: parseInt($('#pe_taxable').value),
        });
        toast('Payslip extra added'); closeModal(); pagePayslipExtras();
    } catch (e) { toast(e.message, 'error'); }
};

window.deletePayslipExtra = async (id) => {
    if (!confirm('Delete this extra?')) return;
    try { await api(`/payslip-extras/${id}`, { method: 'DELETE' }); toast('Deleted'); pagePayslipExtras(); } catch (e) { toast(e.message, 'error'); }
};

// ===== XSS PROTECTION =====
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}
