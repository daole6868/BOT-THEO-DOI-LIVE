-- Ràng buộc bảo mật & toàn vẹn dữ liệu bổ sung (ngoài những gì Prisma tự sinh)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) Số dư tài khoản người dùng & escrow không bao giờ âm (chốt chặn cuối ở tầng DB)
ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "ledger_accounts_non_negative"
  CHECK ("kind" NOT IN ('USER_AVAILABLE', 'USER_PENDING_WITHDRAWAL', 'ESCROW') OR "balance" >= 0);

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "variant_price_positive" CHECK ("price" > 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "variant_units_positive" CHECK ("unitsPerPurchase" >= 1);
ALTER TABLE "orders" ADD CONSTRAINT "order_amounts_valid" CHECK ("total" > 0 AND "qty" > 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "total");
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawal_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "deposits" ADD CONSTRAINT "deposit_amount_positive" CHECK ("amountExpected" > 0);
ALTER TABLE "reviews" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "comments" ADD CONSTRAINT "comment_depth_range" CHECK ("depth" IN (0, 1));
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "adjustment_four_eyes" CHECK ("decidedById" IS NULL OR "decidedById" <> "requestedById");

-- 2) Sổ cái & nhật ký kiểm toán là bất biến: cấm UPDATE/DELETE
CREATE OR REPLACE FUNCTION mmo_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Bảng % là bất biến: không được % dữ liệu', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION mmo_forbid_mutation();
CREATE TRIGGER ledger_transactions_immutable BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION mmo_forbid_mutation();
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION mmo_forbid_mutation();

-- 3) Mỗi giao dịch sổ cái phải cân: tổng Nợ = tổng Có (kiểm tra lúc COMMIT)
CREATE OR REPLACE FUNCTION mmo_check_ledger_balanced() RETURNS trigger AS $$
DECLARE
  diff numeric;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN "side" = 'D' THEN "amount" ELSE -"amount" END), 0)
    INTO diff FROM "ledger_entries" WHERE "transactionId" = NEW."transactionId";
  IF diff <> 0 THEN
    RAISE EXCEPTION 'Giao dịch sổ cái % không cân (lệch %)', NEW."transactionId", diff;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION mmo_check_ledger_balanced();

-- 4) Chỉ mục tìm kiếm & lọc
CREATE INDEX "products_search_trgm" ON "products" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX "products_attrs_gin" ON "products" USING GIN ("attrs" jsonb_path_ops);
CREATE INDEX "request_posts_search_trgm" ON "request_posts" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX "stock_items_available" ON "stock_items" ("productId", "createdAt") WHERE "status" = 'AVAILABLE';
CREATE INDEX "escrow_due" ON "escrow_holds" ("releaseAt") WHERE "status" = 'HOLDING';
