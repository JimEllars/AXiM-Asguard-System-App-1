import re

with open("asguard-interceptor/src/index.ts", "r") as f:
    content = f.read()

search_code = """        const bodyData = JSON.parse(bodyText);
        const timestamp: number = bodyData.timestamp;

        if (!timestamp || typeof timestamp !== 'number') {
          return new Response("Unauthorized", { status: 401, headers: getCorsHeaders(request, env, isMutation) });
        }

        const now = Date.now();
        if (Math.abs(now - timestamp) > 300000) {"""

replace_code = """        const bodyData = JSON.parse(bodyText);
        const incomingTimestamp: number = bodyData.timestamp;

        if (!incomingTimestamp || typeof incomingTimestamp !== 'number') {
          return new Response("Unauthorized", { status: 401, headers: getCorsHeaders(request, env, isMutation) });
        }

        const currentTime = Date.now();
        if (Math.abs(currentTime - incomingTimestamp) > 300000) {"""

content = content.replace(search_code, replace_code)

with open("asguard-interceptor/src/index.ts", "w") as f:
    f.write(content)
