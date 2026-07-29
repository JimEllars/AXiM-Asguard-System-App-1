import re

with open('asguard-interceptor/wrangler.toml', 'r') as f:
    content = f.read()

content = re.sub(
    r'crons\s*=\s*\["0 0 \* \* \*"\]',
    'crons = ["0 * * * *", "0 0 * * *"]',
    content
)

with open('asguard-interceptor/wrangler.toml', 'w') as f:
    f.write(content)
