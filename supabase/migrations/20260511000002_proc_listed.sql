-- Migration: proc_listed flag für Sammelbeschaffung
ALTER TABLE orders ADD COLUMN IF NOT EXISTS proc_listed BOOLEAN DEFAULT false;
