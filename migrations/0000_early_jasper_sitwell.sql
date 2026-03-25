CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`veeqo_api_key` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_name_unique` ON `customers` (`name`);--> statement-breakpoint
CREATE TABLE `etsy_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `etsy_tokens_shop_id_unique` ON `etsy_tokens` (`shop_id`);--> statement-breakpoint
CREATE TABLE `inventory_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`sku` text NOT NULL,
	`etsy_listing_id` integer,
	`etsy_product_id` integer,
	`veeqo_product_id` integer,
	`veeqo_sellable_id` integer,
	`last_synced_stock` integer,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_shop_sku` ON `inventory_map` (`shop_id`,`sku`);--> statement-breakpoint
CREATE TABLE `shops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`name` text NOT NULL,
	`etsy_api_key` text NOT NULL,
	`etsy_shop_id` integer,
	`etsy_user_id` integer,
	`veeqo_channel_id` integer NOT NULL,
	`veeqo_warehouse_id` integer NOT NULL,
	`veeqo_delivery_method_id` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`sync_type` text NOT NULL,
	`last_sync_at` text,
	`last_value` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_shop_sync_type` ON `sync_cursors` (`shop_id`,`sync_type`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`sync_type` text NOT NULL,
	`status` text NOT NULL,
	`summary` text,
	`error_message` text,
	`duration_ms` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sync_logs_shop_created` ON `sync_logs` (`shop_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `synced_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`etsy_receipt_id` integer NOT NULL,
	`veeqo_order_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`etsy_order_total` integer,
	`error_message` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_shop_receipt` ON `synced_orders` (`shop_id`,`etsy_receipt_id`);--> statement-breakpoint
CREATE TABLE `synced_shipments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop_id` integer NOT NULL,
	`etsy_receipt_id` integer NOT NULL,
	`veeqo_order_id` integer NOT NULL,
	`tracking_number` text,
	`carrier` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_shop_shipment` ON `synced_shipments` (`shop_id`,`veeqo_order_id`);