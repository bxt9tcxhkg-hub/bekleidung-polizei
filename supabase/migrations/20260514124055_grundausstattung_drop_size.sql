
ALTER TABLE grundausstattung DROP CONSTRAINT grundausstattung_organisation_product_id_size_key;
ALTER TABLE grundausstattung DROP COLUMN size;
ALTER TABLE grundausstattung ADD CONSTRAINT grundausstattung_organisation_product_id_key UNIQUE (organisation, product_id);
