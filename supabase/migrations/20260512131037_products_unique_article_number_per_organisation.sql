
ALTER TABLE products DROP CONSTRAINT products_article_number_key;
ALTER TABLE products ADD CONSTRAINT products_article_number_organisation_key UNIQUE (article_number, organisation);
