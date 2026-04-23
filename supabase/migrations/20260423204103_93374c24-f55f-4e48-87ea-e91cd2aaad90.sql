CREATE OR REPLACE FUNCTION public.tg_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. UPDATE/DELETE is forbidden.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;