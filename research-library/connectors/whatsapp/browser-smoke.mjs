import puppeteer from 'puppeteer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const executablePath=process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await puppeteer.launch({executablePath,headless:true});
try {
  const page=await browser.newPage();
  await page.setContent('<title>Research Library smoke test</title><p>Browser works</p>');
  if(await page.title()!=='Research Library smoke test') throw new Error('Browser launch failed');
  const {default:wwebjs}=await import('whatsapp-web.js');
  const client=new wwebjs.Client({puppeteer:{executablePath,headless:true}});
  if(typeof client.initialize!=='function') throw new Error('WhatsApp Client incompatible');
  console.log('Patched Puppeteer launches Chrome; WhatsApp Client constructs successfully. Account pairing not exercised.');
} finally { await browser.close(); }
