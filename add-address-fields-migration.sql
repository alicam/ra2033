-- Migration script to add address verification fields to public_signatures table
-- Run this on both local development and production databases

-- Add new columns for structured address data from Geoscape API
ALTER TABLE public_signatures ADD COLUMN address_id TEXT;
ALTER TABLE public_signatures ADD COLUMN stateElec TEXT;
ALTER TABLE public_signatures ADD COLUMN fedElec TEXT;
ALTER TABLE public_signatures ADD COLUMN latitude REAL;
ALTER TABLE public_signatures ADD COLUMN longitude REAL;
ALTER TABLE public_signatures ADD COLUMN sa1 TEXT;
ALTER TABLE public_signatures ADD COLUMN lga TEXT;
ALTER TABLE public_signatures ADD COLUMN postcode TEXT;
ALTER TABLE public_signatures ADD COLUMN state TEXT;

-- Note: The existing 'address' column will be updated to store the formattedAddress
-- from the Geoscape verification API response
