"""
daily_scheduler.py — Empire OS Daily Content Scheduler
=======================================================
Runs as a Railway Cron Job every morning. Zero Claude usage.
Picks content from a 30-day rotating bank, uploads a background
image, and schedules posts to all 5 Postiz channels.

Railway setup:
  1. In your Railway project → New Service → Cron Job
  2. Command: python daily_scheduler.py
  3. Schedule: 0 8 * * *   (8 AM daily)
  4. Add env vars: POSTIZ_API_KEY

Requirements: pip install requests
"""

import os
import io
import json
import random
import requests
import logging
from datetime import datetime, timezone, timedelta

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("empire-os")

# ── Config ────────────────────────────────────────────────────────────────────

POSTIZ_KEY = os.environ.get("POSTIZ_API_KEY", "ae24af768db8cdef7db421c7fd2c32e0de87ddcf0c41412136824342222f4c28")
API        = "https://api.postiz.com/public/v1"
HEADERS    = {"Authorization": POSTIZ_KEY, "Content-Type": "application/json"}

CHANNELS = {
    "vaultmmnbul":    {"id": "cmqjybuiy060qmm0yi0rsqjjz", "platform": "tiktok", "post_hour": 14},
    "beyondthealibi": {"id": "cmqjym5m503c6p40yfgayund0", "platform": "tiktok", "post_hour": 19},
    "thetechtalks":   {"id": "cmqjykl5y03bup40ykl3z5mg3", "platform": "tiktok", "post_hour": 22},
    "liftlab":        {"id": "cmqjymxml03c9p40ynboxoibc", "platform": "youtube", "post_hour": 14},
    "techhub":        {"id": "cmqjync1p0633mm0y7s4nlzwp", "platform": "youtube", "post_hour": 16},
}

TIKTOK_SETTINGS = {
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "duet": True, "stitch": True, "comment": True,
    "autoAddMusic": "no",
    "brand_content_toggle": False, "brand_organic_toggle": False,
    "content_posting_method": "DIRECT_POST",
}

# ── 30-day content banks ──────────────────────────────────────────────────────

CONTENT = {

"vaultmmnbul": [
    ("", """Nobody teaches you this in school 📚

Compound interest at work:
$100/month at 22 = $380,000 by 65
$100/month at 32 = $170,000 by 65
$100/month at 42 = $75,000 by 65

The difference? Just 10 years.

Start now. Time is the only thing you can't buy back.

#personalfinance #investing #compoundinterest #moneytips #wealthbuilding #financialfreedom #budgeting"""),
    ("", """The 50/30/20 rule changed how I handle money forever 💸

20% → Savings & debt payoff
30% → Wants
50% → Needs

#personalfinance #budgeting #moneytips"""),
    ("", """This credit card trick saved me $1,200 last year 💳

Call your credit card company and ask for:
✅ Lower interest rate

#personalfinance #creditscore #moneyhacks"""),
    ("", """Stop leaving free money on the table 🤑

#401k employer match - free money
HSA - triple tax advantage

#personalfinance"""),
    ("", """I tracked every dollar for 30 days. Here's what shocked me 😳

Total waste: $570/month

#personalfinance #moneytips"""),
    ("", """3 money rules I wish I learned at 18 💰

1. Pay yourself first
2. Never buy depreciating assets on credit
3. Savings rate > income

#personalfinance"""),
    ("", """The latte factor is a lie. Fix the dollars not the cents.

#personalfinance #moneytips"""),
    ("", """Index funds explained in 60 seconds 📈

SPY, VOO, VTI - pick one and hold.

#personalfinance #indexfunds"""),
    ("", """Emergency fund: put it in a HIGH-YIELD savings account (5%+).

#personalfinance #emergencyfund"""),
    ("", """How to negotiate your salary and actually get it 💼

85% of people who negotiate get more money.

#personalfinance #salary"""),
    ("", """The 4% rule: retire number = annual expenses x 25.

#personalfinance #retirement"""),
    ("", """Debt payoff: avalanche vs snowball - pick the one you'll finish.

#personalfinance #debtfree"""),
    ("", """Your net worth is not your income. Track it monthly.

#personalfinance #networth"""),
    ("", """Buy used cars. Always.

#personalfinance #moneytips"""),
    ("", """Systems beat willpower. Auto-transfer on payday.

#personalfinance #savingmoney"""),
],

"beyondthealibi": [
    ("", """Everyone is sleeping on this free AI tool 🤫

Perplexity AI vs Google: research in 5 seconds not 2 hours.

#AItools #productivity"""),
    ("", """ChatGPT prompt that saves me 3 hours/week ⏰

Act as [role]. Give me [output]. Tone: [tone].

#ChatGPT #AItools"""),
    ("", """5 AI tools I can't live without in 2026 🔥

Cursor, Gamma, ElevenLabs, Runway,Notion AI

#AItools"""),
    ("", """Notebook LM by Google - 300 page book summarised in 8 minutes.

#AItools #productivity"""),
    ("", """n8n self-hosted = FREE forever. Connects 400+ apps.

#AItools #automation"""),
    ("", """Firecrawl + Claude = competitive analysis in 30 seconds.

#AItools"""),
    ("", """Flux by Black Forest Labs - free AI images that beat Midjourney.

#AItools #aiart"""),
    ("", """The AI stack running my business under $100/month.

#AItools #entrepreneur"""),
    ("", """Cal.ai - AI books your meetings automatically.

#AItools #productivity"""),
    ("", """Rewrite emails with ChatGPT: instantly sound 10x more professional.

#CatGPT #AItools"""),
    ("", """Stop using ChatGPT like a search engine. Give specific context.

#ChatGPT #promptengineering"""),
    ("", """Taplio writes LinkedIn posts in your voice. Engagement tripled.

#AItools #linkedin"""),
    ("", """Whisper by OpenAI - free transcription better than Otter.ai.

#AItools"""),
    ("", """Monica AI - summarise any webpage in one click.

#AItools #chrome"""),
    ("", """Claude vs ChatGPT: use both. They're not the same tool.

#AItools"""),
],

"thetechtalks": [
    ("", """Cursor AI - shipped a full feature in 4 hours that used to take 2 days.

#developer #coding"""),
    ("", """5 Chrome extensions every developer needs 🔧

Wappalyzer, JSONFormatter, Octotree, daily.dev, Refined GitHub

#developer #webdev"""),
    ("", """Full production stack for ~5/month: Cloudflare+Railway +Supabase+Vercel

#developer #hosting"""),
    ("", """journalctl -xeu [service] --no-pager | tail -50 - fixes 90% of server issues.

#developer #linux"""),
    ("", """5 git commands you actually use: stash, log --oneline, diff HEAD~1

#developer #git"""),
    ("", """SQLite → Turso: 10ms reads anywhere, free up to 9GB.

#developer #database"""),
    ("", """Justfile replaces Makefiles with readable commands.

#developer #devops"""),
    ("", """Bruno - free Postman replacement that stores collections in Git.

#developer #api"""),
    ("", """$82/month saved: Cursor+Brunn+Penpot+Plane+Mattermost+Cloudflare

#developer #tools"""),
    ("", """Ctrl+Shift+P = VS Code Command Palette. Never dig through menus again.

#developer #vscode"""),
    ("", """Docker: package your app so it runs identically everywhere.

#developer #docker"""),
    ("", """zod - TypeScript schema validation. Zero runtime crashes.

#developer #typescript"""),
    ("", """Read the LAST line of an error first. Most debugging time is wasted.

#developer #debugging"""),
    ("", """Regexr.com - write regex with live explanations.

#developer #regex"""),
    ("", """Terminal setup: Oh My Zsh+fzf+bat+eza+starship = 30 min setup, forever gain.

#developer #terminal"""),
],

"liftlab": [
    ("The #1 Mistake Killing Your Muscle Gains", """Muscle grows during REST - not in the gym. 3-4 sessions/week max effort.

#fitness #musclebuilding #LiftLab #Shorts"""),
    ("3 Exercises That Build More Muscle", """1. Barbell Squat 2. Romanian Deadlift 3. Weighted Pull-Up

#fitness #workout #LiftLab #Shorts"""),
    ("Why You're Not Losing Fat", """Healthy != low calorie. Track food for 7 days.

#fitness #fatloss #LiftLab #Shorts"""),
    ("Morning vs Evening Workouts", """Best workout time: the one you'll actually do.

#fitness #workout #LiftLab #Shorts"""),
    ("Eat MORE To Lose Fat", """200-300 calorie deficit. Slow and sustainable beats fast and miserable.

#fitness #fatloss #LiftLab #Shorts"""),
    ("The Warm-Up Mistake", """Static stretching BEFORE lifting reduces strength up to 8%.

#fitness #workout #LiftLab #Shorts"""),
    ("How Many Sets Per Week?", """Minimum: Beginner 10, Intermediate 15, Acdvanced 20+ sets/week.

#fitness #workout #LiftLab #Shorts"""),
    ("Protein Myth Debunked", """0.7-1g per lb is the sweet spot. Not 2g.

#fitness #nutrition #LiftLab #Shorts"""),
    ("Sleep Is Your Secret Weapon", """7-9 hours isn't optional. It's training.

#fitness #sleep #LiftLab #Shorts"""),
    ("Why Your Bench Isn't Growing", """Add progressive overload: 2.5-5lbs or 1 rep every session.

#fitness #benchpress #LiftLab #Shorts"""),
],

"techhub": [
    ("Productivity Stack Saving 15 Hours/Week", """Notion+Zapier+Calendly+Loom+1Password = 15+ hours saved weekly.

#productivity #tech #TechHub #Shorts"""),
    ("Apple Intelligence in macOS", """Settings → Apple Intelligence → Turn on everything.

#tech #apple #TechHub #Shorts"""),
    ("Stop Using Weak Passwords", """1Password: one master password, uncrackable passwords for every site.

#tech #cybersecurity #TechHub #Shorts"""),
    ("Note-Taking System That Sticks", """Just Obsidian: local files, backlinks, graph view. Free.

#productivity #notes #TechHub #Shorts"""),
    ("Automated Weekly Report", """Claude+m8n automates my weekly report. Setup once, runs forever.

#productivity #automation #TechHub #Shorts"""),
    ("Clipboard Manager", """Maccy (macOS) or Ditto (Windows) - remembers last 200 items. Free.

#productivity #tech #TechHub #Shorts"""),
    ("Browser Setup for 2x Speed", """Arc+Vimium+uBlock +Dark Reader+Raindrop = time fighting browser: zero.

#tech #browser #TechHub #Shorts"""),
    ("Why Use a Password Manager", """Bitwarden - free, open source. Unique password for every site.

#tech #cybersecurity #TechHub #Shorts"""),
    ("Email Habit Saving 1 Hour/Day", """Check email only 2x/day. 2-minute rule. Unsubscribe ruthlessly.

#productivity #email #TechHub #Shorts"""),
    ("Best Free Screen Recorder", """Loom: replace your next 30-min meeting with a 3-min Loom.

#tech #productivity #TechHub #Shorts"""),
],

}  # end CONTENT

# ── Helpers ──────────

def get_headers_upload():
    return {"Authorization": POSTIZ_KEY}


def upload_background_image(channel: str) -> dict | None:
    seed = f"{channel}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    url = f"https://picsum.photos/seed/{seed}/800/1422"
    try:
        img_resp = requests.get(url, timeout=15)
        img_resp.raise_for_status()
        files = {"file": (f"bg_{seed}.jpg", io.BytesIO(img_resp.content), "image/jpeg")}
        resp = requests.post(f"{API}/upload", headers=get_headers_upload(), files=files, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        log.info(f"Uploaded image for {channel}: {data.get('path')}")
        return {"id": data["id"], "path": data["path"]}
    except Exception as e:
        log.warning(f"Image upload failed for {channel}: {e}")
        return None


def get_scheduled_dates(channel_id: str) -> set:
    now = datetime.now(timezone.utc)
    params = {
        "startDate": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endDate":   (now + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        r = requests.get(f"{API}/posts", headers=HEADERS, params=params, timeout=15)
        r.raise_for_status()
        posts = r.json().get("posts", [])
        dates = set()
        for p in posts:
            if p.get("integration", {}).get("id") == channel_id:
                d = p.get("publishDate", "")[:10]
                if d:
                    dates.add(d)
        return dates
    except Exception as e:
        log.warning(f"Could not fetch existing posts: {e}")
        return set()


def pick_content(channel: str) -> tuple:
    bank = CONTENT[channel]
    day_index = datetime.now(timezone.utc).timetuple().tm_yday
    return bank[day_index % len(bank)]


def schedule_post(channel: str, ch_config: dict, title: str, content: str, image: dict | None) -> bool:
    now = datetime.now(timezone.utc)
    post_time = now.replace(hour=ch_config["post_hour"], minute=0, second=0, microsecond=0)
    if post_time < now:
        post_time += timedelta(days=1)

    is_youtube = ch_config["platform"] == "youtube"
    img_list = ([image] if image else []) if not is_youtube else []

    settings = (
        {"title": title or content[;80], "type": "public", "for_kids": False}
        if is_youtube else
        {**TIKTOK_SETTINGS}
    )

    body = {
        "type": "draft" if is_youtube else "schedule",
        "creationMethod": "API",
        "date": post_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "shortLink": True,
        "tags": [],
        "posts": [{
            "integration": {"id": ch_config["id"]},
            "value": [{"content": content, "image": img_list, "delay": 0}],
            "settings": settings,
        }],
    }

    try:
        r = requests.post(f"{API}/posts", headers=HEADERS, data=json.dumps(body), timeout=30)
        if r.status_code in (200, 201):
            log.info(f"✅ {channel} → {post_time.strftime('%Y-%m-%d %H:%M')} UTC")
            return True
        else:
            log.error(f"❌ {channel} failed: {r.status_code} {r.text[:200]}")
            return False
    except Exception as e:
        log.error(f"❌ {channel} error: {e}")
        return False


def main():
    log.info("=" * 50)
    log.info(f"Empire OS Daily Scheduler — {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")
    log.info("=" * 50)

    results = {"success": [], "skipped": [], "failed": []}

    for channel, ch_config in CHANNELS.items():
        log.info(f"\nProcessing: {channel}")

        scheduled = get_scheduled_dates(ch_config["id"])
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        if tomorrow in scheduled:
            log.info(f"  ↩ Already has a post for {tomorrow}, skipping.")
            results["skipped"].append(channel)
            continue

        title, content = pick_content(channel)

        image = None
        if ch_config["platform"] == "tiktok":
            image = upload_background_image(channel)
            if not image:
                log.warning(f"  ⚠ No image for {channel} — post may fail on TikTok")

        ok = schedule_post(channel, ch_config, title, content, image)
        if ok:
            results["success"].append(channel)
        else:
            results["failed"].append(channel)

    log.info("\n" + "=" * 50)
    log.info(f"✅ Scheduled: {results['success']}")
    log.info(f"↩  Skipped:   {results['skipped']}")
    log.info(f"❌ Failed:    {results['failed']}")
    log.info("=" * 50)


if __name__ == "__main__":
    main()
