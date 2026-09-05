import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const problems = sqliteTable(
  'problems',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    body: text('body').notNull(),
    created: integer('created').notNull(),
  },
  (t) => [index('idx_problems_owner_created').on(t.owner, t.created)],
);
export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    problemId: text('problem_id').notNull(),
    language: text('language').notNull(),
    code: text('code').notNull(),
    verdict: text('verdict').notNull(),
    passed: integer('passed').notNull(),
    total: integer('total').notNull(),
    created: integer('created').notNull(),
  },
  (t) => [
    index('idx_submissions_owner_problem_created').on(
      t.owner,
      t.problemId,
      t.created,
    ),
  ],
);
export const usage = sqliteTable('usage', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
});
