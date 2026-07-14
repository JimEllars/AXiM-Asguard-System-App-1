import re

with open("asguard-interceptor/src/index.ts", "r") as f:
    content = f.read()

search = """      const clonedRequest = request.clone();
      const bodyText = await clonedRequest.text();

      try {
        const encoder = new TextEncoder();"""

replace = """      const clonedRequest = request.clone();
      const bodyText = await clonedRequest.text();

      try {
        const bodyData = JSON.parse(bodyText);
        const timestamp: number = bodyData.timestamp;

        if (!timestamp || typeof timestamp !== 'number') {
          return new Response("Unauthorized", { status: 401, headers: getCorsHeaders(request, env, isMutation) });
        }

        const now = Date.now();
        if (Math.abs(now - timestamp) > 300000) {
          return new Response("Unauthorized", { status: 401, headers: getCorsHeaders(request, env, isMutation) });
        }

        const encoder = new TextEncoder();"""

content = content.replace(search, replace)

with open("asguard-interceptor/src/index.ts", "w") as f:
    f.write(content)
