console.log("Loaded Slack webhook:", MMS_WEBHOOK);

const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();

// REQUIRED for Twilio to parse POST body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Slack webhook from .env
const MMS_WEBHOOK = process.env.MMS_WEBHOOK;

// Twilio webhook route
app.post("/twilio", async (req, res) => {
  console.log("Incoming Twilio POST:", req.body);

  const from = req.body.From;
  const body = req.body.Body;
  const mediaUrl = req.body.MediaUrl0; // MMS only

  // Always respond to Twilio immediately
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");

  // If MMS → send to Slack
  if (mediaUrl) {
    try {
      await axios.post(MMS_WEBHOOK, {
        text: `📸 New MMS from ${from}\n${body || ""}\n${mediaUrl}`
      });
    } catch (err) {
      console.error("Slack MMS error:", err.message);
    }
    return;
  }

  // If SMS → send to LiveChat (placeholder)
  console.log(`SMS from ${from}: ${body}`);
});

// Render requires this port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});