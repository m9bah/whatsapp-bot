import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const {
  GREEN_API_INSTANCE,
  GREEN_API_TOKEN,
  OPENAI_API_KEY,
  TARGET_GROUP_CHAT_ID,
  PORT = 3000,
} = process.env;

// ── Health check ──────────────────────────────────────────────
app.get("/", (_req, res) => res.send("WhatsApp OCR bot is running ✅"));

// ── Main webhook ──────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.typeWebhook !== "incomingMessageReceived") return;

    const messageData = body.messageData;
    const chatId = body.senderData?.chatId;

    if (chatId !== TARGET_GROUP_CHAT_ID) {
      console.log(`Ignored message from: ${chatId}`);
      return;
    }

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

    const imageResponse = await fetch(downloadUrl);
    if (!imageResponse.ok) throw new Error("Failed to download image");

    const imageBuffer = await imageResponse.buffer();
    const base64Image = imageBuffer.toString("base64");
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    console.log(`🖼️  Image downloaded (${imageBuffer.length} bytes). Sending to OpenAI...`);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert OCR assistant specializing in handwritten text.
When given an image containing handwriting:
- Extract ALL handwritten text accurately
- Return it as clean, well-structured plain text
- Preserve paragraph and line breaks where meaningful
- Fix obvious spelling mistakes, including drug names and medical terms
- Do NOT add commentary, explanations, or labels — return only the extracted text.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
              {
                type: "text",
                text: "Please read and extract all the handwritten text from this image.",
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    const openaiData = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI error:", JSON.stringify(openaiData));
      throw new Error("OpenAI API error");
    }

    const extractedText = openaiData?.choices?.[0]?.message?.content;

    if (!extractedText) throw new Error("No text returned from OpenAI");

    console.log(`✅ OpenAI extracted text:\n${extractedText}`);

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
