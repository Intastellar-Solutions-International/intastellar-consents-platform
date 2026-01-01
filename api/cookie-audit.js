import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  const { domain } = req.query;
  if (!domain) {
    res.status(400).json({ error: 'Missing domain query parameter' });
    return;
  }
  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.goto(`https://${domain}`, { waitUntil: 'networkidle2', timeout: 30000 });
    const cookies = await page.cookies();
    await browser.close();
    res.status(200).json({ domain, cookies });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
}
