import { z } from 'zod';
import { owner, db, body, respond, failure } from '@/lib/server';
const schema = z
  .object({
    problemId: z.string().max(100),
    language: z.enum(['python', 'javascript']),
    code: z.string().max(30000),
    verdict: z.enum(['Accepted', 'Wrong answer', 'Runtime error']),
    passed: z.number().int().min(0).max(80),
    total: z.number().int().min(1).max(80),
  })
  .refine((v) => v.passed <= v.total);
export async function GET(request: Request) {
  try {
    const user = await owner();
    const id = new URL(request.url).searchParams.get('problemId');
    const rows = await db()
      .prepare(
        'SELECT id,language,code,verdict,passed,total,created FROM submissions WHERE owner=? AND problem_id=? ORDER BY created DESC LIMIT 50',
      )
      .bind(user, id)
      .all();
    return respond({ submissions: rows.results });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await owner(request);
    const s = schema.parse(await body(request));
    await db()
      .prepare(
        'INSERT INTO submissions(id,owner,problem_id,language,code,verdict,passed,total,created) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        crypto.randomUUID(),
        user,
        s.problemId,
        s.language,
        s.code,
        s.verdict,
        s.passed,
        s.total,
        Date.now(),
      )
      .run();
    return respond({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
