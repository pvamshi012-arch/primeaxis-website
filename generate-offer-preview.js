const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

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
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

  // Inject fake token BEFORE portal.js executes (it redirects if no token)
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('primeaxis_token', 'preview-token');
    localStorage.setItem('primeaxis_user', JSON.stringify({ id: 1, name: 'Preview', role: 'admin' }));
  });

  const filePath = path.resolve(__dirname, 'offer-preview.html');
  await page.goto('file://' + filePath, { waitUntil: 'networkidle0', timeout: 30000 });

  // Allow fonts/images to settle
  await page.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 500));

  const outDir = path.resolve(__dirname, 'company pdf');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.resolve(outDir, 'Offer-Letter-Preview.pdf');

  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    scale: 1,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:8px;color:#555;line-height:1.5;-webkit-print-color-adjust:exact;">
        <div style="margin:0 15mm;border-top:1px solid #cbd5e1;padding-top:6px;">
          <div style="text-align:center;"><strong style="color:#0a0f1a">PrimeAxis IT Solutions</strong> &nbsp;|&nbsp; Plot No: 207, Road No: 8, Vasanth Nagar, Near JNTU Metro Station, KPHB, Hyderabad - 500072, Telangana, India</div>
          <div style="text-align:center;margin-top:2px;">Phone: +91 8333079944 &nbsp;|&nbsp; Email: info@primeaxisit.com &nbsp;|&nbsp; Web: www.primeaxisit.com &nbsp;|&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
        </div>
      </div>`,
    margin: { top: '15mm', bottom: '24mm', left: '15mm', right: '15mm' }
  });

  console.log('Preview PDF generated:', outPath);
  await browser.close();
})();
