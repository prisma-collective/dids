CREATE TABLE "vc_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_hash" text NOT NULL,
	"tx_index" integer,
	"event" text NOT NULL,
	"issuer_did" text NOT NULL,
	"holder_did" text NOT NULL,
	"validator_did" text,
	"signer_stake_address" text,
	"vc_hash" text NOT NULL,
	"vc_type" text NOT NULL,
	"vc_format" text NOT NULL,
	"reason" text,
	"valid" boolean DEFAULT true NOT NULL,
	"validation_error" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_at_height" bigint,
	"block_height" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"raw_event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vc_events_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE INDEX "idx_vc_hash" ON "vc_events" USING btree ("vc_hash");--> statement-breakpoint
CREATE INDEX "idx_vc_issuer_did" ON "vc_events" USING btree ("issuer_did");--> statement-breakpoint
CREATE INDEX "idx_vc_holder_did" ON "vc_events" USING btree ("holder_did");--> statement-breakpoint
CREATE INDEX "idx_vc_block_height" ON "vc_events" USING btree ("block_height");--> statement-breakpoint
CREATE INDEX "idx_vc_confirmed" ON "vc_events" USING btree ("confirmed") WHERE "vc_events"."confirmed" = false;