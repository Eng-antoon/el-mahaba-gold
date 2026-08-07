-- Complete the gold-shop ledger around atomic, server-calculated transactions.

-- Confirmed demo data cleanup. User/auth records and reference categories stay intact.
DELETE FROM public.audit_log
WHERE table_name IN ('transaction_lines', 'transactions', 'merchants', 'gold_prices');
DELETE FROM public.transaction_lines;
DELETE FROM public.transactions;
DELETE FROM public.merchants;

-- Gold prices are transaction-specific; there is no global price history.
DROP TABLE IF EXISTS public.gold_prices CASCADE;

CREATE TYPE public.txn_status AS ENUM ('posted', 'voided');

ALTER TABLE public.transactions
  ADD COLUMN status public.txn_status NOT NULL DEFAULT 'posted',
  ADD COLUMN updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN void_reason TEXT,
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ALTER COLUMN total_gold_21 TYPE NUMERIC(14,2),
  ADD CONSTRAINT transactions_transfer_party_check CHECK (
    (kind = 'transfer' AND counterparty_merchant_id IS NOT NULL AND counterparty_merchant_id <> merchant_id)
    OR (kind <> 'transfer' AND counterparty_merchant_id IS NULL)
  ),
  ADD CONSTRAINT transactions_void_state_check CHECK (
    (status = 'posted' AND void_reason IS NULL AND voided_at IS NULL AND voided_by IS NULL)
    OR (status = 'voided' AND length(btrim(void_reason)) > 0 AND voided_at IS NOT NULL AND voided_by IS NOT NULL)
  );

ALTER TABLE public.transaction_lines
  ALTER COLUMN weight TYPE NUMERIC(12,2),
  ALTER COLUMN weight_21 TYPE NUMERIC(14,2),
  ALTER COLUMN gold_delta TYPE NUMERIC(14,2);

CREATE INDEX transactions_counterparty_date_idx
  ON public.transactions(counterparty_merchant_id, txn_date DESC)
  WHERE counterparty_merchant_id IS NOT NULL;
CREATE INDEX transactions_status_date_idx ON public.transactions(status, txn_date DESC);
CREATE INDEX transactions_created_by_idx ON public.transactions(created_by);
CREATE INDEX transactions_updated_by_idx ON public.transactions(updated_by);
CREATE INDEX transactions_voided_by_idx ON public.transactions(voided_by);
CREATE INDEX merchants_created_by_idx ON public.merchants(created_by);
CREATE INDEX transaction_lines_category_idx ON public.transaction_lines(category_id);

-- Keep direct reads, but all transaction writes must use the controlled APIs below.
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transaction_lines FROM authenticated;

-- The role lookup only reads a table already visible to authenticated users; it does not need definer rights.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()) OR (SELECT public.has_role((SELECT auth.uid()), 'admin')))
WITH CHECK (id = (SELECT auth.uid()) OR (SELECT public.has_role((SELECT auth.uid()), 'admin')));

DROP POLICY IF EXISTS merchants_delete_admin ON public.merchants;
CREATE POLICY merchants_delete_admin ON public.merchants
FOR DELETE TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin')));

DROP POLICY IF EXISTS transactions_delete_admin ON public.transactions;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.save_transaction(
  _transaction_id UUID,
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_id UUID;
  v_merchant UUID;
  v_counterparty UUID;
  v_kind public.txn_kind;
  v_date DATE;
  v_price NUMERIC(14,2);
  v_notes TEXT;
  v_line JSONB;
  v_method public.pay_method;
  v_category UUID;
  v_label TEXT;
  v_purity NUMERIC(8,2);
  v_weight NUMERIC(12,2);
  v_pieces INT;
  v_rate NUMERIC(14,2);
  v_amount NUMERIC(16,2);
  v_w21 NUMERIC(14,2);
  v_cash_amount NUMERIC(16,2);
  v_gold_delta NUMERIC(14,2);
  v_cash_delta NUMERIC(16,2);
  v_total_gold NUMERIC(14,2) := 0;
  v_total_cash NUMERIC(16,2) := 0;
  v_sort INT := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF jsonb_typeof(_payload->'lines') <> 'array' OR jsonb_array_length(_payload->'lines') = 0 THEN
    RAISE EXCEPTION 'أضف بند واحد على الأقل';
  END IF;

  v_merchant := (_payload->>'merchant_id')::UUID;
  v_kind := (_payload->>'kind')::public.txn_kind;
  v_date := COALESCE(NULLIF(_payload->>'txn_date', '')::DATE, CURRENT_DATE);
  v_price := NULLIF(_payload->>'gold_price_used', '')::NUMERIC;
  v_notes := NULLIF(btrim(_payload->>'notes'), '');
  v_counterparty := NULLIF(_payload->>'counterparty_merchant_id', '')::UUID;

  IF NOT EXISTS (SELECT 1 FROM public.merchants WHERE id = v_merchant AND is_active) THEN
    RAISE EXCEPTION 'التاجر غير موجود أو غير نشط';
  END IF;
  IF v_kind = 'transfer' THEN
    IF v_counterparty IS NULL OR v_counterparty = v_merchant THEN
      RAISE EXCEPTION 'اختار تاجرين مختلفين للتحويل';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.merchants WHERE id = v_counterparty AND is_active) THEN
      RAISE EXCEPTION 'التاجر المحول له غير موجود أو غير نشط';
    END IF;
  ELSE
    v_counterparty := NULL;
  END IF;

  IF v_kind IN ('purchase', 'sale') AND COALESCE(v_price, 0) <= 0 THEN
    RAISE EXCEPTION 'اكتب سعر جرام عيار 21 لهذه الحركة';
  END IF;

  IF _transaction_id IS NULL THEN
    INSERT INTO public.transactions (
      merchant_id, counterparty_merchant_id, kind, txn_date, gold_price_used,
      notes, created_by, updated_by
    ) VALUES (
      v_merchant, v_counterparty, v_kind, v_date, v_price,
      v_notes, v_actor, v_actor
    ) RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id
    FROM public.transactions
    WHERE id = _transaction_id AND status = 'posted'
    FOR UPDATE;
    IF v_id IS NULL THEN RAISE EXCEPTION 'الحركة غير موجودة أو ملغاة'; END IF;
    DELETE FROM public.transaction_lines WHERE transaction_id = v_id;
    UPDATE public.transactions SET
      merchant_id = v_merchant,
      counterparty_merchant_id = v_counterparty,
      kind = v_kind,
      txn_date = v_date,
      gold_price_used = v_price,
      notes = v_notes,
      updated_by = v_actor
    WHERE id = v_id;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    v_category := NULLIF(v_line->>'category_id', '')::UUID;
    v_method := NULLIF(v_line->>'method', '')::public.pay_method;
    v_purity := COALESCE(NULLIF(v_line->>'purity', '')::NUMERIC, 875);
    v_weight := round(COALESCE(NULLIF(v_line->>'weight', '')::NUMERIC, 0), 2);
    v_pieces := NULLIF(v_line->>'pieces', '')::INT;
    v_rate := round(COALESCE(NULLIF(v_line->>'rate', '')::NUMERIC, 0), 2);
    v_amount := round(COALESCE(NULLIF(v_line->>'amount', '')::NUMERIC, 0), 2);

    IF v_weight < 0 OR v_rate < 0 OR v_amount < 0 OR v_purity < 500 OR v_purity > 1000 THEN
      RAISE EXCEPTION 'راجع الوزن والعيار والقيمة؛ العيار لازم يكون بين 500 و1000';
    END IF;
    IF v_pieces IS NOT NULL AND v_pieces < 0 THEN RAISE EXCEPTION 'العدد غير صحيح'; END IF;

    v_w21 := round(v_weight * v_purity / 875, 2);
    v_cash_amount := 0;
    v_gold_delta := 0;
    v_cash_delta := 0;

    IF v_kind = 'inbound' THEN
      v_cash_amount := round(v_weight * v_rate, 2);
      v_gold_delta := v_w21;
      v_cash_delta := v_cash_amount;
    ELSIF v_kind = 'purchase' THEN
      v_cash_amount := round(v_w21 * v_price + v_weight * v_rate, 2);
      v_gold_delta := -v_w21;
      v_cash_delta := v_cash_amount;
    ELSIF v_kind = 'sale' THEN
      v_cash_amount := round(v_w21 * v_price + v_weight * v_rate, 2);
      v_gold_delta := v_w21;
      v_cash_delta := -v_cash_amount;
    ELSIF v_kind = 'transfer' THEN
      v_w21 := round(v_weight, 2);
      v_purity := 875;
      v_gold_delta := -v_w21;
      v_cash_amount := v_amount;
      v_cash_delta := -v_amount;
    ELSIF v_kind = 'settlement' THEN
      CASE v_method
        WHEN 'cash' THEN
          v_w21 := 0; v_cash_amount := v_amount; v_cash_delta := -v_amount;
        WHEN 'scrap_21' THEN
          v_purity := 875; v_w21 := round(v_weight, 2); v_gold_delta := -v_w21;
        WHEN 'scrap_18' THEN
          v_purity := 750; v_w21 := round(v_weight * 750 / 875, 2); v_gold_delta := -v_w21;
        WHEN 'bar_cashback' THEN
          v_cash_amount := round(v_weight * v_rate, 2);
          v_gold_delta := -v_w21; v_cash_delta := -v_cash_amount;
        WHEN 'bar_other_purity' THEN
          v_cash_amount := round(v_weight * 8, 2);
          v_gold_delta := -v_w21; v_cash_delta := -v_cash_amount;
        WHEN 'bandaqi' THEN
          v_purity := 991; v_w21 := round(v_weight * 991 / 875, 2);
          v_cash_amount := round(v_weight * 8, 2);
          v_gold_delta := -v_w21; v_cash_delta := -v_cash_amount;
        WHEN 'wage_to_gold' THEN
          IF COALESCE(v_price, 0) <= 0 THEN RAISE EXCEPTION 'اكتب سعر جرام عيار 21 للتحويل'; END IF;
          v_w21 := round(v_amount / v_price, 2);
          v_cash_amount := v_amount;
          v_gold_delta := v_w21; v_cash_delta := -v_amount;
        ELSE RAISE EXCEPTION 'اختار طريقة تسديد صحيحة';
      END CASE;
    END IF;

    IF abs(v_gold_delta) < 0.005 AND abs(v_cash_delta) < 0.005 THEN
      RAISE EXCEPTION 'البند بدون قيمة';
    END IF;

    SELECT COALESCE(NULLIF(v_line->>'label', ''), c.name_ar, '')
    INTO v_label FROM (SELECT 1) x
    LEFT JOIN public.item_categories c ON c.id = v_category;

    INSERT INTO public.transaction_lines (
      transaction_id, category_id, label, method, purity, weight, pieces,
      rate_per_gram, weight_21, cash_amount, gold_delta, cash_delta, sort_order
    ) VALUES (
      v_id, v_category, v_label, CASE WHEN v_kind IN ('settlement','transfer') THEN v_method ELSE NULL END,
      v_purity, v_weight, v_pieces, v_rate, v_w21, v_cash_amount,
      v_gold_delta, v_cash_delta, v_sort
    );
    v_total_gold := v_total_gold + v_gold_delta;
    v_total_cash := v_total_cash + v_cash_delta;
    v_sort := v_sort + 1;
  END LOOP;

  UPDATE public.transactions
  SET total_gold_21 = round(v_total_gold, 2), total_cash = round(v_total_cash, 2), updated_by = v_actor
  WHERE id = v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_transaction(_transaction_id UUID, _payload JSONB)
RETURNS UUID
LANGUAGE SQL
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.save_transaction(_transaction_id, _payload) $$;

CREATE OR REPLACE FUNCTION private.void_transaction(_transaction_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'الإلغاء متاح للمدير فقط';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'اكتب سبب الإلغاء';
  END IF;
  UPDATE public.transactions SET
    status = 'voided', void_reason = btrim(_reason), voided_at = now(),
    voided_by = v_actor, updated_by = v_actor
  WHERE id = _transaction_id AND status = 'posted';
  IF NOT FOUND THEN RAISE EXCEPTION 'الحركة غير موجودة أو ملغاة بالفعل'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_transaction(_transaction_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE SQL
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.void_transaction(_transaction_id, _reason) $$;

CREATE OR REPLACE FUNCTION public.merchant_balances()
RETURNS TABLE (
  merchant_id UUID, name TEXT, merchant_type public.merchant_type, phone TEXT,
  gold_21 NUMERIC, cash NUMERIC, last_txn_date DATE
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH entries AS (
    SELECT t.merchant_id, t.txn_date, t.total_gold_21 AS gold, t.total_cash AS cash
    FROM public.transactions t WHERE t.status = 'posted'
    UNION ALL
    SELECT t.counterparty_merchant_id, t.txn_date, t.total_gold_21, t.total_cash
    FROM public.transactions t
    WHERE t.status = 'posted' AND t.kind = 'transfer' AND t.counterparty_merchant_id IS NOT NULL
  )
  SELECT m.id, m.name, m.merchant_type, m.phone,
         COALESCE(SUM(e.gold), 0)::NUMERIC,
         COALESCE(SUM(e.cash), 0)::NUMERIC,
         MAX(e.txn_date)
  FROM public.merchants m
  LEFT JOIN entries e ON e.merchant_id = m.id
  WHERE m.is_active
  GROUP BY m.id, m.name, m.merchant_type, m.phone
$$;

CREATE OR REPLACE FUNCTION public.merchant_statement(
  _merchant_id UUID,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID, txn_date DATE, created_at TIMESTAMPTZ,
  kind public.txn_kind, status public.txn_status, notes TEXT,
  counterparty_name TEXT, gold_delta NUMERIC, cash_delta NUMERIC,
  opening_gold NUMERIC, opening_cash NUMERIC,
  running_gold NUMERIC, running_cash NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH entries AS (
    SELECT t.id, t.txn_date, t.created_at, t.kind, t.status, t.notes,
           t.counterparty_merchant_id AS other_id, t.total_gold_21 AS gold, t.total_cash AS cash
    FROM public.transactions t WHERE t.merchant_id = _merchant_id AND t.status = 'posted'
    UNION ALL
    SELECT t.id, t.txn_date, t.created_at, t.kind, t.status, t.notes,
           t.merchant_id, t.total_gold_21, t.total_cash
    FROM public.transactions t
    WHERE t.counterparty_merchant_id = _merchant_id AND t.kind = 'transfer' AND t.status = 'posted'
  ), opening AS (
    SELECT COALESCE(SUM(gold),0)::NUMERIC AS gold, COALESCE(SUM(cash),0)::NUMERIC AS cash
    FROM entries WHERE _from IS NOT NULL AND txn_date < _from
  ), period AS (
    SELECT e.*, m.name AS other_name
    FROM entries e LEFT JOIN public.merchants m ON m.id = e.other_id
    WHERE (_from IS NULL OR e.txn_date >= _from) AND (_to IS NULL OR e.txn_date <= _to)
  )
  SELECT p.id, p.txn_date, p.created_at, p.kind, p.status, p.notes, p.other_name,
         p.gold, p.cash, o.gold, o.cash,
         o.gold + SUM(p.gold) OVER (ORDER BY p.txn_date, p.created_at, p.id),
         o.cash + SUM(p.cash) OVER (ORDER BY p.txn_date, p.created_at, p.id)
  FROM period p CROSS JOIN opening o
  ORDER BY p.txn_date, p.created_at, p.id
$$;

REVOKE ALL ON FUNCTION private.save_transaction(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.save_transaction(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION private.void_transaction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.void_transaction(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.save_transaction(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_transaction(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.void_transaction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_transaction(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.merchant_statement(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_statement(UUID, DATE, DATE) TO authenticated;

GRANT SELECT ON public.transactions, public.transaction_lines TO authenticated;
