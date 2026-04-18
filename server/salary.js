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

    // Section 87A rebate: No tax if taxable income ≤ ₹7,00,000
    if (taxableIncome <= 700000) tax = 0;

    // Cess: 4%
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

    // Section 87A rebate: No tax if taxable income ≤ ₹5,00,000
    if (taxableIncome <= 500000) tax = 0;

    // Cess: 4%
    tax = Math.round(tax * 1.04);

    return tax;
}

// Calculate payslip for a specific month
// Options: { regime: 'old'|'new', totalExemptions: number, extraTaxableIncome: number }
function calculatePayslip(annualCTC, workingDays, presentDays, options = {}) {
    const regime = options.regime || 'new';
    const totalExemptions = options.totalExemptions || 0;
    const extraTaxableIncome = options.extraTaxableIncome || 0;

    const monthlyCTC = annualCTC / 12;

    // Basic: 40% of CTC
    const basicMonthly = Math.round(annualCTC * 0.40 / 12);
    // HRA: 50% of Basic (metro)
    const hraMonthly = Math.round(basicMonthly * 0.50);

    // Employer PF
    const pfBase = Math.min(basicMonthly, 15000);
    const employerPFMonthly = Math.round(pfBase * 0.12);
    // Gratuity
    const gratuityMonthly = Math.round((basicMonthly / 26) * 15 / 12);

    // Special Allowance
    const specialAllowanceMonthly = Math.round(monthlyCTC) - basicMonthly - hraMonthly - employerPFMonthly - gratuityMonthly;

    // Gross
    const grossMonthly = basicMonthly + hraMonthly + specialAllowanceMonthly;
    const grossAnnual = grossMonthly * 12;

    // TDS using regime + exemptions + extra taxable income (bonuses etc.)
    const tdsAnnual = calculateTDS(grossAnnual + extraTaxableIncome, regime, totalExemptions);
    const tdsMonthly = Math.round(tdsAnnual / 12);

    // ESI
    let employeeESIMonthly = 0;
    if (grossMonthly <= 21000) {
        employeeESIMonthly = Math.round(grossMonthly * 0.0075);
    }

    // Professional Tax (Telangana)
    let professionalTaxMonthly = 0;
    if (grossMonthly <= 15000) professionalTaxMonthly = 0;
    else if (grossMonthly <= 20000) professionalTaxMonthly = 150;
    else professionalTaxMonthly = 200;

    const ratio = presentDays / workingDays;

    const earnings = {
        basic: Math.round(basicMonthly * ratio),
        hra: Math.round(hraMonthly * ratio),
        specialAllowance: Math.round(specialAllowanceMonthly * ratio),
    };
    earnings.grossEarnings = earnings.basic + earnings.hra + earnings.specialAllowance;

    // Deductions based on actual earnings
    const actualPfBase = Math.min(earnings.basic, 15000);
    const deductions = {
        employeePF: Math.round(actualPfBase * 0.12),
        employeeESI: earnings.grossEarnings <= 21000 ? Math.round(earnings.grossEarnings * 0.0075) : 0,
        professionalTax: professionalTaxMonthly,
        tds: Math.round(tdsMonthly * ratio),
    };
    deductions.totalDeductions = deductions.employeePF + deductions.employeeESI + deductions.professionalTax + deductions.tds;

    const lossOfPay = Math.round(grossMonthly - earnings.grossEarnings);

    return {
        workingDays,
        presentDays,
        lossOfPayDays: workingDays - presentDays,
        lossOfPay,
        regime,
        totalExemptions,
        tdsAnnual,
        earnings,
        deductions,
        netPay: earnings.grossEarnings - deductions.totalDeductions,
        employerPF: Math.round(actualPfBase * 0.12),
        employerESI: earnings.grossEarnings <= 21000 ? Math.round(earnings.grossEarnings * 0.0325) : 0,
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
