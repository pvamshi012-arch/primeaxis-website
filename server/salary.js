/**
 * Indian Salary Breakup Calculator
 * Compliant with Indian payroll standards (PF, ESI, PT, TDS)
 * Based on: Telangana state rules for Professional Tax
 */

// Indian number formatting (₹1,23,456)
function formatINR(amount) {
    if (amount === null || amount === undefined) return '₹0';
    const num = Math.round(amount);
    const str = num.toString();
    if (str.length <= 3) return '₹' + str;
    let lastThree = str.substring(str.length - 3);
    let remaining = str.substring(0, str.length - 3);
    if (remaining !== '') lastThree = ',' + lastThree;
    return '₹' + remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
}

// CTC Breakup — Indian Standard
function breakdownCTC(annualCTC) {
    const monthlyCTC = annualCTC / 12;

    // Basic: 40% of CTC
    const basicAnnual = Math.round(annualCTC * 0.40);
    const basicMonthly = Math.round(basicAnnual / 12);

    // HRA: 50% of Basic (metro city — Hyderabad)
    const hraAnnual = Math.round(basicAnnual * 0.50);
    const hraMonthly = Math.round(hraAnnual / 12);

    // Employer PF: 12% of Basic (capped at ₹15,000 base)
    const pfBase = Math.min(basicMonthly, 15000);
    const employerPFMonthly = Math.round(pfBase * 0.12);
    const employerPFAnnual = employerPFMonthly * 12;

    // Employer ESI: 3.25% of Gross (only if monthly gross ≤ ₹21,000)
    // We'll calculate after determining gross
    // Gratuity: (Basic/26) × 15 / 12 per month
    const gratuityMonthly = Math.round((basicMonthly / 26) * 15 / 12);
    const gratuityAnnual = gratuityMonthly * 12;

    // Special Allowance = CTC - Basic - HRA - Employer PF - Gratuity
    const specialAllowanceAnnual = annualCTC - basicAnnual - hraAnnual - employerPFAnnual - gratuityAnnual;
    const specialAllowanceMonthly = Math.round(specialAllowanceAnnual / 12);

    // Gross Salary (what employee sees before deductions)
    const grossMonthly = basicMonthly + hraMonthly + specialAllowanceMonthly;
    const grossAnnual = grossMonthly * 12;

    // Employee PF: 12% of Basic (same base as employer)
    const employeePFMonthly = Math.round(pfBase * 0.12);
    const employeePFAnnual = employeePFMonthly * 12;

    // ESI (only if gross ≤ ₹21,000/month)
    let employeeESIMonthly = 0;
    let employerESIMonthly = 0;
    if (grossMonthly <= 21000) {
        employeeESIMonthly = Math.round(grossMonthly * 0.0075);
        employerESIMonthly = Math.round(grossMonthly * 0.0325);
    }

    // Professional Tax (Telangana)
    let professionalTaxMonthly = 0;
    if (grossMonthly <= 15000) professionalTaxMonthly = 0;
    else if (grossMonthly <= 20000) professionalTaxMonthly = 150;
    else professionalTaxMonthly = 200;

    // TDS (approximate, new regime 2024-25+)
    const tdsAnnual = calculateTDS(grossAnnual);
    const tdsMonthly = Math.round(tdsAnnual / 12);

    // Net salary
    const totalDeductionsMonthly = employeePFMonthly + employeeESIMonthly + professionalTaxMonthly + tdsMonthly;
    const netMonthly = grossMonthly - totalDeductionsMonthly;
    const netAnnual = netMonthly * 12;

    return {
        annual: {
            ctc: annualCTC,
            basic: basicAnnual,
            hra: hraAnnual,
            specialAllowance: specialAllowanceAnnual,
            grossSalary: grossAnnual,
            employerPF: employerPFAnnual,
            employerEPF: (employerPFMonthly - Math.min(Math.round(pfBase * 0.0833), 1250)) * 12,
            employerEPS: Math.min(Math.round(pfBase * 0.0833), 1250) * 12,
            employerESI: employerESIMonthly * 12,
            gratuity: gratuityAnnual,
            employeePF: employeePFAnnual,
            employeeESI: employeeESIMonthly * 12,
            professionalTax: professionalTaxMonthly * 12,
            tds: tdsAnnual,
            totalDeductions: totalDeductionsMonthly * 12,
            netSalary: netAnnual
        },
        monthly: {
            ctc: Math.round(monthlyCTC),
            basic: basicMonthly,
            hra: hraMonthly,
            specialAllowance: specialAllowanceMonthly,
            grossSalary: grossMonthly,
            employerPF: employerPFMonthly,
            employerEPF: employerPFMonthly - Math.min(Math.round(pfBase * 0.0833), 1250),
            employerEPS: Math.min(Math.round(pfBase * 0.0833), 1250),
            employerESI: employerESIMonthly,
            gratuity: gratuityMonthly,
            employeePF: employeePFMonthly,
            employeeESI: employeeESIMonthly,
            professionalTax: professionalTaxMonthly,
            tds: tdsMonthly,
            totalDeductions: totalDeductionsMonthly,
            netSalary: netMonthly
        }
    };
}

// Surcharge slabs (FY 2024-25+) — applied on TAX (not income) before cess
// Old regime: 10%/15%/25%/37%; New regime caps surcharge at 25%
function calculateSurcharge(taxableIncome, taxBeforeSurcharge, regime) {
    if (taxableIncome <= 5000000) return 0;
    let rate = 0;
    if (taxableIncome <= 10000000) rate = 0.10;
    else if (taxableIncome <= 20000000) rate = 0.15;
    else if (taxableIncome <= 50000000) rate = (regime === 'new') ? 0.25 : 0.25;
    else rate = (regime === 'new') ? 0.25 : 0.37;

    let surcharge = taxBeforeSurcharge * rate;

    // Marginal relief at each threshold: surcharge + tax cannot exceed (income above threshold) + (tax at threshold without surcharge)
    const thresholds = [5000000, 10000000, 20000000, 50000000];
    for (const t of thresholds) {
        if (taxableIncome > t) {
            // Tax at threshold (without surcharge)
            const taxAtThreshold = taxBeforeSurcharge * (t / taxableIncome);
            const incomeOver = taxableIncome - t;
            const maxTotalTax = taxAtThreshold + incomeOver;
            const totalTax = taxBeforeSurcharge + surcharge;
            if (totalTax > maxTotalTax) {
                surcharge = Math.max(0, maxTotalTax - taxBeforeSurcharge);
            }
        }
    }
    return Math.round(surcharge);
}

// TDS Calculation — New Tax Regime (FY 2024-25+)
function calculateTDS(annualGross, regime = 'new', totalExemptions = 0) {
    if (regime === 'old') {
        return calculateTDSOldRegime(annualGross, totalExemptions);
    }
    // New Regime: standard deduction only
    const standardDeduction = 75000;
    let taxableIncome = annualGross - standardDeduction;
    if (taxableIncome <= 0) return 0;

    // New regime slabs
    let tax = 0;
    const slabs = [
        { limit: 300000, rate: 0 },
        { limit: 700000, rate: 0.05 },
        { limit: 1000000, rate: 0.10 },
        { limit: 1200000, rate: 0.15 },
        { limit: 1500000, rate: 0.20 },
        { limit: Infinity, rate: 0.30 }
    ];

    let remaining = taxableIncome;
    let prevLimit = 0;

    for (const slab of slabs) {
        const slabAmount = Math.min(remaining, slab.limit - prevLimit);
        if (slabAmount <= 0) break;
        tax += slabAmount * slab.rate;
        remaining -= slabAmount;
        prevLimit = slab.limit;
    }

    // Section 87A rebate: No tax if taxable income ≤ ₹7,00,000 (new regime FY 2024-25)
    if (taxableIncome <= 700000) {
        tax = 0;
    } else {
        // Marginal relief at ₹7L: tax cannot exceed (income - 7,00,000)
        const incomeOver7L = taxableIncome - 700000;
        if (tax > incomeOver7L) tax = incomeOver7L;
    }

    // Surcharge (on tax, before cess)
    const surcharge = calculateSurcharge(taxableIncome, tax, 'new');
    tax += surcharge;

    // Health & Education Cess: 4%
    tax = Math.round(tax * 1.04);

    return tax;
}

// TDS Calculation — Old Tax Regime (with all deductions/exemptions)
function calculateTDSOldRegime(annualGross, totalExemptions) {
    // Old regime: standard deduction ₹50,000 + declared exemptions
    const standardDeduction = 50000;
    let taxableIncome = annualGross - standardDeduction - (totalExemptions || 0);
    if (taxableIncome <= 0) return 0;

    // Old regime slabs (FY 2024-25+)
    let tax = 0;
    const slabs = [
        { limit: 250000, rate: 0 },
        { limit: 500000, rate: 0.05 },
        { limit: 1000000, rate: 0.10 },
        { limit: Infinity, rate: 0.30 }
    ];

    let remaining = taxableIncome;
    let prevLimit = 0;

    for (const slab of slabs) {
        const slabAmount = Math.min(remaining, slab.limit - prevLimit);
        if (slabAmount <= 0) break;
        tax += slabAmount * slab.rate;
        remaining -= slabAmount;
        prevLimit = slab.limit;
    }

    // Section 87A rebate: No tax if taxable income ≤ ₹5,00,000 (old regime)
    if (taxableIncome <= 500000) tax = 0;

    // Surcharge (on tax, before cess)
    const surcharge = calculateSurcharge(taxableIncome, tax, 'old');
    tax += surcharge;

    // Health & Education Cess: 4%
    tax = Math.round(tax * 1.04);

    return tax;
}

// Calculate payslip for a specific month
// Options:
//   regime: 'old' | 'new'
//   totalExemptions: declared 80C/HRA/etc. (old regime only)
//   extraTaxableIncome: bonuses, joining bonus etc. (annual)
//   voluntaryPF: extra VPF deducted monthly (over and above statutory 12%)
//   npsEmployee: 80CCD(1B) — employee NPS contribution monthly (old regime tax benefit)
//   npsEmployer: 80CCD(2) — employer NPS contribution monthly (deductible in BOTH regimes, capped at 10% of basic)
function calculatePayslip(annualCTC, workingDays, presentDays, options = {}) {
    const regime = options.regime || 'new';
    const totalExemptions = options.totalExemptions || 0;
    const extraTaxableIncome = options.extraTaxableIncome || 0;
    const voluntaryPF = Math.max(0, options.voluntaryPF || 0);
    const npsEmployee = Math.max(0, options.npsEmployee || 0);
    const npsEmployerInput = Math.max(0, options.npsEmployer || 0);

    const monthlyCTC = annualCTC / 12;

    // Basic: 40% of CTC
    const basicMonthly = Math.round(annualCTC * 0.40 / 12);
    // HRA: 50% of Basic (metro)
    const hraMonthly = Math.round(basicMonthly * 0.50);

    // Employer PF (statutory cap on ₹15,000 base)
    const pfBase = Math.min(basicMonthly, 15000);
    const employerPFMonthly = Math.round(pfBase * 0.12);
    // EPS split (Employees' Pension Scheme) — 8.33% of pfBase, capped at ₹1,250
    const epsMonthly = Math.min(Math.round(pfBase * 0.0833), 1250);
    // EPF portion of employer's 12% = total - EPS
    const employerEPFMonthly = employerPFMonthly - epsMonthly;
    // Employer NPS — capped at 10% of Basic (Sec 80CCD(2))
    const npsEmployerMonthly = Math.min(npsEmployerInput, Math.round(basicMonthly * 0.10));

    // Gratuity
    const gratuityMonthly = Math.round((basicMonthly / 26) * 15 / 12);

    // Special Allowance (balancer; reduce when employer NPS is part of CTC)
    const specialAllowanceMonthly =
        Math.round(monthlyCTC) - basicMonthly - hraMonthly - employerPFMonthly - gratuityMonthly - npsEmployerMonthly;

    // Gross
    const grossMonthly = basicMonthly + hraMonthly + Math.max(0, specialAllowanceMonthly);
    const grossAnnual = grossMonthly * 12;

    // Tax-deductible exemptions for old regime: declared + employer NPS + employee NPS (80CCD(1B) up to ₹50K/yr)
    // For new regime: only employer NPS under 80CCD(2) is deductible
    const npsEmployeeAnnualCap = Math.min(npsEmployee * 12, 50000);
    let effectiveExemptions = 0;
    if (regime === 'old') {
        effectiveExemptions = totalExemptions + (npsEmployerMonthly * 12) + npsEmployeeAnnualCap;
    } else {
        effectiveExemptions = npsEmployerMonthly * 12;
    }

    // TDS using regime + effective exemptions + extra taxable income (bonuses)
    // For new regime, exemptions are passed as a "deduction" via the new TDS path below
    const tdsAnnual = (regime === 'old')
        ? calculateTDS(grossAnnual + extraTaxableIncome, 'old', effectiveExemptions)
        : calculateTDS(grossAnnual + extraTaxableIncome - effectiveExemptions, 'new', 0);
    const tdsMonthly = Math.round(tdsAnnual / 12);

    // ESI threshold (₹21,000 monthly gross)
    let employeeESIMonthly = 0;
    if (grossMonthly <= 21000) {
        employeeESIMonthly = Math.round(grossMonthly * 0.0075);
    }

    // Professional Tax (Telangana)
    let professionalTaxMonthly = 0;
    if (grossMonthly <= 15000) professionalTaxMonthly = 0;
    else if (grossMonthly <= 20000) professionalTaxMonthly = 150;
    else professionalTaxMonthly = 200;

    // LOP pro-rata ratio
    const ratio = workingDays > 0 ? presentDays / workingDays : 0;

    const earnings = {
        basic: Math.round(basicMonthly * ratio),
        hra: Math.round(hraMonthly * ratio),
        specialAllowance: Math.round(Math.max(0, specialAllowanceMonthly) * ratio),
    };
    earnings.grossEarnings = earnings.basic + earnings.hra + earnings.specialAllowance;

    // Deductions based on actual earnings
    const actualPfBase = Math.min(earnings.basic, 15000);
    const employeePFMonthly = Math.round(actualPfBase * 0.12);
    const deductions = {
        employeePF: employeePFMonthly,
        voluntaryPF: voluntaryPF,
        npsEmployee: npsEmployee,
        employeeESI: earnings.grossEarnings <= 21000 ? Math.round(earnings.grossEarnings * 0.0075) : 0,
        professionalTax: professionalTaxMonthly,
        tds: Math.round(tdsMonthly * ratio),
    };
    deductions.totalDeductions =
        deductions.employeePF +
        deductions.voluntaryPF +
        deductions.npsEmployee +
        deductions.employeeESI +
        deductions.professionalTax +
        deductions.tds;

    const lossOfPay = Math.round(grossMonthly - earnings.grossEarnings);

    return {
        workingDays,
        presentDays,
        lossOfPayDays: workingDays - presentDays,
        lossOfPay,
        regime,
        totalExemptions,
        effectiveExemptions,
        tdsAnnual,
        earnings,
        deductions,
        netPay: earnings.grossEarnings - deductions.totalDeductions,
        // Employer side (informational, not deducted from employee)
        employerPF: employerPFMonthly,        // Total employer PF contribution
        employerEPF: employerEPFMonthly,       // EPF portion (3.67%)
        employerEPS: epsMonthly,               // EPS portion (8.33%, capped ₹1,250)
        employerESI: earnings.grossEarnings <= 21000 ? Math.round(earnings.grossEarnings * 0.0325) : 0,
        employerNPS: npsEmployerMonthly,
        gratuityMonthly,
    };
}

// Convert number to Indian Rupees in words
function numberToWords(num) {
    if (!num || num === 0) return 'Zero';
    num = Math.round(Math.abs(num));
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function twoDigits(n) {
        if (n < 20) return ones[n];
        return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    }
    function threeDigits(n) {
        if (n >= 100) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + twoDigits(n % 100) : '');
        return twoDigits(n);
    }
    // Indian numbering system: crore, lakh, thousand
    if (num >= 10000000) return threeDigits(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
    if (num >= 100000) return twoDigits(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
    if (num >= 1000) return twoDigits(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
    return threeDigits(num);
}

function amountInWords(num) {
    return 'Rupees ' + numberToWords(num) + ' Only';
}

module.exports = { breakdownCTC, calculateTDS, calculatePayslip, formatINR, numberToWords, amountInWords };
