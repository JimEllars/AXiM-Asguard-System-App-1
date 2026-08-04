import asyncio
import jwt
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Generate a valid JWT token
        secret = "a" * 32
        payload = {
            "axim_internal_admin": True,
            "exp": datetime.now(timezone.utc) + timedelta(hours=1)
        }
        token = jwt.encode(payload, secret, algorithm="HS256")

        # Set the cookie
        await page.context.add_cookies([{
            "name": "asguard_auth_token",
            "value": token,
            "url": "http://localhost:3000"
        }])

        # Navigate to the page
        await page.goto("http://localhost:3000", wait_until="domcontentloaded")

        # Take a screenshot
        await page.screenshot(path="screenshot.png")
        await browser.close()

asyncio.run(main())
