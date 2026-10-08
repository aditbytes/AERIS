# WhatsApp Team Update

Copy everything inside the box below and paste it into the team group. WhatsApp renders `*bold*` and `_italic_`.

```text
🌫️ *AERIS — Team Update (8 Oct, night)* 🚀

Hi team 👋 Aaj poore project ka audit kiya. Short mein status 👇

🟢 *App LIVE hai!*
🌐 Website: https://d2iyso2niquge7.cloudfront.net
⚙️ Pipeline har 30 min chal rahi hai (last 4 runs ✅)
🧪 169 tests pass on main

━━━━━━━━━━━━━━━
✅ *Maine (Aditya) kya kiya*
━━━━━━━━━━━━━━━
☁️ Poora AWS setup: S3, IAM, Secrets Manager, budget alerts
⚡ 10 Lambda functions + EventBridge schedules (FIRMS 15 min, AQI 30 min, weather 1 hr)
🔗 Step Functions pipeline: publish → detect → corridor → rank → agent
🤖 Strands agent on Bedrock, with Claude → Nova → rules fallback
🌍 API Gateway (14 routes) + CloudFront website
🚨 CloudWatch logs, 3 alarms, DLQ, smoke test (live pe PASS ✅)
🛠️ Integration fixes: corridor ka wind direction bug, UI ke hard-coded numbers, stale-data banner
📝 Blog draft, architecture diagram, submission checklist, phase reports

━━━━━━━━━━━━━━━
👏 *Team ne kya kiya*
━━━━━━━━━━━━━━━
👩‍💻 *Meenal* — FIRMS, AQI, wind, sites, population fetchers + real snapshots + exposure ranking 🔥 (124 tests)
👩‍🎨 *Saba* — Dashboard (8 views, map, layers, time control) + agent tools + rules plan 🗺️
👨‍🔬 *Pritam* — Source detection (DBSCAN) PR #13 mein, 84 tests pass ✅ (abhi draft, merge baaki)

━━━━━━━━━━━━━━━
📊 *Kiska kitna kaam baaki hai*
━━━━━━━━━━━━━━━
🟩 Aditya — ~15% baaki
🟩 Meenal — ~15% baaki
🟨 Saba — ~30% baaki
🟥 Pritam — ~75% baaki
📦 Overall project — ~70% done

━━━━━━━━━━━━━━━
📋 *Mera (Aditya) baaki kaam*
━━━━━━━━━━━━━━━
1️⃣ Bedrock billing fix → agent Claude/Nova pe chale (abhi rules plan chal raha hai)
2️⃣ Agent cost control — Claude sirf zaroorat pe chale (warna bill bhaag sakta hai 💸)
3️⃣ Account + alerts checklist
4️⃣ PR #13 review (scikit-learn ka Lambda size check)
5️⃣ Blog publish + video ka AWS part (2:00–2:40) + final submission

━━━━━━━━━━━━━━━
🙏 *Aapka baaki kaam*
━━━━━━━━━━━━━━━
👩‍🎨 *Saba* (sabse urgent 🔴)
• 🎥 *Demo video record karna* — judges sirf video dekhenge!
• ❌ UI se fake / hard-coded values hatana (alert bell ke 3 alerts, Source Breakdown 70/15/7/8 aur 70/30 %, R² = 0.88, "440+ schools", "38 stations" etc.) — list: docs/audit/data-authenticity.md
• 🔀 KPI branch rebase (3 conflicts, ?? 1278 hatana)
• 🧪 Kuch vitest tests + demo-script ke numbers update

👩‍💻 *Meenal*
• 🧪 rank_sites ke tests (abhi zero hain)
• 📉 Exposed population range fix — high bound 3.8 crore aa raha hai vs estimate 4.58 lakh; isko "90% CI" bolna band karo
• ⚡ Ranking 39 sec leti hai aur AQI fetch 105 sec — speed up

👨‍🔬 *Pritam*
• ✅ PR #13 ready karke merge karwao
• 🌫️ Plume corridor model + calibration (params.json) — abhi ke constants uncalibrated hain
• 📖 models/README.md
• (Optional) ML model → SageMaker

━━━━━━━━━━━━━━━
⚠️ *Fake data check*
━━━━━━━━━━━━━━━
✅ Fires, AQI, wind, schools/hospitals, population — sab REAL data hai (NASA, OpenAQ, Open-Meteo, OSM, WorldPop)
❌ Lekin frontend mein 18 jagah fake / stale / galat label wale numbers hain, 6 main dashboard pe 😬
🚫 Video record karne se pehle ye hatana zaroori hai — no-demo-data rule!

━━━━━━━━━━━━━━━
💰 *Running cost*
━━━━━━━━━━━━━━━
🟢 Abhi (rules plan): ~$0.05/din ≈ *$1.5/month* (zyada tar free tier mein)
🤖 Agar Claude Sonnet 4.6 har 30 min chale: ~$4/din ≈ *$120/month* 😱
🟡 Nova Lite pe: ~$0.07/din ≈ $2.2/month
💡 Plan: Claude sirf jab data change ho ya demo pe, baaki Nova Lite
🧾 Abhi tak ka bill: $0 (credits se cover)

━━━━━━━━━━━━━━━
🚀 *Improvements jo kar sakte hain*
━━━━━━━━━━━━━━━
• Alert bell ko real data se chalana (stale feeds, naye fire sources)
• PM2.5 → AQI ke liye CPCB breakpoints (abhi ×1.35 guess hai)
• GitHub Actions CI (tests + build har PR pe)
• Agent sirf data change hone pe chale → 💸 bachat
• Hindi summary + SMS/WhatsApp alerts schools/hospitals ko
• Map pe forecast ki uncertainty dikhana

━━━━━━━━━━━━━━━
⏰ *Next steps (order mein)*
━━━━━━━━━━━━━━━
1. Saba → fake UI values hatao 🧹
2. Saba → video record 🎥
3. Pritam → PR #13 merge ✅
4. Meenal → range fix + tests 🧪
5. Aditya → Bedrock + blog + submit 🏁

Full details repo mein: *docs/audit/* 📂
Koi doubt ho toh batao 🙌 Let's finish strong! 💪🔥
```
