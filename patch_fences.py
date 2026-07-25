import re

with open('asguard-interceptor/src/index.ts', 'r') as f:
    content = f.read()

old_fence = """        if (!payload.key || payload.key.startsWith("wallet:")) {
          return new Response("Bad Request: Invalid key structural fence", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }"""

new_fence = """        if (
          !payload.key ||
          payload.key.startsWith("wallet:") ||
          payload.key.startsWith("token:axim_") ||
          payload.key.startsWith("ip:10.") ||
          payload.key.startsWith("ip:127.0.0.1") ||
          payload.key.startsWith("ip:192.168.")
        ) {
          return new Response("Bad Request: Invalid key structural fence or protected internal target", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }"""

content = content.replace(old_fence, new_fence)

with open('asguard-interceptor/src/index.ts', 'w') as f:
    f.write(content)
