const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Slack webhook + bot token + channel
const MMS_WEBHOOK = process.env.MMS_WEBHOOK;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

// Twilio credentials
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;

console.log("Loaded Slack webhook:", MMS_WEBHOOK);

app.post("/twilio", async (req, res) => {
  console.log("Incoming Twilio POST:", req.body);

  const from = req.body.From;
  const body = req.body.Body;
  const numMedia = parseInt(req.body.NumMedia || "0");

  // Respond to Twilio immediately
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");

  // Always send text portion to Slack
  try {
    await axios.post(MMS_WEBHOOK, {
      text: `📩 New message from ${from}\n${body || ""}`
    });
  } catch (err) {
    console.error("Slack text error:", err.message);
  }

  // If MMS exists, download + upload each file
  if (numMedia > 0) {
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const contentType = req.body[`MediaContentType${i}`];

      try {
        // Download from Twilio (requires Basic Auth)
        const twilioResponse = await axios.get(mediaUrl, {
          responseType: "arraybuffer",
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64")
          }
        });

        const fileBuffer = Buffer.from(twilioResponse.data);

        // Upload to Slack as a real file
        const form = new FormData();
        form.append("channels", SLACK_CHANNEL_ID);
        form.append("file", fileBuffer, {
          filename: `mms-${Date.now()}`,
          contentType
        });

        await axios.post("https://slack.com/api/files.upload", form, {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            ...form.getHeaders()
          }
        });

        console.log("Uploaded MMS file to Slack");
      } catch (err) {
        console.error("Slack MMS upload error:", err.message);
      }
    }
  }

  // SMS-only case
  if (numMedia === 0) {
    console.log(`SMS from ${from}: ${body}`);
  }
});

// Render port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});