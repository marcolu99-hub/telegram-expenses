import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  // Controllo secret token
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body;
    const text = body?.message?.text?.trim() || "";

    // Estrai importo
    const match = text.match(/(\d+(?:[.,]\d{1,2})?)/);
    if (!match) return res.status(200).json({ message: "No amount found" });

    const amount = parseFloat(match[1].replace(",", "."));

    // Estrai categoria #tag
    let note = text.replace(match[0], "").trim();
    let category = null;
    const tag = note.match(/#(\w[\w-]*)/);
    if (tag) {
      category = tag[1].toLowerCase();
      note = note.replace(tag[0], "").trim();
    }

    const chat_id = body.message.chat.id;
    const username = body.message.from?.username || null;

    // Inserimento su Supabase
    const { error } = await supabase.from("expenses").insert([{
      chat_id,
      username,
      amount,
      currency: "EUR",
      category,
      note
    }]);

    if (error) {
      console.error("Supabase insert error", error);
      return res.status(500).json({ error: error.message });
    }

    // Invia messaggio di conferma al bot
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const message = `✅ Spesa di €${amount} registrata!`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat_id,
        text: message
      })
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error" });
  }
}
