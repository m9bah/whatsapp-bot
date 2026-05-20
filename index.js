import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const {
  GREEN_API_INSTANCE,
  GREEN_API_TOKEN,
  GEMINI_API_KEY,
  TARGET_GROUP_CHAT_ID, // e.g. 120363XXXXXXXXX@g.us
  PORT = 3000,
} = process.env;

// ── Health check ──────────────────────────────────────────────
app.get("/", (_req, res) => res.send("WhatsApp OCR bot is running ✅"));

// ── Main webhook ──────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  // Acknowledge immediately so Green API doesn't retry
  res.sendStatus(200);

  try {
    const body = req.body;

    // 1. Only handle incoming messages
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const messageData = body.messageData;
    const chatId = body.senderData?.chatId;

    // 2. Filter: must be from the target group
    if (chatId !== TARGET_GROUP_CHAT_ID) {
      console.log(`Ignored message from: ${chatId}`);
      return;
    }

    // 3. Must be an image message
    const isImage =
      messageData?.typeMessage === "imageMessage" ||
      messageData?.typeMessage === "documentMessage";

    if (!isImage) {
      console.log("Not an image message, skipping.");
      return;
    }

    const downloadUrl =
      messageData?.fileMessageData?.downloadUrl ||
      messageData?.imageMessage?.url;

    if (!downloadUrl) {
      console.log("No downloadUrl found in payload.");
      return;
    }

    console.log(`📥 Image received from group. Downloading...`);

    // 4. Download the image
    const imageResponse = await fetch(downloadUrl);
    if (!imageResponse.ok) throw new Error("Failed to download image");

    const imageBuffer = await imageResponse.buffer();
    const base64Image = imageBuffer.toString("base64");

    // Detect mime type from Content-Type header
    const mimeType =
      imageResponse.headers.get("content-type") || "image/jpeg";

    console.log(`🖼️  Image downloaded (${imageBuffer.length} bytes). Sending to Gemini...`);

    // 5. Send to Gemini for OCR
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `You are an expert OCR assistant specializing in handwritten text.
When given an image containing handwriting:
- Extract ALL handwritten text accurately
- Return it as clean, well-structured plain text
- Preserve paragraph and line breaks where meaningful
- Fix obvious spelling mistakes
- Do NOT add commentary, explanations, or labels — return only the extracted text.`,
              },
            ],
          },
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
                {
                  text: "Please read and extract all the handwritten text from this image.",
                },
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("Gemini error:", JSON.stringify(geminiData));
      throw new Error("Gemini API error");
    }

    const extractedText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) throw new Error("No text returned from Gemini");

    console.log(`✅ Gemini extracted text:\n${extractedText}`);

    // 6. Send the result back to the WhatsApp group
    const replyMessage = `📝 *Handwriting Extracted:*\n\n${extractedText}`;

    const sendRes = await fetch(
      `https://api.green-api.com/waInstance${GREEN_API_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: TARGET_GROUP_CHAT_ID,
          message: replyMessage,
        }),
      }
    );

    const sendData = await sendRes.json();
    console.log("📤 Message sent:", JSON.stringify(sendData));
  } catch (err) {
    console.error("❌ Error processing webhook:", err.message);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
