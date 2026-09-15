GRANT EXECUTE ON FUNCTION public.book_order_inventory(uuid,timestamptz,text,integer) TO authenticated;

-- Restrict FK parent deletion as well: child inserts racing a deletion must not be cascaded away.
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT conrelid::regclass AS tab,conname,pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE confrelid='public.einsatz_training_sessions'::regclass AND contype='f' AND confdeltype='c'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.tab,fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',fk.tab,fk.conname,replace(fk.def,'ON DELETE CASCADE','ON DELETE RESTRICT'));
  END LOOP;
END $$;
