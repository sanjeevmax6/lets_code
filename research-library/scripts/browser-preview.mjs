// UI test with a synthetic native-host response. Never opens the user's profile.
import puppeteer from '../connectors/whatsapp/node_modules/puppeteer/lib/puppeteer/puppeteer.js';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=http.createServer((req,res)=>{
  const name=req.url==='/'?'panel.html':req.url.slice(1);
  if(!['panel.html','panel.js','panel.css'].includes(name)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(path.join(root,'extension',name)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
  const page=await browser.newPage();
  await page.setViewport({width:390,height:1050,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{
    window.previewMode='complete';
    window.chrome={tabs:{query:async()=>[{id:1,url:'https://example.org/research'}]},runtime:{sendNativeMessage:async(_host,message)=>{
      if(message.action==='enqueue')return{queued:['item_demo']};
      if(window.previewMode==='missing')return{found:false};
      if(window.previewMode==='error')throw new Error('Native host unavailable');
      return{found:true,title:'Why better batteries need better measurements',coverage:'partial',status:'complete',summary:'This synthetic preview demonstrates how a saved article appears beside the source. The paper distinguishes measured capacity from projected performance.',highlights:[{text:'Reported capacity depends on the measurement conditions.',evidence:{quote:'Measurements must specify temperature and discharge rate.'}},{text:'The findings do not establish long-term durability.',evidence:{quote:'Cycle-life testing remains outside the scope of this study.'}}],related:[{title:'A practical guide to battery degradation',url:'https://example.org/related'}],obsidian_url:'obsidian://open?path=demo',provenance:{generated_at:'2026-09-06T14:00:00Z'}};
    }},scripting:{executeScript:async()=>[{result:{matched:1,total:2}}]}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.click('#refresh');
  await page.waitForSelector('#result:not([hidden])');
  assert.equal(await page.$$eval('.card',nodes=>nodes.length),2);
  await page.click('#highlight');
  assert.match(await page.$eval('#matches',n=>n.textContent),/1 of 2/);
  fs.mkdirSync(path.join(root,'derived/qa'),{recursive:true});
  await page.screenshot({path:path.join(root,'derived/qa/chrome-panel.png'),fullPage:true});
  await page.evaluate(()=>{window.previewMode='missing';});await page.click('#refresh');
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('not saved'));
  await page.click('#save');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Saved to the local queue'));
  await page.evaluate(()=>{window.previewMode='error';});await page.click('#refresh');
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Native host unavailable'));
  console.log('Chrome panel: saved, missing, enqueue, highlight report, and host-error states passed (synthetic host).');
}finally{await browser.close();server.close();}
