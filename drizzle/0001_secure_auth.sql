PRAGMA foreign_keys=ON;
CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `channel` text NOT NULL, `destination` text NOT NULL UNIQUE, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE TABLE `otp_challenges` (`id` text PRIMARY KEY NOT NULL, `channel` text NOT NULL, `destination` text NOT NULL, `code_hash` text NOT NULL, `expires_at` integer NOT NULL, `attempts` integer DEFAULT 0 NOT NULL, `consumed_at` integer, `created_at` integer NOT NULL);
CREATE TABLE `sessions` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `token_hash` text NOT NULL UNIQUE, `expires_at` integer NOT NULL, `created_at` integer NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade);
CREATE INDEX `otp_destination_created_idx` ON `otp_challenges` (`destination`,`created_at`);
