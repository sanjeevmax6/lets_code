import { z } from 'zod';
const text = z.string().min(1).max(12000);
export const CaseSchema = z.object({
  args: z.array(z.json()).max(12),
  expected: z.json(),
  label: z.string().max(100),
});
export const ProblemSchema = z
  .object({
    id: z.string().max(100),
    title: z.string().min(1).max(160),
    difficulty: z.enum(['Easy', 'Medium', 'Hard']),
    tags: z.array(z.string().max(50)).max(8),
    statement: text,
    constraints: z.array(text).min(1).max(12),
    assumptions: z.array(text).max(12),
    parameters: z.array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)).max(12),
    starter: z.object({ python: text, javascript: text }),
    reference: z.object({ python: text, javascript: text }),
    hints: z.array(text).min(1).max(6),
    explanation: text,
    complexity: text,
    comparison: z.enum(['exact', 'unordered']),
    tests: z.array(CaseSchema).min(3).max(80),
    sources: z
      .array(
        z.object({
          title: z.string().max(300),
          url: z.url().refine((v) => v.startsWith('https://')),
        }),
      )
      .max(8),
    verification: z.enum(['built-in', 'draft', 'reference-checked']),
  })
  .superRefine((p, c) => {
    p.tests.forEach((t, i) => {
      if (t.args.length !== p.parameters.length)
        c.addIssue({
          code: 'custom',
          message: 'Test arguments must match parameters',
          path: ['tests', i, 'args'],
        });
    });
  });
export type Problem = z.infer<typeof ProblemSchema>;
export type TestCase = z.infer<typeof CaseSchema>;
export type Language = 'python' | 'javascript';
export type Result = {
  label: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
  error?: string;
  stdout?: string;
  duration: number;
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'undefined';
}
export function equal(actual: unknown, expected: unknown, mode: string) {
  if (mode === 'unordered' && Array.isArray(actual) && Array.isArray(expected))
    return (
      canonical(actual.map(canonical).sort()) ===
      canonical(expected.map(canonical).sort())
    );
  return canonical(actual) === canonical(expected);
}
