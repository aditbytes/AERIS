# AERIS kya karta hai? (Short mein, Hinglish mein)

> ⚠️ **No demo data.** AERIS sirf real, live data use karta hai. Koi mock, sample ya fake data nahi — na code mein, na UI mein, na tests mein. Agar koi live source down hai, toh error dikhao, fake number nahi.

## Ek line mein

**AERIS ek AI system hai jo batata hai ki pollution kahan se aa raha hai, dhuaan kidhar jayega, kaun log uski chapet mein aayenge, aur authorities ko abhi kya karna chahiye — dhuaan pahunchne se pehle.**

## Problem kya hai?

Har saal October–November mein Punjab aur Haryana mein parali (stubble) jalti hai, aur uska dhuaan Delhi NCR tak pahunchta hai. Abhi ke AQI apps sirf batate hain ki "aaj hawa kharab hai" — jab log already zehrili hawa saans mein le chuke hote hain. AERIS isko **reporting problem** se **decision problem** bana deta hai.

## AERIS 4 steps mein kaam karta hai

```
🔥 Source  →  🌫️ Plume  →  👥 Exposure  →  🚨 Action
(kahan aag)   (dhuaan kidhar)  (kaun hit hoga)  (kya karna hai)
```

1. **🔥 Source dhoondhna** — NASA ke satellite (FIRMS / VIIRS) se aag ke points aate hain. AERIS paas-paas ki aag ko group karke "sources" banata hai (jaise "Punjab mein 197 fires ka ek cluster")
2. **🌫️ Plume ka raasta predict karna** — Open-Meteo se hawa ki speed aur direction leke, AERIS calculate karta hai ki agle 0–24 ghante mein dhuaan kis corridor mein jayega, aur kitne ghante mein kahan pahunchega (ETA)
3. **👥 Kaun hit hoga** — OpenStreetMap ke 3,132 schools aur hospitals, aur WorldPop ki population ko us corridor ke saath match karke ranking banata hai: kaunsa school/hospital sabse pehle aur sabse zyada affect hoga, aur kitne log exposed honge
4. **🚨 Action plan** — Ek AI agent (Strands Agents SDK, Amazon Bedrock pe) ranking padh ke plan likhta hai: "Is hospital mein HEPA purifiers on karo, is school mein outdoor assembly band karo, DPCC/CAQM advisory jaari karo" — har action ke saath ETA aur PM2.5 ka reason

Ye sab **ek map pe** dikhta hai: aag → dhuaan ka raasta → khatre wale schools/hospitals → action plan.

## AWS pe kaise chalta hai?

- **EventBridge** har 15/30/60 minute pe data laata hai (aag, AQI, hawa)
- **Lambda** functions data fetch karte hain aur **S3** mein save karte hain
- **Step Functions** har 30 minute pe poori chain chalata hai: publish → detect → corridor → rank → agent
- **Bedrock** pe AI agent action plan likhta hai (abhi billing issue ki wajah se rules-based plan chal raha hai)
- **API Gateway** data serve karta hai, aur **CloudFront** website dikhata hai
- **CloudWatch + SNS** alarms bhejte hain agar kuch fail ho

Live website: https://d2iyso2niquge7.cloudfront.net

## Kisne kya banaya?

| Member | Kaam |
|--------|------|
| **Aditya** | Poora AWS setup, pipeline, API, website hosting, alarms, testing, integration, docs |
| **Meenal** | Data laana (aag, AQI, hawa, schools, population) aur exposure ranking |
| **Pritam** | Source detection aur plume model (source detection PR mein hai, baaki pending) |
| **Saba** | AI agent ke tools, dashboard / map UI, demo video |

## Ek example (real data, 8 Oct 2026, 16:14 UTC)

- 10 fire sources mile, total 387 fires
- 1,806 schools/hospitals corridor mein rank huye
- Sabse upar: Janakpuri Super Speciality Hospital, Delhi (ETA 0 ghante — already corridor ke andar)
- Estimated exposed population: ~4.58 lakh log

> Ye numbers live dashboard se hain; har run ke saath badalte hain.
