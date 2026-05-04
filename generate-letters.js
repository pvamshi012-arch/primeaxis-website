// Unified PDF preview generator for offer letter, relieving letter, and payslip.
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const FOOTER_HTML = `
  <div style="width:100%;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:8px;color:#555;line-height:1.5;-webkit-print-color-adjust:exact;">
    <div style="margin:0 15mm;border-top:1px solid #cbd5e1;padding-top:6px;">
      <div style="text-align:center;"><strong style="color:#0a0f1a">PrimeAxis IT Solutions</strong> &nbsp;|&nbsp; Plot No: 207, Road No: 8, Vasanth Nagar, Near JNTU Metro Station, KPHB, Hyderabad - 500072, Telangana, India</div>
      <div style="text-align:center;margin-top:2px;">Phone: +91 8333079944 &nbsp;|&nbsp; Email: info@primeaxisit.com &nbsp;|&nbsp; Web: www.primeaxisit.com &nbsp;|&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
    </div>
  </div>`;

const docs = [
  { html: 'offer-preview.html',     pdf: 'Offer-Letter-Preview.pdf' },
  { html: 'relieving-preview.html', pdf: 'Relieving-Letter-Preview.pdf' },
  { html: 'payslip-preview.html',   pdf: 'Payslip-Preview.pdf' }
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=none',
      '--disable-font-subpixel-positioning',
      '--force-color-profile=srgb'
    ]
  });

  const outDir = path.resolve(__dirname, 'company pdf');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const doc of docs) {
    const filePath = path.resolve(__dirname, doc.html);
    if (!fs.existsSync(filePath)) {
      console.warn('Skipping (not found):', doc.html);
      continue;
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('primeaxis_token', 'preview-token');
      localStorage.setItem('primeaxis_user', JSON.stringify({ id: 1, name: 'Preview', role: 'admin' }));
    });

    await page.goto('file://' + filePath, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluateHandle('document.fonts.ready');

    // Hide inline footers that duplicate the Puppeteer page footer
    await page.addStyleTag({ content: `
      .offer-preview .letter-footer,
      .payslip-preview .ps-company-footer,
      .print-footer { display: none !important; }
    `});

    await new Promise(r => setTimeout(r, 400));

    const outPath = path.resolve(outDir, doc.pdf);
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      scale: 1,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: FOOTER_HTML,
      margin: { top: '15mm', bottom: '24mm', left: '15mm', right: '15mm' }
    });

    console.log('Generated:', outPath);
    await page.close();
  }

  await browser.close();
})();
