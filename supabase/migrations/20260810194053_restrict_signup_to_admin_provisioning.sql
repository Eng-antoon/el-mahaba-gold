-- Preserve the original empty-project bootstrap, but require all later accounts to
-- come through the authenticated server-side admin provisioning flow.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count INT;
  provisioned_by_admin BOOLEAN;
BEGIN
  SELECT count(*) INTO admin_count
  FROM public.user_roles
  WHERE role = 'admin';

  provisioned_by_admin := COALESCE(
    (NEW.raw_app_meta_data->>'provisioned_by_admin')::BOOLEAN,
    false
  );

  IF admin_count > 0 AND NOT provisioned_by_admin THEN
    RAISE EXCEPTION 'Account creation is restricted to administrators'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  IF admin_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$;
