CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_problems_owner_created` ON `problems` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`problem_id` text NOT NULL,
	`language` text NOT NULL,
	`code` text NOT NULL,
	`verdict` text NOT NULL,
	`passed` integer NOT NULL,
	`total` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_owner_problem_created` ON `submissions` (`owner`,`problem_id`,`created`);--> statement-breakpoint
CREATE TABLE `usage` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
