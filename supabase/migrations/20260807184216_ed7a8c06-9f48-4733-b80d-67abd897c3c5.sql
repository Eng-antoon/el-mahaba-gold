-- ========== ROLES ==========
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt INT;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  SELECT count(*) INTO cnt FROM public.user_roles WHERE role = 'admin';
  IF cnt = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== MERCHANTS ==========
CREATE TYPE public.merchant_type AS ENUM ('jewelry', 'raw');

CREATE TABLE public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  merchant_type public.merchant_type NOT NULL,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchants TO authenticated;
GRANT ALL ON public.merchants TO service_role;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merchants_select" ON public.merchants FOR SELECT TO authenticated USING (true);
CREATE POLICY "merchants_insert" ON public.merchants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "merchants_update" ON public.merchants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "merchants_delete_admin" ON public.merchants FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER merchants_updated_at BEFORE UPDATE ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== ITEM CATEGORIES ==========
CREATE TABLE public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  scope public.merchant_type NOT NULL,
  tracks_count BOOLEAN NOT NULL DEFAULT false,
  fixed_weight NUMERIC(12,2),
  fixed_purity NUMERIC(8,2),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_categories TO authenticated;
GRANT ALL ON public.item_categories TO service_role;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item_categories_select" ON public.item_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_categories_write" ON public.item_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "item_categories_update" ON public.item_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER item_categories_updated_at BEFORE UPDATE ON public.item_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.item_categories (name_ar, scope, tracks_count, fixed_weight, fixed_purity, sort_order) VALUES
  ('مشغولات', 'jewelry', false, NULL, NULL, 1),
  ('غوايش', 'jewelry', true, NULL, NULL, 2),
  ('خواتم', 'jewelry', false, NULL, NULL, 3),
  ('حلقان', 'jewelry', false, NULL, NULL, 4),
  ('دبل', 'jewelry', false, NULL, NULL, 5),
  ('أساور', 'jewelry', false, NULL, NULL, 6),
  ('أنسيالات', 'jewelry', false, NULL, NULL, 7),
  ('سلاسل', 'jewelry', false, NULL, NULL, 8),
  ('تعاليق', 'jewelry', false, NULL, NULL, 9),
  ('أطقم', 'jewelry', false, NULL, NULL, 10),
  ('كف', 'jewelry', false, NULL, NULL, 11),
  ('مشابك', 'jewelry', false, NULL, NULL, 12),
  ('سبيكة ربع جرام', 'raw', false, 0.25, 1000, 1),
  ('سبيكة نص جرام', 'raw', false, 0.50, 1000, 2),
  ('سبيكة جرام', 'raw', false, 1.00, 1000, 3),
  ('سبيكة 2.5 جرام', 'raw', false, 2.50, 1000, 4),
  ('سبيكة 5 جرام', 'raw', false, 5.00, 1000, 5),
  ('سبيكة 10 جرام', 'raw', false, 10.00, 1000, 6),
  ('سبيكة 20 جرام', 'raw', false, 20.00, 1000, 7),
  ('سبيكة 50 جرام', 'raw', false, 50.00, 1000, 8),
  ('سبيكة 100 جرام', 'raw', false, 100.00, 1000, 9),
  ('سبيكة وزن حر', 'raw', false, NULL, 1000, 10),
  ('جنيه ربع', 'raw', false, 2.00, 875, 11),
  ('جنيه نص', 'raw', false, 4.00, 875, 12),
  ('جنيه', 'raw', false, 8.00, 875, 13),
  ('بندقي', 'raw', false, NULL, 991, 14);

-- ========== GOLD PRICES ==========
CREATE TABLE public.gold_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_date DATE NOT NULL UNIQUE,
  price_per_gram_21 NUMERIC(14,2) NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gold_prices TO authenticated;
GRANT ALL ON public.gold_prices TO service_role;
ALTER TABLE public.gold_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gold_prices_select" ON public.gold_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "gold_prices_insert" ON public.gold_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gold_prices_update" ON public.gold_prices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "gold_prices_delete_admin" ON public.gold_prices FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER gold_prices_updated_at BEFORE UPDATE ON public.gold_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== TRANSACTIONS ==========
CREATE TYPE public.txn_kind AS ENUM ('inbound', 'settlement', 'purchase', 'sale', 'transfer');

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  counterparty_merchant_id UUID REFERENCES public.merchants(id) ON DELETE RESTRICT,
  kind public.txn_kind NOT NULL,
  txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gold_price_used NUMERIC(14,2),
  notes TEXT,
  total_gold_21 NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_cash NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_merchant_idx ON public.transactions(merchant_id, txn_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_select" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "transactions_delete_admin" ON public.transactions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- settlement/payment method
CREATE TYPE public.pay_method AS ENUM (
  'cash', 'scrap_21', 'scrap_18', 'bar_cashback', 'bar_other_purity',
  'bandaqi', 'wage_to_gold', 'transfer'
);

CREATE TABLE public.transaction_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  method public.pay_method,
  purity NUMERIC(8,2) NOT NULL DEFAULT 875,
  weight NUMERIC(12,2) NOT NULL DEFAULT 0,
  pieces INT,
  rate_per_gram NUMERIC(14,2) NOT NULL DEFAULT 0,
  weight_21 NUMERIC(14,3) NOT NULL DEFAULT 0,
  cash_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  gold_delta NUMERIC(14,3) NOT NULL DEFAULT 0,
  cash_delta NUMERIC(16,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transaction_lines_txn_idx ON public.transaction_lines(transaction_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_lines TO authenticated;
GRANT ALL ON public.transaction_lines TO service_role;
ALTER TABLE public.transaction_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transaction_lines_select" ON public.transaction_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "transaction_lines_insert" ON public.transaction_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "transaction_lines_update" ON public.transaction_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "transaction_lines_delete" ON public.transaction_lines FOR DELETE TO authenticated USING (true);
CREATE TRIGGER transaction_lines_updated_at BEFORE UPDATE ON public.transaction_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== AUDIT LOG ==========
CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT,
  operation TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON public.audit_log(created_at DESC);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN rid := (to_jsonb(OLD)->>'id');
  ELSE rid := (to_jsonb(NEW)->>'id'); END IF;
  INSERT INTO public.audit_log (table_name, record_id, operation, old_data, new_data, actor_id)
  VALUES (
    TG_TABLE_NAME, rid, TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid()
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER audit_merchants AFTER INSERT OR UPDATE OR DELETE ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_transactions AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_transaction_lines AFTER INSERT OR UPDATE OR DELETE ON public.transaction_lines
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_gold_prices AFTER INSERT OR UPDATE OR DELETE ON public.gold_prices
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_item_categories AFTER INSERT OR UPDATE OR DELETE ON public.item_categories
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- ========== BALANCES ==========
CREATE OR REPLACE FUNCTION public.merchant_balances()
RETURNS TABLE (
  merchant_id UUID,
  name TEXT,
  merchant_type public.merchant_type,
  phone TEXT,
  gold_21 NUMERIC,
  cash NUMERIC,
  last_txn_date DATE
) LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT m.id, m.name, m.merchant_type, m.phone,
         COALESCE(SUM(l.gold_delta), 0)::NUMERIC,
         COALESCE(SUM(l.cash_delta), 0)::NUMERIC,
         MAX(t.txn_date)
  FROM public.merchants m
  LEFT JOIN public.transactions t ON t.merchant_id = m.id
  LEFT JOIN public.transaction_lines l ON l.transaction_id = t.id
  WHERE m.is_active
  GROUP BY m.id, m.name, m.merchant_type, m.phone
$$;

CREATE OR REPLACE FUNCTION public.merchant_purity_breakdown(_merchant_id UUID)
RETURNS TABLE (purity NUMERIC, gold_weight NUMERIC)
LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT l.purity, SUM(CASE WHEN l.gold_delta >= 0 THEN l.weight ELSE -l.weight END)::NUMERIC
  FROM public.transaction_lines l
  JOIN public.transactions t ON t.id = l.transaction_id
  WHERE t.merchant_id = _merchant_id AND l.weight <> 0
  GROUP BY l.purity
  ORDER BY l.purity DESC
$$;