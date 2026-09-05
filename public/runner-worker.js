/* This worker runs only inside an opaque-origin sandbox iframe. No secrets enter it. */
let runtime;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{if(data.language==='python'){importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');runtime=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});} self.postMessage({type:'ready'});}catch(e){self.postMessage({type:'error',error:'Runtime could not load: '+String(e)})}return;
 }
 if(data.type!=='run')return;
 const results=[];
 for(const test of data.tests){let stdout='';const start=performance.now();try{let actual;
  if(data.language==='python'){
   runtime.setStdout({batched:s=>{stdout=(stdout+s+'\n').slice(0,4000)}});
   runtime.setStderr({batched:s=>{stdout=(stdout+s+'\n').slice(0,4000)}});
   runtime.globals.set('__source',data.code);runtime.globals.set('__args',JSON.stringify(test.args));
   const raw=await runtime.runPythonAsync('import json as __json\n__ns = {}\nexec(__source, __ns)\n__value = __ns["solve"](*__json.loads(__args))\n__json.dumps(__value, allow_nan=False)');actual=JSON.parse(raw);
  }else{
   const logger={log:(...v)=>{stdout=(stdout+v.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')+'\n').slice(0,4000)}};
   actual=await new Function('args','console', '"use strict";\n'+data.code+'\n;return solve(...args);')(structuredClone(test.args),logger);
   actual=JSON.parse(JSON.stringify(actual));
  }
  results.push({label:test.label,actual,stdout,duration:performance.now()-start});
 }catch(e){results.push({label:test.label,error:String(e).slice(0,4000),stdout,duration:performance.now()-start})}}
 self.postMessage({type:'result',results});
};
