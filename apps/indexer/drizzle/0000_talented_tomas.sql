CREATE TABLE "did_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"did" text NOT NULL,
	"tx_hash" text NOT NULL,
	"action" text NOT NULL,
	"version" integer NOT NULL,
	"prev_tx_hash" text,
	"ipfs_cid" text,
	"valid" boolean DEFAULT true NOT NULL,
	"validation_error" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_at_height" bigint,
	"block_height" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"raw_event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "did_events_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" integer NOT NULL,
	"last_block_height" bigint DEFAULT 0 NOT NULL,
	"last_block_hash" text,
	"last_tx_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_state_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE INDEX "idx_did_valid_confirmed_version" ON "did_events" USING btree ("did","version") WHERE "did_events"."valid" = true AND "did_events"."confirmed" = true;--> statement-breakpoint
CREATE INDEX "idx_did_version" ON "did_events" USING btree ("did","version");--> statement-breakpoint
CREATE INDEX "idx_block_height" ON "did_events" USING btree ("block_height");--> statement-breakpoint
CREATE INDEX "idx_confirmed" ON "did_events" USING btree ("confirmed") WHERE "did_events"."confirmed" = false;