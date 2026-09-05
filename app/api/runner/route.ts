// Public runtime shell contains no user data, cookies or API credentials.
export async function GET() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><script>
let worker,port;
addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='connect'||port)return;port=event.ports[0];if(!port)return;port.onmessage=({data})=>{if(data.type==='init'){worker=new Worker(URL.createObjectURL(new Blob([data.workerSource],{type:'text/javascript'})));worker.onmessage=e=>port.postMessage(e.data);worker.onerror=()=>port.postMessage({type:'error',error:'Runner failed to start.'});worker.postMessage({type:'init',language:data.language});}else if(data.type==='run')worker.postMessage(data);};port.start();port.postMessage({type:'connected'});});
</script>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; worker-src blob:; connect-src https://cdn.jsdelivr.net; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
