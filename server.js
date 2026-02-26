// server.js
const express = require("express");
const axios = require("axios");
const { WebClient } = require("@slack/web-api");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ===============================
   Environment Variables
================================= */
const {
  SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  PORT
} = process.env;

// Validate required env vars
function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

requireEnv("SLACK_BOT_TOKEN", SLACK_BOT_TOKEN);
requireEnv("SLACK_CHANNEL_ID", SLACK_CHANNEL_ID);
requireEnv("TWILIO_ACCOUNT_SID", TWILIO_ACCOUNT_SID);
requireEnv("TWILIO_AUTH_TOKEN", TWILIO_AUTH_TOKEN);

console.log("Environment variables loaded successfully.");

/* ===============================
   Initialize Slack Client
================================= */
const slack = new WebClient(SLACK_BOT_TOKEN);

/* ===============================
   Twilio Webhook Endpoint
================================= */
app.post("/twilio", async (req, res) => {
  console.log("Incoming Twilio POST:", req.body);

  const from = req.body.From;
  const body = req.body.Body;
  const numMedia = parseInt(req.body.NumMedia || "0");

  // Respond immediately to Twilio
  res.status(200).type("text/xml").send("<Response></Response>");

  try {
    // ===== SMS ONLY =====
    if (numMedia === 0) {
      console.log(`SMS from ${from}: ${body}`);

      const slackResponse = await slack.chat.postMessage({
        channel: SLACK_CHANNEL_ID,
        text: `📩 New SMS from ${from}\n${body || "(no message body)"}`
      });

      console.log("Slack text response:", slackResponse.ok);
      return;
    }

    // ===== MMS WITH MEDIA =====
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const contentType =
        req.body[`MediaContentType${i}`] || "image/jpeg";
      const extension = contentType.split("/")[1] || "jpg";

      console.log(`Downloading media ${i + 1}:`, mediaUrl);

      // Download from Twilio
      const twilioResponse = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
              "base64"
            )
        }
      });

      const fileBuffer = Buffer.from(twilioResponse.data);

      // Upload to Slack using files.uploadV2
      try {
        const slackUpload = await slack.files.uploadV2({
          channel_id: SLACK_CHANNEL_ID,
          initial_comment: `📷 New MMS from ${from}`,
          file: fileBuffer,
          filename: `mms-${Date.now()}.${extension}`
        });

        if (!slackUpload.ok) {
          console.error("Slack upload failed:", slackUpload.error);
          if (slackUpload.error === "not_in_channel") {
            console.error(
              `Invite the bot to channel ${SLACK_CHANNEL_ID} to allow uploads.`
            );
          }
        } else {
          console.log("Slack upload succeeded:", slackUpload.file.id);
        }
      } catch (err) {
        console.error("Slack upload exception:", err.message);
      }
    }
  } catch (err) {
    console.error("Processing error:", err.response?.data || err.message);
  }
});

/* ===============================
   Health Check Route
================================= */
app.get("/", (req, res) => {
  res.status(200).send("Server is running.");
});

/* ===============================
   Start Server (Render-safe)
================================= */
const listenPort = PORT || 3000;

app.listen(listenPort, "0.0.0.0", () => {
  console.log(`Server running on port ${listenPort}`);
});