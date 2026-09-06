const $ = id => document.getElementById(id);
let record = null;
let recordUrl = null;
async function activeTab() { return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]; }
function safeLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
async function request(action) {
  const tab = await activeTab();
  if (!safeLink(tab?.url)) throw new Error('Open an HTTP or HTTPS article and click the extension icon first.');
  const result = await chrome.runtime.sendNativeMessage('org.research_library.reader', { action, url: tab.url });
  if (result.error) throw new Error(result.error);
  return { result, url: tab.url };
}
async function refresh() {
  $('status').textContent = 'Looking in your library…';
  $('result').hidden = true;
  record = null;
  try {
    const { result, url } = await request('lookup');
    if (!result.found) { $('status').textContent = 'This page is not saved yet. Add it to the queue to read later.'; return; }
    record = result; recordUrl = url;
    $('result').hidden = false;
    $('status').textContent = 'Saved source found.';
    $('title').textContent = result.title;
    $('coverage').textContent = `${result.coverage} coverage · ${result.status}`;
    $('summary').textContent = result.summary || 'Queued for agent analysis. No summary is available yet.';
    $('highlights').replaceChildren();
    for (const highlight of result.highlights) {
      const card = document.createElement('section'); card.className = 'card';
      const text = document.createElement('p'); text.textContent = highlight.text;
      const quote = document.createElement('blockquote'); quote.textContent = highlight.evidence.quote;
      card.append(text, quote); $('highlights').append(card);
    }
    $('related').replaceChildren();
    for (const related of result.related) {
      const li = document.createElement('li');
      const url = safeLink(related.url);
      if (url) { const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = related.title; li.append(link); }
      else li.textContent = related.title;
      $('related').append(li);
    }
    if (!result.related.length) { const li = document.createElement('li'); li.textContent = 'Connections will appear as your library grows.'; $('related').append(li); }
    $('obsidian').href = result.obsidian_url.startsWith('obsidian://open?') ? result.obsidian_url : '#';
    $('generated').textContent = result.provenance ? `Analyzed ${result.provenance.generated_at}` : '';
    $('highlight').disabled = !result.highlights.length;
    $('matches').textContent = '';
  } catch (error) { $('status').textContent = `Could not read the library: ${error.message}. See docs/BROWSER.md for native host setup.`; }
}
$('refresh').addEventListener('click', refresh);
$('save').addEventListener('click', async () => {
  try { await request('enqueue'); $('status').textContent = 'Saved to the local queue. Ask your agent to run the pipeline.'; }
  catch (error) { $('status').textContent = error.message; }
});
$('highlight').addEventListener('click', async () => {
  try {
    const tab = await activeTab();
    if (!record || tab.url !== recordUrl) throw new Error('The active page changed. Click Find this page first.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [record.highlights.map(h => h.evidence)], func: evidence => {
      if (!globalThis.CSS?.highlights || !globalThis.Highlight) return { matched: 0, total: evidence.length, unsupported: true };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest('script,style,noscript,textarea,input') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      const nodes = []; let raw = '', node;
      while ((node = walker.nextNode())) { nodes.push({ node, start: raw.length, end: raw.length + node.length }); raw += node.textContent; }
      const ranges = [];
      for (const ev of evidence) {
        const starts = []; let cursor = 0, index;
        while ((index = raw.indexOf(ev.quote, cursor)) !== -1) { starts.push(index); cursor = index + 1; }
        // Ambiguous quotations remain unmatched unless surrounding text selects one.
        const contextual = starts.filter(start => (!ev.prefix || raw.slice(0,start).endsWith(ev.prefix)) && (!ev.suffix || raw.slice(start+ev.quote.length).startsWith(ev.suffix)));
        const start = contextual.length === 1 ? contextual[0] : starts.length === 1 ? starts[0] : -1;
        if (start < 0) continue;
        const end = start + ev.quote.length;
        const first = nodes.find(n => n.start <= start && start < n.end);
        const last = nodes.find(n => n.start < end && end <= n.end);
        if (!first || !last) continue;
        const range = document.createRange(); range.setStart(first.node, start-first.start); range.setEnd(last.node,end-last.start); ranges.push(range);
      }
      CSS.highlights.set('research-library', new Highlight(...ranges));
      let style = document.getElementById('research-library-highlight-style');
      if (!style) { style = document.createElement('style'); style.id = 'research-library-highlight-style'; document.head.append(style); }
      style.textContent = '::highlight(research-library){background:#ffe29a;color:#202b23;}';
      return { matched: ranges.length, total: evidence.length };
    } });
    $('matches').textContent = result.unsupported ? 'Use the panel for this page; in-page highlighting is unavailable.' : `${result.matched} of ${result.total} quotes located. Unmatched quotes may reflect changed content or a different page layout.`;
  } catch (error) { $('matches').textContent = `Use the panel for this page. ${error.message}`; }
});
// Only explicit actions read the active page. Switching tabs does not expose browsing history.
