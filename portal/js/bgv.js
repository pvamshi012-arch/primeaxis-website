/* =============================================
   PrimeAxis IT — BGV Candidate Wizard
   ============================================= */

const API = '/api';
let bgvToken = null;
let candidateName = '';
let currentStep = 0;
let completedSections = [];

const STEPS = [
    { id: 'personal', title: 'Personal Details', icon: 'fa-user' },
    { id: 'emergency', title: 'Emergency Contact', icon: 'fa-phone-alt' },
    { id: 'family', title: 'Family Details', icon: 'fa-users' },
    { id: 'address', title: 'Address', icon: 'fa-map-marker-alt' },
    { id: 'edu_10th', title: '10th Standard', icon: 'fa-school' },
    { id: 'edu_12th', title: '12th Standard', icon: 'fa-school' },
    { id: 'edu_graduation', title: 'Graduation', icon: 'fa-graduation-cap' },
    { id: 'edu_pg', title: 'Post Graduation', icon: 'fa-user-graduate' },
    { id: 'address_proofs', title: 'Address Proofs', icon: 'fa-id-card' },
    { id: 'declaration', title: 'Declaration & Submit', icon: 'fa-file-signature' },
];

const $ = (sel) => document.querySelector(sel);

// ===== TOAST =====
function toast(msg, type = 'success') {
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// ===== API HELPERS =====
async function bgvApi(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (bgvToken) headers['X-BGV-Token'] = bgvToken;
    const res = await fetch(API + path, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

async function bgvUploadFile(section, file, docType) {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('doc_type', docType);
    const res = await fetch(`${API}/bgv/upload/${section}`, {
        method: 'POST',
        headers: { 'X-BGV-Token': bgvToken },
        body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
}

// ===== LOGIN =====
window.bgvLogin = async () => {
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    const errorDiv = $('#loginError');
    errorDiv.textContent = '';

    if (!email || !password) { errorDiv.textContent = 'Please enter email and password'; return; }

    try {
        const result = await bgvApi('/bgv/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        bgvToken = result.access_token;
        candidateName = result.candidate_name;
        startWizard();
    } catch (e) {
        errorDiv.textContent = e.message;
    }
};

// Check URL param token for direct link
(function checkDirectLink() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
        // Pre-fill and show login, but still require password
        $('#loginScreen').style.display = 'flex';
    }
})();

// ===== WIZARD INIT =====
async function startWizard() {
    $('#loginScreen').style.display = 'none';
    $('#wizardScreen').style.display = 'flex';
    $('#candidateGreeting').innerHTML = `<i class="fas fa-user-circle"></i> Welcome, <strong>${esc(candidateName)}</strong>`;

    // Load progress
    try {
        const progress = await bgvApi('/bgv/progress');
        completedSections = progress.completedSections || [];
    } catch (e) { completedSections = []; }

    buildStepsNav();
    renderStep(currentStep);
}

function buildStepsNav() {
    const nav = document.getElementById('stepsNav');
    nav.innerHTML = STEPS.map((s, i) => {
        const done = completedSections.includes(s.id);
        return `<div class="bgv-step-dot ${done ? 'completed' : ''} ${i === currentStep ? 'active' : ''}" onclick="goToStep(${i})" title="${s.title}">
            <i class="fas ${done ? 'fa-check' : s.icon}"></i>
            <span>${s.title}</span>
        </div>`;
    }).join('');

    // Progress bar
    const pct = Math.round((completedSections.length / STEPS.length) * 100);
    $('#progressFill').style.width = pct + '%';
    $('#stepIndicator').textContent = `Step ${currentStep + 1} of ${STEPS.length}`;

    // Nav buttons
    $('#prevBtn').style.display = currentStep === 0 ? 'none' : '';
    const isLast = currentStep === STEPS.length - 1;
    $('#nextBtn').innerHTML = isLast ? '<i class="fas fa-check-circle"></i> Submit BGV' : 'Next <i class="fas fa-arrow-right"></i>';
    $('#nextBtn').className = isLast ? 'btn btn-success' : 'btn btn-primary';
}

window.goToStep = (i) => {
    currentStep = i;
    buildStepsNav();
    renderStep(i);
};

window.prevStep = () => {
    if (currentStep > 0) {
        currentStep--;
        buildStepsNav();
        renderStep(currentStep);
    }
};

window.nextStep = async () => {
    const step = STEPS[currentStep];

    // Save current step
    try {
        await saveCurrentStep();
    } catch (e) {
        toast(e.message, 'error');
        return;
    }

    if (currentStep === STEPS.length - 1) {
        // Final submit
        await finalSubmit();
    } else {
        currentStep++;
        buildStepsNav();
        renderStep(currentStep);
    }
};

// ===== SAVE STEP =====
async function saveCurrentStep() {
    const step = STEPS[currentStep];
    const data = collectStepData(step.id);

    if (!data) return; // Step like address_proofs might not have form data

    await bgvApi(`/bgv/section/${step.id}`, {
        method: 'POST',
        body: JSON.stringify(data)
    });

    if (!completedSections.includes(step.id)) {
        completedSections.push(step.id);
    }
    toast(`${step.title} saved!`);
}

function collectStepData(section) {
    switch (section) {
        case 'personal':
            return {
                full_name: v('bgv_full_name'), dob: v('bgv_dob'), gender: v('bgv_gender'),
                blood_group: v('bgv_blood_group'), marital_status: v('bgv_marital'),
                nationality: v('bgv_nationality'), aadhar_no: v('bgv_aadhar'),
                pan_no: v('bgv_pan'), personal_email: v('bgv_personal_email'),
                personal_phone: v('bgv_personal_phone')
            };
        case 'emergency':
            return {
                name: v('bgv_em_name'), relationship: v('bgv_em_rel'),
                phone: v('bgv_em_phone'), alt_phone: v('bgv_em_alt_phone')
            };
        case 'family':
            return {
                father_name: v('bgv_father_name'), father_occupation: v('bgv_father_occ'),
                mother_name: v('bgv_mother_name'), mother_occupation: v('bgv_mother_occ'),
                spouse_name: v('bgv_spouse'), dependents: v('bgv_dependents')
            };
        case 'address':
            return {
                current_address: v('bgv_cur_addr'), current_city: v('bgv_cur_city'),
                current_state: v('bgv_cur_state'), current_pincode: v('bgv_cur_pin'),
                permanent_address: v('bgv_perm_addr'), permanent_city: v('bgv_perm_city'),
                permanent_state: v('bgv_perm_state'), permanent_pincode: v('bgv_perm_pin'),
            };
        case 'edu_10th': case 'edu_12th': case 'edu_graduation': case 'edu_pg':
            return {
                institution: v('bgv_inst'), board: v('bgv_board'),
                year: v('bgv_year'), percentage: v('bgv_pct'), degree: v('bgv_degree')
            };
        case 'address_proofs':
            return { proof_types: getSelectedProofTypes() };
        case 'declaration':
            return {
                agreed: document.getElementById('bgv_declare')?.checked || false,
                submitted_at: new Date().toISOString()
            };
        default: return {};
    }
}

function v(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

function getSelectedProofTypes() {
    const types = [];
    document.querySelectorAll('.proof-type-check:checked').forEach(cb => types.push(cb.value));
    return types;
}

// ===== FINAL SUBMIT =====
async function finalSubmit() {
    const declareBox = document.getElementById('bgv_declare');
    if (!declareBox || !declareBox.checked) {
        toast('You must agree to the declaration before submitting', 'error');
        return;
    }

    // Save declaration
    await bgvApi('/bgv/section/declaration', {
        method: 'POST',
        body: JSON.stringify({ agreed: true, submitted_at: new Date().toISOString() })
    });

    try {
        const result = await bgvApi('/bgv/submit', { method: 'POST', body: JSON.stringify({}) });
        toast(result.message);
        // Show success screen
        document.getElementById('wizardContent').innerHTML = `
            <div class="bgv-success">
                <i class="fas fa-check-circle"></i>
                <h2>BGV Submitted Successfully!</h2>
                <p>Thank you, <strong>${esc(candidateName)}</strong>. Your Background Verification form has been submitted.</p>
                <p>Our HR team will review your documents and verify the details. You will be contacted if any additional information is required.</p>
                <div class="bgv-success-ref">Reference: BGV-${Date.now()}</div>
            </div>
        `;
        // Hide nav buttons
        document.querySelector('.bgv-wizard-nav').style.display = 'none';
        document.querySelector('.bgv-progress-container').innerHTML = '<div style="text-align:center;padding:16px;color:#22c55e;font-weight:600"><i class="fas fa-check-circle"></i> All steps completed</div>';
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ===== RENDER STEPS =====
async function renderStep(index) {
    const step = STEPS[index];
    const container = document.getElementById('wizardContent');
    container.innerHTML = '<div class="bgv-step-loading"><div class="loading-spinner"></div> Loading...</div>';

    // Load saved data
    let saved = null, docs = [];
    try {
        const result = await bgvApi(`/bgv/section/${step.id}`);
        saved = result.data;
        docs = result.documents || [];
    } catch (e) { /* no saved data */ }

    container.innerHTML = `
        <div class="bgv-step">
            <div class="bgv-step-header">
                <span class="bgv-step-number">${index + 1}</span>
                <div>
                    <h2>${step.title}</h2>
                    <p class="bgv-step-subtitle">${getStepSubtitle(step.id)}</p>
                </div>
            </div>
            <div class="bgv-step-body">
                ${renderStepForm(step.id, saved, docs)}
            </div>
        </div>
    `;

    // Scroll to top
    container.scrollTop = 0;
}

function getStepSubtitle(id) {
    const subs = {
        personal: 'Enter your personal information as per government records',
        emergency: 'Provide emergency contact details',
        family: 'Enter your family member details',
        address: 'Current and permanent address',
        edu_10th: 'Class 10 / SSC / SSLC details with marksheet',
        edu_12th: 'Class 12 / HSC / Intermediate details with marksheet',
        edu_graduation: 'Degree details with provisional/final certificate',
        edu_pg: 'Post graduation details (optional — skip if not applicable)',
        address_proofs: 'Upload any 2 address proofs as per Indian Government policy',
        declaration: 'Review all information and submit your declaration'
    };
    return subs[id] || '';
}

function renderStepForm(section, data, docs) {
    const d = data || {};
    switch (section) {
        case 'personal': return personalForm(d);
        case 'emergency': return emergencyForm(d);
        case 'family': return familyForm(d);
        case 'address': return addressForm(d);
        case 'edu_10th': return educationForm(d, docs, 'edu_10th', '10th Standard');
        case 'edu_12th': return educationForm(d, docs, 'edu_12th', '12th Standard');
        case 'edu_graduation': return educationForm(d, docs, 'edu_graduation', 'Graduation');
        case 'edu_pg': return educationForm(d, docs, 'edu_pg', 'Post Graduation');
        case 'address_proofs': return addressProofsForm(d, docs);
        case 'declaration': return declarationForm(d);
    }
}

function personalForm(d) {
    return `<div class="bgv-form-grid">
        <div class="form-group"><label>Full Name (as per Aadhar) *</label><input id="bgv_full_name" class="form-control" value="${esc(d.full_name || candidateName)}"></div>
        <div class="form-group"><label>Date of Birth *</label><input id="bgv_dob" type="date" class="form-control" value="${d.dob || ''}"></div>
        <div class="form-group"><label>Gender *</label><select id="bgv_gender" class="form-control">
            <option value="">Select</option>
            <option value="Male" ${d.gender==='Male'?'selected':''}>Male</option>
            <option value="Female" ${d.gender==='Female'?'selected':''}>Female</option>
            <option value="Other" ${d.gender==='Other'?'selected':''}>Other</option>
        </select></div>
        <div class="form-group"><label>Blood Group</label><select id="bgv_blood_group" class="form-control">
            <option value="">Select</option>
            ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => `<option ${d.blood_group===bg?'selected':''}>${bg}</option>`).join('')}
        </select></div>
        <div class="form-group"><label>Marital Status *</label><select id="bgv_marital" class="form-control">
            <option value="">Select</option>
            <option value="Single" ${d.marital_status==='Single'?'selected':''}>Single</option>
            <option value="Married" ${d.marital_status==='Married'?'selected':''}>Married</option>
            <option value="Divorced" ${d.marital_status==='Divorced'?'selected':''}>Divorced</option>
            <option value="Widowed" ${d.marital_status==='Widowed'?'selected':''}>Widowed</option>
        </select></div>
        <div class="form-group"><label>Nationality *</label><input id="bgv_nationality" class="form-control" value="${esc(d.nationality || 'Indian')}"></div>
        <div class="form-group"><label>Aadhar Number *</label><input id="bgv_aadhar" class="form-control" placeholder="XXXX XXXX XXXX" maxlength="14" value="${esc(d.aadhar_no || '')}"></div>
        <div class="form-group"><label>PAN Number *</label><input id="bgv_pan" class="form-control" placeholder="ABCDE1234F" maxlength="10" style="text-transform:uppercase" value="${esc(d.pan_no || '')}"></div>
        <div class="form-group"><label>Personal Email *</label><input id="bgv_personal_email" type="email" class="form-control" value="${esc(d.personal_email || '')}"></div>
        <div class="form-group"><label>Personal Phone *</label><input id="bgv_personal_phone" type="tel" class="form-control" placeholder="+91 XXXXXXXXXX" value="${esc(d.personal_phone || '')}"></div>
    </div>`;
}

function emergencyForm(d) {
    return `<div class="bgv-form-grid">
        <div class="form-group"><label>Contact Person Name *</label><input id="bgv_em_name" class="form-control" value="${esc(d.name || '')}"></div>
        <div class="form-group"><label>Relationship *</label><select id="bgv_em_rel" class="form-control">
            <option value="">Select</option>
            ${['Father','Mother','Spouse','Brother','Sister','Friend','Other'].map(r => `<option ${d.relationship===r?'selected':''}>${r}</option>`).join('')}
        </select></div>
        <div class="form-group"><label>Phone Number *</label><input id="bgv_em_phone" type="tel" class="form-control" value="${esc(d.phone || '')}"></div>
        <div class="form-group"><label>Alternate Phone</label><input id="bgv_em_alt_phone" type="tel" class="form-control" value="${esc(d.alt_phone || '')}"></div>
    </div>`;
}

function familyForm(d) {
    return `<div class="bgv-form-grid">
        <div class="form-group"><label>Father's Name *</label><input id="bgv_father_name" class="form-control" value="${esc(d.father_name || '')}"></div>
        <div class="form-group"><label>Father's Occupation</label><input id="bgv_father_occ" class="form-control" value="${esc(d.father_occupation || '')}"></div>
        <div class="form-group"><label>Mother's Name *</label><input id="bgv_mother_name" class="form-control" value="${esc(d.mother_name || '')}"></div>
        <div class="form-group"><label>Mother's Occupation</label><input id="bgv_mother_occ" class="form-control" value="${esc(d.mother_occupation || '')}"></div>
        <div class="form-group"><label>Spouse Name</label><input id="bgv_spouse" class="form-control" value="${esc(d.spouse_name || '')}" placeholder="If married"></div>
        <div class="form-group"><label>No. of Dependents</label><input id="bgv_dependents" type="number" class="form-control" value="${d.dependents || '0'}"></div>
    </div>`;
}

function addressForm(d) {
    return `
        <div class="bgv-address-section">
            <h3><i class="fas fa-home"></i> Current Address</h3>
            <div class="bgv-form-grid">
                <div class="form-group full-width"><label>Address *</label><textarea id="bgv_cur_addr" class="form-control" rows="2">${esc(d.current_address || '')}</textarea></div>
                <div class="form-group"><label>City *</label><input id="bgv_cur_city" class="form-control" value="${esc(d.current_city || '')}"></div>
                <div class="form-group"><label>State *</label><input id="bgv_cur_state" class="form-control" value="${esc(d.current_state || '')}"></div>
                <div class="form-group"><label>Pincode *</label><input id="bgv_cur_pin" class="form-control" maxlength="6" value="${esc(d.current_pincode || '')}"></div>
            </div>
        </div>
        <div class="bgv-same-address">
            <label><input type="checkbox" id="bgv_same_addr" onchange="copyAddress()"> Same as current address</label>
        </div>
        <div class="bgv-address-section">
            <h3><i class="fas fa-map"></i> Permanent Address</h3>
            <div class="bgv-form-grid">
                <div class="form-group full-width"><label>Address *</label><textarea id="bgv_perm_addr" class="form-control" rows="2">${esc(d.permanent_address || '')}</textarea></div>
                <div class="form-group"><label>City *</label><input id="bgv_perm_city" class="form-control" value="${esc(d.permanent_city || '')}"></div>
                <div class="form-group"><label>State *</label><input id="bgv_perm_state" class="form-control" value="${esc(d.permanent_state || '')}"></div>
                <div class="form-group"><label>Pincode *</label><input id="bgv_perm_pin" class="form-control" maxlength="6" value="${esc(d.permanent_pincode || '')}"></div>
            </div>
        </div>`;
}

window.copyAddress = () => {
    const same = document.getElementById('bgv_same_addr').checked;
    if (same) {
        document.getElementById('bgv_perm_addr').value = document.getElementById('bgv_cur_addr').value;
        document.getElementById('bgv_perm_city').value = document.getElementById('bgv_cur_city').value;
        document.getElementById('bgv_perm_state').value = document.getElementById('bgv_cur_state').value;
        document.getElementById('bgv_perm_pin').value = document.getElementById('bgv_cur_pin').value;
    }
};

function educationForm(d, docs, section, title) {
    const existingDoc = docs.find(dc => dc.section === section);
    return `
        <div class="bgv-form-grid">
            <div class="form-group full-width"><label>Institution / School / College Name *</label><input id="bgv_inst" class="form-control" value="${esc(d.institution || '')}"></div>
            <div class="form-group"><label>Board / University *</label><input id="bgv_board" class="form-control" value="${esc(d.board || '')}" placeholder="e.g. CBSE, ICSE, State Board, JNTU"></div>
            <div class="form-group"><label>Year of Passing *</label><input id="bgv_year" type="number" class="form-control" min="1980" max="2030" value="${d.year || ''}"></div>
            <div class="form-group"><label>Percentage / CGPA *</label><input id="bgv_pct" class="form-control" value="${esc(d.percentage || '')}" placeholder="e.g. 85% or 8.5 CGPA"></div>
            <div class="form-group"><label>Degree / Stream</label><input id="bgv_degree" class="form-control" value="${esc(d.degree || '')}" placeholder="e.g. B.Tech CSE, B.Com, MCA"></div>
        </div>
        <div class="bgv-doc-upload">
            <h4><i class="fas fa-upload"></i> Upload ${title} Certificate / Marksheet</h4>
            <div class="bgv-upload-zone" id="zone_${section}" onclick="document.getElementById('file_${section}').click()">
                <input type="file" id="file_${section}" accept=".jpg,.jpeg,.png,.webp,.pdf" onchange="handleEduUpload('${section}', this)" hidden>
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Click to upload or drag & drop</p>
                <span>JPG, PNG, PDF (max 5MB)</span>
            </div>
            ${existingDoc ? `<div class="bgv-uploaded-file"><i class="fas fa-check-circle" style="color:#22c55e"></i> ${esc(existingDoc.original_name)} <a href="/api/uploads/${existingDoc.file_path}" target="_blank">View</a></div>` : ''}
            <div id="upload_status_${section}"></div>
        </div>`;
}

window.handleEduUpload = async (section, input) => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const status = document.getElementById(`upload_status_${section}`);
    status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    try {
        await bgvUploadFile(section, file, 'certificate');
        status.innerHTML = `<div class="bgv-uploaded-file"><i class="fas fa-check-circle" style="color:#22c55e"></i> ${esc(file.name)} uploaded successfully</div>`;
        document.getElementById(`zone_${section}`).classList.add('uploaded');
    } catch (e) {
        status.innerHTML = `<span style="color:#ef4444"><i class="fas fa-times-circle"></i> ${e.message}</span>`;
    }
};

function addressProofsForm(d, docs) {
    const proofTypes = [
        { id: 'aadhar_card', label: 'Aadhar Card', icon: 'fa-id-card' },
        { id: 'voter_id', label: 'Voter ID Card', icon: 'fa-vote-yea' },
        { id: 'passport', label: 'Passport', icon: 'fa-passport' },
        { id: 'driving_license', label: 'Driving License', icon: 'fa-car' },
        { id: 'utility_bill', label: 'Utility Bill (Electricity/Gas/Water)', icon: 'fa-file-invoice' },
        { id: 'bank_statement', label: 'Bank Statement / Passbook', icon: 'fa-university' },
        { id: 'ration_card', label: 'Ration Card', icon: 'fa-scroll' },
    ];

    const selectedTypes = d?.proof_types || [];

    return `
        <div class="bgv-proof-info">
            <i class="fas fa-info-circle"></i>
            <p>As per Indian Government policy, please upload <strong>at least 2 address proof documents</strong> from the list below. Each document should clearly show your name and address.</p>
        </div>
        <div class="bgv-proof-list">
            ${proofTypes.map(pt => {
                const existingDoc = docs.find(dc => dc.doc_type === pt.id);
                return `<div class="bgv-proof-item ${existingDoc ? 'uploaded' : ''}">
                    <div class="bgv-proof-header">
                        <label>
                            <input type="checkbox" class="proof-type-check" value="${pt.id}" ${selectedTypes.includes(pt.id) || existingDoc ? 'checked' : ''}>
                            <i class="fas ${pt.icon}"></i> ${pt.label}
                        </label>
                    </div>
                    <div class="bgv-proof-upload">
                        <input type="file" id="proof_file_${pt.id}" accept=".jpg,.jpeg,.png,.webp,.pdf" onchange="handleProofUpload('${pt.id}', this)" hidden>
                        <button class="btn btn-sm btn-secondary" onclick="document.getElementById('proof_file_${pt.id}').click()">
                            <i class="fas fa-upload"></i> ${existingDoc ? 'Replace' : 'Upload'}
                        </button>
                        ${existingDoc ? `<span class="proof-uploaded"><i class="fas fa-check-circle"></i> ${esc(existingDoc.original_name)}</span>` : ''}
                        <span id="proof_status_${pt.id}"></span>
                    </div>
                </div>`;
            }).join('')}
        </div>
        <p class="bgv-proof-counter" id="proofCounter">Documents uploaded: <strong>${docs.length}</strong> / 2 minimum</p>
    `;
}

window.handleProofUpload = async (docType, input) => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const status = document.getElementById(`proof_status_${docType}`);
    status.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        await bgvUploadFile('address_proofs', file, docType);
        status.innerHTML = `<span class="proof-uploaded"><i class="fas fa-check-circle"></i> ${esc(file.name)}</span>`;
        input.closest('.bgv-proof-item').classList.add('uploaded');
        // Check the checkbox
        input.closest('.bgv-proof-item').querySelector('.proof-type-check').checked = true;
        updateProofCounter();
    } catch (e) {
        status.innerHTML = `<span style="color:#ef4444">${e.message}</span>`;
    }
};

function updateProofCounter() {
    const uploaded = document.querySelectorAll('.bgv-proof-item.uploaded').length;
    const counter = document.getElementById('proofCounter');
    if (counter) {
        counter.innerHTML = `Documents uploaded: <strong style="color:${uploaded >= 2 ? '#22c55e' : '#ef4444'}">${uploaded}</strong> / 2 minimum`;
    }
}

function declarationForm(d) {
    return `
        <div class="bgv-declaration">
            <div class="bgv-declaration-box">
                <h3><i class="fas fa-gavel"></i> Declaration</h3>
                <div class="bgv-declaration-text">
                    <p>I, <strong>${esc(candidateName)}</strong>, hereby declare that:</p>
                    <ol>
                        <li>All the information provided by me in this Background Verification form is true, complete, and correct to the best of my knowledge and belief.</li>
                        <li>I have not suppressed or concealed any material facts or information.</li>
                        <li>All documents and certificates uploaded are genuine and authentic.</li>
                        <li>I understand that any false statement, misrepresentation, or concealment of facts may result in:
                            <ul>
                                <li>Immediate withdrawal of the offer of employment</li>
                                <li>Termination of employment if already joined</li>
                                <li>Legal action as deemed appropriate by the company</li>
                            </ul>
                        </li>
                        <li>I authorize <strong>PrimeAxis IT Solutions</strong> and its authorized representatives to verify all information and documents provided herein.</li>
                        <li>I consent to the company conducting background checks including but not limited to:
                            <ul>
                                <li>Education verification through respective institutions</li>
                                <li>Previous employment verification</li>
                                <li>Address verification</li>
                                <li>Criminal record check</li>
                                <li>Identity verification through government databases</li>
                            </ul>
                        </li>
                        <li>I understand that the verification process is mandatory and my employment is subject to satisfactory completion of this BGV process.</li>
                    </ol>
                </div>
                <div class="bgv-declare-check">
                    <label>
                        <input type="checkbox" id="bgv_declare" ${d?.agreed ? 'checked' : ''}>
                        <span>I have read, understood, and agree to the above declaration. I confirm that all details provided are accurate and verifiable.</span>
                    </label>
                </div>
            </div>

            <div class="bgv-summary-note">
                <i class="fas fa-info-circle"></i>
                <p>By clicking <strong>"Submit BGV"</strong>, your form will be sent to HR for verification. You will not be able to make changes after submission.</p>
            </div>
        </div>`;
}

// ===== UTILITY =====
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}
