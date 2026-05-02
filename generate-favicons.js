const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 96, 144, 180, 192, 512];
const svgContent = fs.readFileSync(path.resolve(__dirname, 'assets', 'logo-icon-new.svg'), 'utf8');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (const size of sizes) {
        const page = await browser.newPage();
        await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
        const html = `<!DOCTYPE html><html><head><style>
            html,body{margin:0;padding:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden}
            svg{width:${size}px;height:${size}px;display:block}
        </style></head><body>${svgContent}</body></html>`;
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const outPath = path.resolve(__dirname, 'assets', `favicon-${size}x${size}.png`);
        await page.screenshot({ path: outPath, omitBackground: true, type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
        console.log(`Generated: favicon-${size}x${size}.png`);
        await page.close();
    }

    await browser.close();
    console.log('All favicons generated!');
})();
