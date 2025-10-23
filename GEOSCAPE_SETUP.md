# Geoscape API Setup Instructions

This document explains how to configure the Geoscape API integration for the address autocomplete feature.

## Overview

The application uses the Geoscape API (PSMA) to provide Australian address autocomplete functionality in the public signature form. To protect the API key, the application implements a proxy endpoint that makes requests to the Geoscape API on behalf of the frontend.

## Configuration Steps

### 1. Local Development Setup

For local development with `npm run dev`, you need to create a `.dev.vars` file in your project root:

```bash
# Copy the example file and add your actual API key
cp .dev.vars.example .dev.vars
# Then edit .dev.vars and replace 'your-geoscape-api-key-here' with your actual key
```

Or create it manually:

```bash
# Create .dev.vars file (this file is already in .gitignore)
echo "GEOSCAPE_API_KEY=your-actual-geoscape-api-key-here" > .dev.vars
```

**Important:** The `.dev.vars` file is already in `.gitignore` to prevent accidentally committing the API key to version control.

### 2. Production Deployment Setup

For production (deployed workers), you need to configure the `GEOSCAPE_API_KEY` as a Cloudflare Workers secret:

#### Option A: Using Wrangler CLI (Recommended)

```bash
npx wrangler secret put GEOSCAPE_API_KEY
```

When prompted, paste your Geoscape API key.

#### Option B: Using Cloudflare Dashboard

1. Log in to your Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select your worker
4. Go to Settings → Variables
5. Under "Environment Variables", click "Add variable"
6. Add a new **Secret** (not a variable):
   - Name: `GEOSCAPE_API_KEY`
   - Value: Your Geoscape API key

### 3. Verify the Configuration

After setting the secret, redeploy your worker:

```bash
npm run deploy
```

### Key Differences: Local vs Production

| Environment | Configuration Method | File/Location |
|-------------|---------------------|---------------|
| **Local Development** (`npm run dev`) | `.dev.vars` file | Project root (gitignored) |
| **Production** (deployed) | Worker Secret | Cloudflare Dashboard or Wrangler CLI |

**Why the difference?**
- Worker secrets are encrypted and only available in the deployed production environment
- Local development uses `.dev.vars` to simulate environment variables
- This separation ensures your API key is never committed to version control while still allowing local testing

## How It Works

### Frontend Component

The `AddressAutocomplete` component (`src/react-app/components/AddressAutocomplete.tsx`):
- Provides a text input with autocomplete dropdown
- Debounces user input (300ms delay)
- Requires minimum 3 characters before searching
- Displays loading spinner during API calls
- Supports keyboard navigation (arrow keys, enter, escape)
- Provides accessible ARIA attributes

### Backend Proxy Endpoint

The worker endpoint (`/api/address/search`):
- Accepts a `query` parameter via GET request
- Validates query (minimum 3 characters)
- Proxies the request to `https://api.psma.com.au/v1/predictive/address`
- Includes the `GEOSCAPE_API_KEY` in the Authorization header
- Returns the JSON response from Geoscape

### Database

The `address` field has been added to the `public_signatures` table to store the selected address.

## API Response Format

The Geoscape API returns suggestions in this format:

```json
{
  "suggest": [
    {
      "address": "219 NORMAN ST, BALLARAT NORTH VIC 3350",
      "id": "GAVIC423834288",
      "rank": 0
    },
    ...
  ]
}
```

## Testing

Once the API key is configured, you can test the address autocomplete:

1. Navigate to the public signature form
2. Click on the "Address" field
3. Type at least 3 characters (e.g., "219 Nor")
4. Address suggestions should appear in a dropdown
5. Select an address from the suggestions

## Troubleshooting

### 401 Unauthorized Error

If you see "Geoscape API error: 401" in the console:
- The `GEOSCAPE_API_KEY` secret is not set or is invalid
- Verify the key is correct
- Ensure you've redeployed after setting the secret

### No Suggestions Appearing

- Check browser console for errors
- Ensure you've typed at least 3 characters
- Verify the API key is valid and has not expired
- Check Cloudflare Workers logs for detailed error messages

### Address Field Not Showing

- Clear browser cache and reload
- Check that the React component is properly imported in SignatureForm
- Verify the build completed successfully

## Security Notes

- The API key is stored as a Worker secret (encrypted at rest)
- The key is never exposed to the frontend/client
- All requests are proxied through the Worker to hide the key
- Rate limiting is applied to prevent abuse

## Additional Resources

- [Geoscape API Documentation](https://api.psma.com.au/docs)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
