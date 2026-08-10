-- Correlate low-level audit rows into user-facing activities and expose actor filtering.

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS action_id UUID;

CREATE INDEX IF NOT EXISTS audit_log_actor_created_idx
  ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_created_idx
  ON public.audit_log (action_id, created_at DESC)
  WHERE action_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rid TEXT;
  configured_action TEXT := NULLIF(current_setting('app.audit_action_id', true), '');
  audit_action UUID := COALESCE(configured_action::UUID, gen_random_uuid());
BEGIN
  IF TG_OP = 'DELETE' THEN rid := (to_jsonb(OLD)->>'id');
  ELSE rid := (to_jsonb(NEW)->>'id'); END IF;

  INSERT INTO public.audit_log (
    table_name, record_id, operation, old_data, new_data, actor_id, action_id
  )
  VALUES (
    TG_TABLE_NAME,
    rid,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid(),
    audit_action
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_transaction(_transaction_id UUID, _payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.audit_action_id', gen_random_uuid()::TEXT, true);
  RETURN private.save_transaction(_transaction_id, _payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_transaction(_transaction_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.audit_action_id', gen_random_uuid()::TEXT, true);
  PERFORM private.void_transaction(_transaction_id, _reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_merchant_account(_merchant_id UUID, _reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.audit_action_id', gen_random_uuid()::TEXT, true);
  RETURN private.settle_merchant_account(_merchant_id, _reason);
END;
$$;

REVOKE ALL ON FUNCTION public.save_transaction(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_transaction(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.void_transaction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_transaction(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.settle_merchant_account(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_merchant_account(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.visible_audit_activity(
  _table_name TEXT DEFAULT NULL,
  _operation TEXT DEFAULT NULL,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT NULL,
  _actor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  activity_key TEXT,
  action_id UUID,
  actor_id UUID,
  created_at TIMESTAMPTZ,
  table_names TEXT[],
  operations TEXT[],
  events JSONB
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      a.*,
      COALESCE(
        a.action_id::TEXT,
        'legacy:' || COALESCE(a.actor_id::TEXT, 'system') || ':' ||
        CASE
          WHEN a.table_name = 'transaction_lines' THEN
            COALESCE(a.new_data->>'transaction_id', a.old_data->>'transaction_id', a.record_id, 'unknown')
          ELSE COALESCE(a.record_id, 'unknown')
        END || ':' || to_char(date_trunc('second', a.created_at), 'YYYYMMDDHH24MISS')
      ) AS grouped_key
    FROM public.audit_log a
    WHERE (_actor_id IS NULL OR a.actor_id = _actor_id)
      AND (_from IS NULL OR a.created_at >= _from::TIMESTAMPTZ)
      AND (_to IS NULL OR a.created_at < (_to + 1)::TIMESTAMPTZ)
  ), matching_keys AS (
    SELECT DISTINCT n.grouped_key
    FROM normalized n
    WHERE (_table_name IS NULL OR n.table_name = _table_name)
      AND (_operation IS NULL OR n.operation = _operation)
  )
  SELECT
    n.grouped_key,
    (array_agg(n.action_id ORDER BY n.id) FILTER (WHERE n.action_id IS NOT NULL))[1],
    (array_agg(n.actor_id ORDER BY n.id) FILTER (WHERE n.actor_id IS NOT NULL))[1],
    max(n.created_at),
    array_agg(DISTINCT n.table_name ORDER BY n.table_name),
    array_agg(DISTINCT n.operation ORDER BY n.operation),
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'table_name', n.table_name,
        'record_id', n.record_id,
        'operation', n.operation,
        'old_data', n.old_data,
        'new_data', n.new_data,
        'created_at', n.created_at
      )
      ORDER BY n.id
    )
  FROM normalized n
  JOIN matching_keys k ON k.grouped_key = n.grouped_key
  GROUP BY n.grouped_key
  ORDER BY max(n.created_at) DESC, max(n.id) DESC
$$;

REVOKE ALL ON FUNCTION public.visible_audit_activity(TEXT, TEXT, DATE, DATE, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visible_audit_activity(TEXT, TEXT, DATE, DATE, UUID)
  TO authenticated;
