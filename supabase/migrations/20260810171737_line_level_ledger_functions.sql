-- Line-level transaction semantics, per-line pricing, reconciliation, and account settlement.

ALTER TABLE public.transaction_lines
  ADD COLUMN kind public.txn_kind,
  ADD COLUMN is_return BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN gold_price_per_gram NUMERIC(14,2);

UPDATE public.transaction_lines l
SET kind = t.kind,
    gold_price_per_gram = CASE
      WHEN t.kind IN ('purchase', 'sale') OR l.method = 'wage_to_gold' THEN t.gold_price_used
      ELSE NULL
    END
FROM public.transactions t
WHERE t.id = l.transaction_id;

ALTER TABLE public.transaction_lines
  ALTER COLUMN kind SET NOT NULL,
  ADD CONSTRAINT transaction_lines_kind_not_mixed CHECK (kind <> 'mixed'),
  ADD CONSTRAINT transaction_lines_return_kind_check CHECK (NOT is_return OR kind = 'inbound'),
  ADD CONSTRAINT transaction_lines_gold_price_check CHECK (
    gold_price_per_gram IS NULL OR gold_price_per_gram > 0
  );

ALTER TABLE public.transactions
  ADD COLUMN is_account_settlement BOOLEAN NOT NULL DEFAULT false;

UPDATE public.item_categories SET name_ar = 'نصف جنيه' WHERE name_ar = 'جنيه نص' AND scope = 'raw';
UPDATE public.item_categories SET name_ar = 'ربع جنيه' WHERE name_ar = 'جنيه ربع' AND scope = 'raw';
INSERT INTO public.item_categories (
  name_ar, scope, tracks_count, fixed_weight, fixed_purity, sort_order
)
SELECT 'ثمن جنيه', 'raw', false, 1.00, 875, 11
WHERE NOT EXISTS (
  SELECT 1 FROM public.item_categories WHERE name_ar = 'ثمن جنيه' AND scope = 'raw'
);
UPDATE public.item_categories
SET sort_order = CASE name_ar
  WHEN 'جنيه' THEN 12
  WHEN 'نصف جنيه' THEN 13
  WHEN 'ربع جنيه' THEN 14
  WHEN 'بندقي' THEN 15
  ELSE sort_order
END
WHERE scope = 'raw';

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
  v_merchant_type public.merchant_type;
  v_counterparty UUID;
  v_requested_kind public.txn_kind;
  v_parent_kind public.txn_kind;
  v_date DATE;
  v_legacy_price NUMERIC(14,2);
  v_notes TEXT;
  v_line JSONB;
  v_line_kind public.txn_kind;
  v_is_return BOOLEAN;
  v_method public.pay_method;
  v_category UUID;
  v_category_scope public.merchant_type;
  v_category_purity NUMERIC(8,2);
  v_category_tracks_count BOOLEAN;
  v_label TEXT;
  v_purity NUMERIC(8,2);
  v_weight NUMERIC(12,2);
  v_pieces INT;
  v_rate NUMERIC(14,2);
  v_amount NUMERIC(16,2);
  v_line_price NUMERIC(14,2);
  v_w21 NUMERIC(14,2);
  v_cash_amount NUMERIC(16,2);
  v_gold_delta NUMERIC(14,2);
  v_cash_delta NUMERIC(16,2);
  v_total_gold NUMERIC(14,2) := 0;
  v_total_cash NUMERIC(16,2) := 0;
  v_sort INT := 0;
  v_signature_count INT;
  v_has_transfer BOOLEAN;
  v_has_sale BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF jsonb_typeof(_payload->'lines') <> 'array' OR jsonb_array_length(_payload->'lines') = 0 THEN
    RAISE EXCEPTION 'أضف بند واحد على الأقل';
  END IF;

  v_merchant := (_payload->>'merchant_id')::UUID;
  v_requested_kind := COALESCE(NULLIF(_payload->>'kind', '')::public.txn_kind, 'inbound');
  IF v_requested_kind = 'mixed' THEN v_requested_kind := 'inbound'; END IF;
  v_date := COALESCE(NULLIF(_payload->>'txn_date', '')::DATE, CURRENT_DATE);
  v_legacy_price := NULLIF(_payload->>'gold_price_used', '')::NUMERIC;
  v_notes := NULLIF(btrim(_payload->>'notes'), '');
  v_counterparty := NULLIF(_payload->>'counterparty_merchant_id', '')::UUID;

  SELECT merchant_type INTO v_merchant_type
  FROM public.merchants
  WHERE id = v_merchant AND is_active
  FOR UPDATE;
  IF v_merchant_type IS NULL THEN RAISE EXCEPTION 'التاجر غير موجود أو غير نشط'; END IF;

  SELECT
    count(DISTINCT (
      COALESCE(NULLIF(value->>'kind', ''), v_requested_kind::TEXT)
      || ':' || COALESCE(NULLIF(value->>'is_return', ''), 'false')
    )),
    bool_or(COALESCE(NULLIF(value->>'kind', '')::public.txn_kind, v_requested_kind) = 'transfer'),
    bool_or(COALESCE(NULLIF(value->>'kind', '')::public.txn_kind, v_requested_kind) = 'sale')
  INTO v_signature_count, v_has_transfer, v_has_sale
  FROM jsonb_array_elements(_payload->'lines');

  IF v_signature_count > 1 THEN
    v_parent_kind := 'mixed';
  ELSE
    v_parent_kind := COALESCE(
      NULLIF((_payload->'lines'->0)->>'kind', '')::public.txn_kind,
      v_requested_kind
    );
  END IF;

  IF (v_has_transfer OR v_has_sale) AND v_signature_count > 1 THEN
    RAISE EXCEPTION 'البيع والتحويل لازم يكونوا في حركة مستقلة';
  END IF;

  IF v_parent_kind = 'transfer' THEN
    IF v_counterparty IS NULL OR v_counterparty = v_merchant THEN
      RAISE EXCEPTION 'اختار تاجرين مختلفين للتحويل';
    END IF;
    PERFORM 1 FROM public.merchants
    WHERE id = v_counterparty AND is_active
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'التاجر المحول له غير موجود أو غير نشط'; END IF;
  ELSE
    v_counterparty := NULL;
  END IF;

  IF _transaction_id IS NULL THEN
    INSERT INTO public.transactions (
      merchant_id, counterparty_merchant_id, kind, txn_date, gold_price_used,
      notes, created_by, updated_by
    ) VALUES (
      v_merchant, v_counterparty, v_parent_kind, v_date, v_legacy_price,
      v_notes, v_actor, v_actor
    ) RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id
    FROM public.transactions
    WHERE id = _transaction_id AND status = 'posted' AND NOT is_account_settlement
    FOR UPDATE;
    IF v_id IS NULL THEN RAISE EXCEPTION 'الحركة غير موجودة أو لا يمكن تعديلها'; END IF;
    DELETE FROM public.transaction_lines WHERE transaction_id = v_id;
    UPDATE public.transactions SET
      merchant_id = v_merchant,
      counterparty_merchant_id = v_counterparty,
      kind = v_parent_kind,
      txn_date = v_date,
      gold_price_used = v_legacy_price,
      notes = v_notes,
      updated_by = v_actor
    WHERE id = v_id;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    v_line_kind := COALESCE(NULLIF(v_line->>'kind', '')::public.txn_kind, v_requested_kind);
    v_is_return := COALESCE(NULLIF(v_line->>'is_return', '')::BOOLEAN, false);
    v_category := NULLIF(v_line->>'category_id', '')::UUID;
    v_method := NULLIF(v_line->>'method', '')::public.pay_method;
    v_purity := COALESCE(NULLIF(v_line->>'purity', '')::NUMERIC, 875);
    v_weight := round(COALESCE(NULLIF(v_line->>'weight', '')::NUMERIC, 0), 2);
    v_pieces := NULLIF(v_line->>'pieces', '')::INT;
    v_rate := round(COALESCE(NULLIF(v_line->>'rate', '')::NUMERIC, 0), 2);
    v_amount := round(COALESCE(NULLIF(v_line->>'amount', '')::NUMERIC, 0), 2);
    v_line_price := COALESCE(
      NULLIF(v_line->>'gold_price', '')::NUMERIC,
      NULLIF(v_line->>'gold_price_per_gram', '')::NUMERIC,
      v_legacy_price
    );

    IF v_line_kind = 'mixed' THEN RAISE EXCEPTION 'اختار نوع صحيح لكل بند'; END IF;
    IF v_is_return AND v_line_kind <> 'inbound' THEN
      RAISE EXCEPTION 'المرتجع لازم يكون من نوع وارد';
    END IF;
    IF v_weight < 0 OR v_rate < 0 OR v_amount < 0 OR v_purity < 500 OR v_purity > 1000 THEN
      RAISE EXCEPTION 'راجع الوزن والعيار والقيمة؛ العيار لازم يكون بين 500 و1000';
    END IF;
    IF v_pieces IS NOT NULL AND v_pieces < 0 THEN RAISE EXCEPTION 'العدد غير صحيح'; END IF;

    v_category_scope := NULL;
    v_category_purity := NULL;
    v_category_tracks_count := false;
    IF v_category IS NOT NULL THEN
      SELECT scope, fixed_purity, tracks_count
      INTO v_category_scope, v_category_purity, v_category_tracks_count
      FROM public.item_categories
      WHERE id = v_category AND is_active;
      IF v_category_scope IS NULL OR v_category_scope <> v_merchant_type THEN
        RAISE EXCEPTION 'الصنف لا يناسب نوع التاجر';
      END IF;
    END IF;

    IF v_line_kind IN ('inbound', 'purchase', 'sale') THEN
      IF v_merchant_type = 'jewelry' THEN
        IF v_category IS NULL THEN RAISE EXCEPTION 'اختار صنف المشغولات'; END IF;
        IF v_purity NOT IN (750, 875) THEN RAISE EXCEPTION 'عيار المشغولات لازم يكون 18 أو 21'; END IF;
      ELSE
        IF v_purity = 991 THEN
          v_rate := 8;
        ELSIF v_purity IN (875, 1000) THEN
          IF v_category IS NULL OR v_category_purity <> v_purity THEN
            RAISE EXCEPTION 'اختار صنف مناسب للعيار';
          END IF;
        ELSE
          RAISE EXCEPTION 'عيار الخام لازم يكون 24 أو 21 أو بندقي 991';
        END IF;
      END IF;
      IF v_category_tracks_count AND COALESCE(v_pieces, 0) <= 0 THEN
        RAISE EXCEPTION 'اكتب العدد';
      END IF;
    END IF;

    IF v_line_kind IN ('purchase', 'sale') AND COALESCE(v_line_price, 0) <= 0 THEN
      RAISE EXCEPTION 'اكتب سعر الجرام للبند';
    END IF;

    v_w21 := round(v_weight * v_purity / 875, 2);
    v_cash_amount := 0;
    v_gold_delta := 0;
    v_cash_delta := 0;

    IF v_line_kind = 'inbound' THEN
      v_cash_amount := round(v_weight * v_rate, 2);
      v_gold_delta := CASE WHEN v_is_return THEN -v_w21 ELSE v_w21 END;
      v_cash_delta := CASE WHEN v_is_return THEN -v_cash_amount ELSE v_cash_amount END;
    ELSIF v_line_kind = 'purchase' THEN
      v_cash_amount := round(v_weight * v_line_price + v_weight * v_rate, 2);
      v_gold_delta := -v_w21;
      v_cash_delta := v_cash_amount;
    ELSIF v_line_kind = 'sale' THEN
      v_cash_amount := round(v_weight * v_line_price + v_weight * v_rate, 2);
      v_gold_delta := v_w21;
      v_cash_delta := -v_cash_amount;
    ELSIF v_line_kind = 'transfer' THEN
      v_w21 := round(v_weight, 2);
      v_purity := 875;
      v_gold_delta := -v_w21;
      v_cash_amount := v_amount;
      v_cash_delta := -v_amount;
      v_method := 'transfer';
    ELSIF v_line_kind = 'settlement' THEN
      CASE v_method
        WHEN 'cash' THEN
          v_w21 := 0; v_cash_amount := v_amount; v_cash_delta := -v_amount;
        WHEN 'cash_received' THEN
          v_w21 := 0; v_cash_amount := v_amount; v_cash_delta := v_amount;
        WHEN 'scrap_21' THEN
          v_purity := 875; v_w21 := round(v_weight, 2); v_gold_delta := -v_w21;
        WHEN 'scrap_18' THEN
          v_purity := 750; v_w21 := round(v_weight * 750 / 875, 2); v_gold_delta := -v_w21;
        WHEN 'bar_cashback' THEN
          v_cash_amount := v_amount;
          v_gold_delta := -v_w21; v_cash_delta := -v_cash_amount;
        WHEN 'bar_other_purity' THEN
          v_cash_amount := round(v_weight * 8, 2);
          v_gold_delta := -v_w21; v_cash_delta := -v_cash_amount;
        WHEN 'bandaqi' THEN
          v_purity := 991; v_w21 := round(v_weight * 991 / 875, 2);
          v_cash_amount := round(v_weight * 8, 2);
          v_gold_delta := -v_w21; v_cash_delta := -v_cash_amount;
        WHEN 'wage_to_gold' THEN
          IF COALESCE(v_line_price, 0) <= 0 THEN RAISE EXCEPTION 'اكتب سعر الجرام للتحويل'; END IF;
          v_w21 := round(v_amount / v_line_price, 2);
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
      transaction_id, category_id, label, kind, is_return, method, purity, weight,
      pieces, rate_per_gram, gold_price_per_gram, weight_21, cash_amount,
      gold_delta, cash_delta, sort_order
    ) VALUES (
      v_id, v_category, v_label, v_line_kind, v_is_return,
      CASE WHEN v_line_kind IN ('settlement','transfer') THEN v_method ELSE NULL END,
      v_purity, v_weight, v_pieces, v_rate, v_line_price, v_w21, v_cash_amount,
      v_gold_delta, v_cash_delta, v_sort
    );
    v_total_gold := v_total_gold + v_gold_delta;
    v_total_cash := v_total_cash + v_cash_delta;
    v_sort := v_sort + 1;
  END LOOP;

  UPDATE public.transactions
  SET total_gold_21 = round(v_total_gold, 2),
      total_cash = round(v_total_cash, 2),
      kind = v_parent_kind,
      updated_by = v_actor
  WHERE id = v_id;
  RETURN v_id;
END;
$$;

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
  WITH document_totals AS (
    SELECT t.id, t.merchant_id, t.counterparty_merchant_id, t.kind, t.txn_date,
           COALESCE(SUM(l.gold_delta), 0)::NUMERIC AS gold,
           COALESCE(SUM(l.cash_delta), 0)::NUMERIC AS cash
    FROM public.transactions t
    LEFT JOIN public.transaction_lines l ON l.transaction_id = t.id
    WHERE t.status = 'posted'
    GROUP BY t.id
  ), entries AS (
    SELECT merchant_id, txn_date, gold, cash FROM document_totals
    UNION ALL
    SELECT counterparty_merchant_id, txn_date, gold, cash
    FROM document_totals
    WHERE kind = 'transfer' AND counterparty_merchant_id IS NOT NULL
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

DROP FUNCTION IF EXISTS public.merchant_statement(UUID, DATE, DATE);
CREATE FUNCTION public.merchant_statement(
  _merchant_id UUID,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID, txn_date DATE, created_at TIMESTAMPTZ,
  kind public.txn_kind, status public.txn_status, notes TEXT,
  counterparty_name TEXT, gold_delta NUMERIC, cash_delta NUMERIC,
  opening_gold NUMERIC, opening_cash NUMERIC,
  running_gold NUMERIC, running_cash NUMERIC,
  line_kinds public.txn_kind[], has_returns BOOLEAN,
  is_account_settlement BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH documents AS (
    SELECT t.id, t.merchant_id, t.counterparty_merchant_id, t.txn_date, t.created_at,
           t.kind, t.status, t.notes, t.is_account_settlement,
           COALESCE(SUM(l.gold_delta), 0)::NUMERIC AS gold,
           COALESCE(SUM(l.cash_delta), 0)::NUMERIC AS cash,
           array_agg(DISTINCT l.kind ORDER BY l.kind) FILTER (WHERE l.kind IS NOT NULL) AS kinds,
           COALESCE(bool_or(l.is_return), false) AS returns
    FROM public.transactions t
    LEFT JOIN public.transaction_lines l ON l.transaction_id = t.id
    WHERE t.status = 'posted'
    GROUP BY t.id
  ), entries AS (
    SELECT d.*, d.counterparty_merchant_id AS other_id FROM documents d
    WHERE d.merchant_id = _merchant_id
    UNION ALL
    SELECT d.*, d.merchant_id AS other_id FROM documents d
    WHERE d.counterparty_merchant_id = _merchant_id AND d.kind = 'transfer'
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
         o.cash + SUM(p.cash) OVER (ORDER BY p.txn_date, p.created_at, p.id),
         p.kinds, p.returns, p.is_account_settlement
  FROM period p CROSS JOIN opening o
  ORDER BY p.txn_date, p.created_at, p.id
$$;

CREATE OR REPLACE FUNCTION public.merchant_statement_summary(
  _merchant_id UUID,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT NULL
)
RETURNS TABLE (
  total_bullion_received_21 NUMERIC,
  total_jewelry_received_21 NUMERIC,
  total_cash_paid NUMERIC,
  total_cash_received NUMERIC,
  total_scrap_paid_21 NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE
      WHEN l.kind = 'inbound' AND c.scope = 'raw'
        THEN CASE WHEN l.is_return THEN -l.weight_21 ELSE l.weight_21 END
      ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE
      WHEN l.kind = 'inbound' AND c.scope = 'jewelry'
        THEN CASE WHEN l.is_return THEN -l.weight_21 ELSE l.weight_21 END
      ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN l.kind = 'settlement' AND l.method = 'cash'
      THEN l.cash_amount ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN l.kind = 'settlement' AND l.method = 'cash_received'
      THEN l.cash_amount ELSE 0 END), 0)::NUMERIC,
    COALESCE(SUM(CASE WHEN l.kind = 'settlement' AND l.method IN (
      'scrap_21', 'scrap_18', 'bandaqi', 'bar_other_purity', 'bar_cashback'
    ) THEN l.weight_21 ELSE 0 END), 0)::NUMERIC
  FROM public.transactions t
  JOIN public.transaction_lines l ON l.transaction_id = t.id
  LEFT JOIN public.item_categories c ON c.id = l.category_id
  WHERE t.merchant_id = _merchant_id
    AND t.status = 'posted'
    AND NOT t.is_account_settlement
    AND (_from IS NULL OR t.txn_date >= _from)
    AND (_to IS NULL OR t.txn_date <= _to)
$$;

CREATE OR REPLACE FUNCTION private.settle_merchant_account(
  _merchant_id UUID,
  _reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_id UUID;
  v_gold NUMERIC(14,2);
  v_cash NUMERIC(16,2);
  v_sort INT := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'تصفية الحساب متاحة للمدير فقط';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'اكتب سبب التصفية';
  END IF;

  PERFORM 1 FROM public.merchants
  WHERE id = _merchant_id AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'التاجر غير موجود أو غير نشط'; END IF;

  SELECT round(gold_21, 2), round(cash, 2)
  INTO v_gold, v_cash
  FROM public.merchant_balances()
  WHERE merchant_id = _merchant_id;

  INSERT INTO public.transactions (
    merchant_id, kind, txn_date, notes, total_gold_21, total_cash,
    is_account_settlement, created_by, updated_by
  ) VALUES (
    _merchant_id, 'settlement', CURRENT_DATE,
    'تمت التصفية — ' || btrim(_reason), -v_gold, -v_cash,
    true, v_actor, v_actor
  ) RETURNING id INTO v_id;

  IF abs(v_gold) >= 0.005 THEN
    INSERT INTO public.transaction_lines (
      transaction_id, label, kind, purity, weight, weight_21,
      gold_delta, cash_delta, sort_order
    ) VALUES (
      v_id, 'تصفية رصيد الذهب', 'settlement', 875, 0, 0,
      -v_gold, 0, v_sort
    );
    v_sort := v_sort + 1;
  END IF;
  IF abs(v_cash) >= 0.005 THEN
    INSERT INTO public.transaction_lines (
      transaction_id, label, kind, purity, weight, weight_21,
      cash_amount, gold_delta, cash_delta, sort_order
    ) VALUES (
      v_id, 'تصفية رصيد النقدية', 'settlement', 875, 0, 0,
      abs(v_cash), 0, -v_cash, v_sort
    );
    v_sort := v_sort + 1;
  END IF;
  IF v_sort = 0 THEN
    INSERT INTO public.transaction_lines (
      transaction_id, label, kind, purity, weight, weight_21,
      gold_delta, cash_delta, sort_order
    ) VALUES (
      v_id, 'تمت التصفية', 'settlement', 875, 0, 0, 0, 0, 0
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_merchant_account(
  _merchant_id UUID,
  _reason TEXT
)
RETURNS UUID
LANGUAGE SQL
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.settle_merchant_account(_merchant_id, _reason) $$;

CREATE OR REPLACE FUNCTION public.merchant_purity_breakdown(_merchant_id UUID)
RETURNS TABLE (purity NUMERIC, gold_weight NUMERIC)
LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT l.purity,
         SUM(CASE WHEN l.gold_delta >= 0 THEN l.weight ELSE -l.weight END)::NUMERIC
  FROM public.transaction_lines l
  JOIN public.transactions t ON t.id = l.transaction_id
  WHERE t.merchant_id = _merchant_id
    AND t.status = 'posted'
    AND NOT t.is_account_settlement
    AND l.weight <> 0
  GROUP BY l.purity
  ORDER BY l.purity DESC
$$;

REVOKE ALL ON FUNCTION private.save_transaction(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.save_transaction(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION private.settle_merchant_account(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.settle_merchant_account(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.merchant_statement(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_statement(UUID, DATE, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.merchant_statement_summary(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_statement_summary(UUID, DATE, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.settle_merchant_account(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_merchant_account(UUID, TEXT) TO authenticated;
