const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
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

/* ===============================
   Validate Required ENV Vars
================================= */

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
    // =============================
    // SMS ONLY
    // =============================
    if (numMedia === 0) {
      console.log(`SMS from ${from}: ${body}`);

      const slackResponse = await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel: SLACK_CHANNEL_ID,
          text: `📩 New SMS from ${from}\n${body || "(no message body)"}`
        },
        {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      console.log("Slack text response:", slackResponse.data);
      return;
    }

    // =============================
    // MMS WITH MEDIA
    // =============================
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const contentType =
        req.body[`MediaContentType${i}`] || "image/jpeg";

      const extension = contentType.split("/")[1] || "jpg";

      console.log(`Downloading media ${i + 1}:`, mediaUrl);

      // Download from Twilio (requires Basic Auth)
      const twilioResponse = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
            ).toString("base64")
        }
      });

      const fileBuffer = Buffer.from(twilioResponse.data);

      const form = new FormData();
      form.append("channels", SLACK_CHANNEL_ID);
      form.append("initial_comment", `📷 New MMS from ${from}`);
      form.append("file", fileBuffer, {
        filename: `mms-${Date.now()}.${extension}`,
        contentType
      });

      const slackResponse = await axios.post(
        "https://slack.com/api/files.upload",
        form,
        {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            ...form.getHeaders()
          }
        }
      );

      console.log("Slack upload response:", slackResponse.data);
    }

  } catch (err) {
    console.error(
      "Processing error:",
      err.response?.data || err.message
    );
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