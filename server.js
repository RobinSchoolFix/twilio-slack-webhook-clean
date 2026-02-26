const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Environment variables
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;

console.log("Slack token loaded:", SLACK_BOT_TOKEN?.slice(0, 15));
console.log("Slack channel:", SLACK_CHANNEL_ID);

// Twilio webhook
app.post("/twilio", async (req, res) => {
  console.log("Incoming Twilio POST:", req.body);

  const from = req.body.From;
  const body = req.body.Body;
  const numMedia = parseInt(req.body.NumMedia || "0");

  // Respond to Twilio immediately
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");

  try {
    // If SMS only (no media)
    if (numMedia === 0) {
      console.log(`SMS from ${from}: ${body}`);

      await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel: SLACK_CHANNEL_ID,
          text: `New SMS from ${from}:\n${body || "(no message body)"}`
        },
        {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      return;
    }

    // If MMS exists
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const contentType =
        req.body[`MediaContentType${i}`] || "image/jpeg";
      const extension = contentType.split("/")[1] || "jpg";

      // Download media from Twilio
      const twilioResponse = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64")
        }
      });

      const fileBuffer = Buffer.from(twilioResponse.data);

      const form = new FormData();
      form.append("channels", SLACK_CHANNEL_ID);
      form.append("initial_comment", `New MMS from ${from}`);
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

// Start server (Render uses PORT env)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});