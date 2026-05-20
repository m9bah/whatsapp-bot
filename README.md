# WhatsApp Handwriting OCR Bot

Receives images sent to a WhatsApp group → reads handwriting with Google Gemini → replies with structured text. Built with Node.js, Green API, and Gemini 1.5 Flash.

## Stack
- **Green API** — WhatsApp webhook + message sending
- **Google Gemini 1.5 Flash** — handwriting OCR
- **Express.js** — webhook server
- **Railway / Render** — free hosting

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Fill in your `.env`:
- `GREEN_API_INSTANCE` + `GREEN_API_TOKEN` → from https://console.green-api.com
- `GEMINI_API_KEY` → from https://aistudio.google.com/app/apikey
- `TARGET_GROUP_CHAT_ID` → your group's chat ID (e.g. `120363XXXXXXXXX@g.us`)

### 3. Find your group's chatId
- In Green API console, go to **API → receiveNotification**
- Send any message to your group
- Look for `senderData.chatId` in the response — that's your group ID

### 4. Run locally
```bash
npm run dev
```

### 5. Expose locally for testing (optional)
```bash
npx ngrok http 3000
# Copy the https URL, use it as your webhook in Green API
```

---

## Deploy to Railway (Free)

1. Push this folder to a GitHub repo
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Add environment variables in Railway dashboard (Settings → Variables)
4. Railway auto-deploys and gives you a public URL
5. Set that URL + `/webhook` as your Green API webhook

### Set Webhook in Green API
In your Green API instance settings:
- **Webhook URL**: `https://your-app.railway.app/webhook`
- Enable: **Incoming Messages**

---

## How It Works

```
WhatsApp Group
     │  (user sends photo of handwriting)
     ▼
Green API Webhook
     │  POST /webhook
     ▼
Filter: chatId === TARGET_GROUP_CHAT_ID?
     │  YES
     ▼
Download Image (from downloadUrl in payload)
     │
     ▼
Google Gemini 1.5 Flash
     │  (OCR: extract handwritten text)
     ▼
Green API sendMessage
     │  (reply to same group with extracted text)
     ▼
WhatsApp Group
     (bot replies with structured text)
```
