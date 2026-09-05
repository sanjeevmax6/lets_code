import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export class ApiError extends Error{constructor(message:string,public status=400){super(message)}}
export function db(){return env.DB}
export async function owner(request?:Request){const user=await getChatGPTUser();if(!user)throw new ApiError('Sign in to save problems or use research.',401);if(request&&request.method!=='GET'){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new ApiError('Request origin is not allowed.',403);}return user.userId}
export async function body(request:Request){
 if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError('Send JSON.',415);
 if(Number(request.headers.get('content-length')||0)>180000)throw new ApiError('Request is too large.',413);
 const reader=request.body?.getReader();if(!reader)throw new ApiError('Missing request body.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>180000){await reader.cancel();throw new ApiError('Request is too large.',413)}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new ApiError('Invalid JSON.')}
}
export function respond(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export function failure(e:unknown){if(e instanceof ApiError)return respond({error:e.message},e.status);if(e instanceof Error&&e.name==='ZodError')return respond({error:'Invalid problem or request. Check field sizes and test arguments.'},400);return respond({error:'The service could not complete this request. Please retry.'},500)}
export async function quota(user:string,kind:string,limit:number){const key=[user,kind,new Date().toISOString().slice(0,10)].join(':');const result=await db().prepare('INSERT INTO usage (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(key,limit).first();if(!result)throw new ApiError('Daily safety limit reached. Try again tomorrow (UTC).',429)}
export function apiKeys(input:{geminiKey?:string;tavilyKey?:string}){const bindings=env as unknown as Record<string,string>;return {gemini:bindings.GEMINI_API_KEY||input.geminiKey||'',tavily:bindings.TAVILY_API_KEY||input.tavilyKey||'',model:bindings.GEMINI_MODEL||'gemini-2.5-flash'}}
export async function gemini(key:string,model:string,prompt:string){if(!key)throw new ApiError('Add your Gemini key in Settings to generate problems.',428);const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.3,maxOutputTokens:14000}}),signal:AbortSignal.timeout(90000)});if(!response.ok)throw new ApiError(response.status===429?'Gemini quota reached. Check your free-tier limits.':'Gemini rejected the request. Check your key and model availability.',response.status===429?429:502);const result=await response.json() as {candidates?:{content?:{parts?:{text?:string}[]}}[]};const raw=result.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');if(!raw)throw new ApiError('The model returned no usable content. Try a more specific prompt.',502);try{return JSON.parse(raw)}catch{throw new ApiError('The model returned incomplete JSON. Please retry.',502)}}
