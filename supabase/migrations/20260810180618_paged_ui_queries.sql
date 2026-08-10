-- Server-side list filtering and summaries for the mobile-first paged UI.

CREATE OR REPLACE FUNCTION public.merchant_directory(
  _search TEXT DEFAULT NULL,
  _type public.merchant_type DEFAULT NULL,
  _sort TEXT DEFAULT 'name'
)
RETURNS TABLE (
  merchant_id UUID, name TEXT, merchant_type public.merchant_type, phone TEXT,
  gold_21 NUMERIC, cash NUMERIC, last_txn_date DATE
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT b.merchant_id, b.name, b.merchant_type, b.phone,
         b.gold_21, b.cash, b.last_txn_date
  FROM public.merchant_balances() b
  WHERE (_type IS NULL OR b.merchant_type = _type)
    AND (NULLIF(btrim(_search), '') IS NULL OR b.name ILIKE '%' || btrim(_search) || '%')
  ORDER BY
    CASE WHEN _sort = 'exposure' THEN abs(b.gold_21) END DESC NULLS LAST,
    CASE WHEN _sort = 'recent' THEN b.last_txn_date END DESC NULLS LAST,
    b.name ASC,
    b.merchant_id ASC
$$;

CREATE OR REPLACE FUNCTION public.merchant_balance_summary()
RETURNS TABLE (
  gold_owed NUMERIC, gold_credit NUMERIC,
  cash_owed NUMERIC, cash_credit NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(gold_21) FILTER (WHERE gold_21 > 0), 0)::NUMERIC,
    COALESCE(SUM(-gold_21) FILTER (WHERE gold_21 < 0), 0)::NUMERIC,
    COALESCE(SUM(cash) FILTER (WHERE cash > 0), 0)::NUMERIC,
    COALESCE(SUM(-cash) FILTER (WHERE cash < 0), 0)::NUMERIC
  FROM public.merchant_balances()
$$;

CREATE OR REPLACE FUNCTION public.merchant_activity_totals(
  _merchant_id UUID,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT NULL
)
RETURNS TABLE (gold NUMERIC, cash NUMERIC)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH entries AS (
    SELECT t.txn_date, t.total_gold_21 AS gold, t.total_cash AS cash
    FROM public.transactions t
    WHERE t.status = 'posted' AND t.merchant_id = _merchant_id
    UNION ALL
    SELECT t.txn_date, t.total_gold_21, t.total_cash
    FROM public.transactions t
    WHERE t.status = 'posted'
      AND t.kind = 'transfer'
      AND t.counterparty_merchant_id = _merchant_id
  )
  SELECT COALESCE(SUM(e.gold), 0)::NUMERIC, COALESCE(SUM(e.cash), 0)::NUMERIC
  FROM entries e
  WHERE (_from IS NULL OR e.txn_date >= _from)
    AND (_to IS NULL OR e.txn_date <= _to)
$$;

CREATE OR REPLACE FUNCTION public.merchant_statement_balances(
  _merchant_id UUID,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT NULL
)
RETURNS TABLE (
  opening_gold NUMERIC, opening_cash NUMERIC,
  period_gold NUMERIC, period_cash NUMERIC,
  closing_gold NUMERIC, closing_cash NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH entries AS (
    SELECT t.txn_date, t.total_gold_21 AS gold, t.total_cash AS cash
    FROM public.transactions t
    WHERE t.status = 'posted' AND t.merchant_id = _merchant_id
    UNION ALL
    SELECT t.txn_date, t.total_gold_21, t.total_cash
    FROM public.transactions t
    WHERE t.status = 'posted'
      AND t.kind = 'transfer'
      AND t.counterparty_merchant_id = _merchant_id
  ), totals AS (
    SELECT
      COALESCE(SUM(gold) FILTER (WHERE _from IS NOT NULL AND txn_date < _from), 0)::NUMERIC AS og,
      COALESCE(SUM(cash) FILTER (WHERE _from IS NOT NULL AND txn_date < _from), 0)::NUMERIC AS oc,
      COALESCE(SUM(gold) FILTER (
        WHERE (_from IS NULL OR txn_date >= _from) AND (_to IS NULL OR txn_date <= _to)
      ), 0)::NUMERIC AS pg,
      COALESCE(SUM(cash) FILTER (
        WHERE (_from IS NULL OR txn_date >= _from) AND (_to IS NULL OR txn_date <= _to)
      ), 0)::NUMERIC AS pc
    FROM entries
  )
  SELECT og, oc, pg, pc, og + pg, oc + pc FROM totals
$$;

CREATE OR REPLACE FUNCTION public.visible_audit_log(
  _table_name TEXT DEFAULT NULL,
  _operation TEXT DEFAULT NULL,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT NULL
)
RETURNS SETOF public.audit_log
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT a.*
  FROM public.audit_log a
  WHERE (_table_name IS NULL OR a.table_name = _table_name)
    AND (_operation IS NULL OR a.operation = _operation)
    AND (_from IS NULL OR a.created_at >= _from::TIMESTAMPTZ)
    AND (_to IS NULL OR a.created_at < (_to + 1)::TIMESTAMPTZ)
    AND NOT (
      a.table_name = 'transactions'
      AND a.record_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id::TEXT = a.record_id AND t.status = 'voided'
      )
    )
    AND NOT (
      a.table_name = 'transaction_lines'
      AND COALESCE(a.new_data->>'transaction_id', a.old_data->>'transaction_id') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id = COALESCE(
          a.new_data->>'transaction_id', a.old_data->>'transaction_id'
        )::UUID
          AND t.status = 'voided'
      )
    )
  ORDER BY a.created_at DESC, a.id DESC
$$;

REVOKE ALL ON FUNCTION public.merchant_directory(TEXT, public.merchant_type, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_directory(TEXT, public.merchant_type, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.merchant_balance_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_balance_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.merchant_activity_totals(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_activity_totals(UUID, DATE, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.merchant_statement_balances(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_statement_balances(UUID, DATE, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.visible_audit_log(TEXT, TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visible_audit_log(TEXT, TEXT, DATE, DATE) TO authenticated;
