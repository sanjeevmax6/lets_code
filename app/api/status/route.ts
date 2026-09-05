import { apiKeys, respond, owner, failure } from '@/lib/server';
export async function GET() {
  try {
    await owner();
    const keys = apiKeys({});
    return respond({ gemini: !!keys.gemini, tavily: !!keys.tavily });
  } catch (e) {
    return failure(e);
  }
}
