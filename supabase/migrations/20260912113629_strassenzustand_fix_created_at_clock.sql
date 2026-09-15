-- now() ist innerhalb einer Transaktion konstant (Transaktionsstart), aber die
-- Meldungsart-Ableitung muss auch mehrere Zeilen aus DERSELBEN Transaktion
-- (z. B. Bericht mit mehreren Straßen, oder Tests) zeitlich korrekt ordnen.
-- clock_timestamp() liefert die tatsächliche Uhrzeit je Aufruf.
ALTER TABLE public.strassenzustand_berichtzeilen ALTER COLUMN created_at SET DEFAULT clock_timestamp();
