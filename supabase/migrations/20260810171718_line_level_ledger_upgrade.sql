-- Enum additions must commit before the following migration can reference them.
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'mixed';
ALTER TYPE public.pay_method ADD VALUE IF NOT EXISTS 'cash_received';
