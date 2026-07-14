import re

with open("asguard-interceptor/tests/interceptor.test.ts", "r") as f:
    content = f.read()

# Make sure we close the bracket properly since I just appended it to the file without removing the closing bracket of the test suite.
content = content.replace("});\n\n  it(\"Task 1: Rejects webhook when timestamp is outside the 5-minute sliding window", "  it(\"Task 1: Rejects webhook when timestamp is outside the 5-minute sliding window")
content += "\n});"

with open("asguard-interceptor/tests/interceptor.test.ts", "w") as f:
    f.write(content)
