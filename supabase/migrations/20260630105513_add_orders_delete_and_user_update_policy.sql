
-- Allow users to delete their own pending orders (cart items)
CREATE POLICY "Benutzer löscht eigene Warenkorbeinträge"
  ON orders FOR DELETE
  USING (user_id = auth.uid() AND status = 'pending');

-- Allow users to update their own pending orders (qty change + cart submit)
CREATE POLICY "Benutzer bearbeitet eigene Bestellungen"
  ON orders FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending');
