require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize xAI (Grok) client
const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

app.use(express.json());
app.use(express.static(__dirname));

// Tool Definitions for the AI Agent
const tools = [{
  type: "function",
  function: {
    name: "manage_kiosk",
    description: "Execute actions on the kiosk UI such as navigation, cart management, or accessibility mode changes.",
    parameters: {
      type: "object",
      properties: {
        action: { 
          type: "string", 
          enum: ["navigate", "add_item", "remove_item", "set_mode", "checkout", "clear_cart"],
          description: "The type of kiosk action to perform."
        },
        target: { 
          type: "string", 
          description: "The target screen ID (e.g., 'screen-menu', 'screen-cart') or the item ID."
        },
        payload: {
          type: "object",
          description: "Additional data like item name, price, or accessibilty mode name ('blind', 'motor', 'cognitive', 'standard')."
        }
      },
      required: ["action"]
    }
  }
}];

// Conversational AI Endpoint (Grok)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    const response = await client.chat.completions.create({
      model: "grok-beta",
      messages: [
        { role: "system", content: "You are 'Kiosk Vision', an intelligent, friendly AI assistant for an accessible kiosk. Keep responses brief (1-2 sentences). You can help users with navigation, adding items, and enabling accessibility modes. If a user asks a complex question, identify their intent and use the 'manage_kiosk' tool if a UI action is required." },
        ...messages
      ],
      tools: tools,
    });

    res.json(response.choices[0].message);
  } catch (error) {
    console.error('❌ Detailed xAI Error:', error.message || error);
    if (error.status === 401) {
      return res.status(401).json({ error: "Invalid API Key. Please get a valid key from console.x.ai" });
    }
    res.status(500).json({ error: "High AI demand or invalid key. Please check your XAI_API_KEY in .env." });
  }
});

// SPA behavior: Send index.html for any other requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Kiosk Vision Backend running on http://localhost:${PORT}`);
  console.log(`🤖 AI Concierge (Grok) Active and Listening`);
});
