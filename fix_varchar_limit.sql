-- Fix for 'value too long for type character varying(10)' error
-- The dynamically generated pelanggan_id (e.g., 'PLG-1683748291039') is 17 characters long.
-- We need to expand the limit on both the `pelanggan` table and the `transaksi` table (which references it).

-- 1. Expand pelanggan_id limit in the pelanggan table
ALTER TABLE pelanggan ALTER COLUMN pelanggan_id TYPE VARCHAR(50);

-- 2. Expand pelanggan_id limit in the transaksi table to match the foreign key constraint
ALTER TABLE transaksi ALTER COLUMN pelanggan_id TYPE VARCHAR(50);

-- (Optional but recommended) Ensure nomor_telepon has enough space just in case
ALTER TABLE pelanggan ALTER COLUMN nomor_telepon TYPE VARCHAR(50);
