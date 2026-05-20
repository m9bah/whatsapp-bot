import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const {
  GREEN_API_INSTANCE,
  GREEN_API_TOKEN,
  GROQ_API_KEY,
  TARGET_GROUP_CHAT_ID,
  PORT = 3000,
} = process.env;

app.get("/", (_req, res) => res.send("WhatsApp OCR bot is running ✅"));

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

    console.log(`🖼️  Image downloaded (${imageBuffer.length} bytes). Sending to Groq...`);

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
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
                text: `You are an expert OCR assistant specializing in handwritten medical/insurance forms.
Extract all handwritten text from this image and organize it into this exact format:

*Insurance Company:* [value]
*Member ID:* [value]
*National ID:* [value]
*Date of Birth:* [dd/mm/yyyy]
*Phone Number:* [value]

*Diagnoses:*
- [diagnosis 1]
- [diagnosis 2]

*Medications:*
- [medication 1]
- [medication 2]

Rules:
- Fix all spelling mistakes, especially drug names and medical terms
- If a field is not found in the image, write: Not mentioned
- Keep drug names in their correct international format
- Do not add any commentary or extra text`,
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    const groqData = await groqRes.json();

    if (!groqRes.ok) {
      console.error("Groq error:", JSON.stringify(groqData));
      throw new Error("Groq API error");
    }

    const extractedText = groqData?.choices?.[0]?.message?.content;

    if (!extractedText) throw new Error("No text returned from Groq");

    console.log(`✅ Groq extracted text:\n${extractedText}`);

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
