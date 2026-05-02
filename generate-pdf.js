const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
    });
    const page = await browser.newPage();
    
    // Set 2x device scale for crisp rendering
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
    
    const filePath = path.resolve(__dirname, 'company-profile.html');
    await page.goto('file://' + filePath, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');
    
    await page.pdf({
        path: path.resolve(__dirname, 'company pdf', 'PrimeAxis-IT-Company-Profile.pdf'),
        width: '1280px',
        height: '720px',
        printBackground: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true
    });
    
    console.log('PDF generated successfully!');
    await browser.close();
})();
