#!/bin/bash
# setup-secrets.sh
# Strict setup instructions/scripts utilizing wrangler secret put for any sensitive tokens

echo "Setting up encrypted secrets for Asguard Interceptor..."

for secret_name in ASGUARD_API_KEY ASGUARD_SERVICE_TOKEN TELEMETRY_INGEST_KEY DEEPSEEK_API_KEY ANTHROPIC_API_KEY; do
    printf "Enter %s: " "$secret_name"
    stty -echo
    read secret_value
    stty echo
    printf "\n"

    if [ -z "$secret_value" ]; then
        echo "$secret_name is required; no secret was changed."
        exit 1
    fi

    printf "%s" "$secret_value" | npx wrangler secret put "$secret_name" --name asguard-interceptor
done

echo "Asguard Interceptor secrets configured."
