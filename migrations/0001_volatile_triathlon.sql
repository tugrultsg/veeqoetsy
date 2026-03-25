CREATE TABLE `setup_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`customer_id` integer NOT NULL,
	`shop_name` text NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`shop_id` integer,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setup_tokens_token_unique` ON `setup_tokens` (`token`);