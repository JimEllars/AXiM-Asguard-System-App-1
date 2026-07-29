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
        context = await browser.new_context(record_video_dir="video/")
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

            # Click the cron badge
            await page.wait_for_selector('text=CRON AUTOMATION: ACTIVE')
            await page.click('text=CRON AUTOMATION: ACTIVE')

            await page.wait_for_timeout(2000)

            await page.screenshot(path="cron_popover.png")
            print("Captured screenshot.")
        except Exception as e:
            print("Failed to run test:", e)
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
