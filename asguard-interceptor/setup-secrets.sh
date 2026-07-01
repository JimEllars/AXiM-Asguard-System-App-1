#!/bin/bash
# setup-secrets.sh
# Strict setup instructions/scripts utilizing wrangler secret put for any sensitive tokens

echo "Setting up encrypted secrets for Asguard Interceptor..."

# Example token, replace with actual prompt input in a real environment
if [ -z "$UPSTREAM_API_TOKEN" ]; then
    echo "Warning: UPSTREAM_API_TOKEN is not set. Using a placeholder for demonstration."
    UPSTREAM_API_TOKEN="dummy_token_123"
fi

echo "$UPSTREAM_API_TOKEN" | npx wrangler secret put UPSTREAM_API_TOKEN --name asguard-interceptor

echo "Secrets setup completed securely."
