import asyncio
from playwright.async_api import async_playwright
import jwt
from datetime import datetime, timezone, timedelta

mock_secret = b'01234567890123456789012345678901'
payload = {
    'axim_internal_admin': True,
    'exp': datetime.now(timezone.utc) + timedelta(hours=1)
}
token = jwt.encode(payload, mock_secret, algorithm='HS256')

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        await context.add_cookies([{
            'name': 'asguard_auth_token',
            'value': token,
            'domain': 'localhost',
            'path': '/'
        }])
        page = await context.new_page()
        try:
            await page.goto("http://localhost:3000", wait_until='domcontentloaded')
            print("Loaded page successfully.")
        except Exception as e:
            print("Failed to load page:", e)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
