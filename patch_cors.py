import re

file_path = 'asguard-interceptor/src/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

search_pattern = """function getCorsHeaders(request: Request, env: Env, isMutation: boolean) {
  let origin = request.headers.get("Origin");
  let allowedOrigin = "*";

  if (isMutation || request.method === "OPTIONS") {
    const allowedOriginsStr = env.ALLOWED_ORIGIN || "https://production-domain.com";
    const allowedOriginsArray = allowedOriginsStr.split(',').map(s => s.trim());

    if (origin) {
      if (allowedOriginsArray.includes(origin)) {
        allowedOrigin = origin;
      } else if (origin.endsWith('.staging.domain.com') || origin.endsWith('.testing.domain.com')) {
        // If testing subdomains are dynamically allowed
        allowedOrigin = origin;
      } else {
        allowedOrigin = "DENY";
      }
    }
  }"""

replace_pattern = """function getCorsHeaders(request: Request, env: Env, isMutation: boolean) {
  let origin = request.headers.get("Origin");
  let allowedOrigin = "*";

  if (isMutation || request.method === "OPTIONS") {
    if (!env.ALLOWED_ORIGIN && origin) {
      allowedOrigin = origin;
    } else {
      const allowedOriginsStr = env.ALLOWED_ORIGIN || "https://production-domain.com";
      const allowedOriginsArray = allowedOriginsStr.split(',').map(s => s.trim());

      if (origin) {
        if (allowedOriginsArray.includes(origin)) {
          allowedOrigin = origin;
        } else if (
          origin === "http://localhost:3000" ||
          origin.endsWith('.staging.domain.com') ||
          origin.endsWith('.testing.domain.com')
        ) {
          // If testing subdomains or local loopback are dynamically allowed
          allowedOrigin = origin;
        } else {
          allowedOrigin = "DENY";
        }
      }
    }
  }"""

if search_pattern in content:
    new_content = content.replace(search_pattern, replace_pattern)
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("Patched successfully")
else:
    print("Could not find the search pattern")
