// api/telegram.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // 1. Verifica che la richiesta venga da Telegram
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. Recupera il body (messaggio)
  const body = req.body;

  if (!body.message || !body.message.text) {
    return res.status(200).json({ ok: true });
  }

  const text = body.message.text.trim();

  // 3. Proviamo a separare importo e nota
  const parts = text.split(" ");
  const amount = parseFloat(parts[0]);
  const note = parts.slice(1).join(" ") || null;

  if (isNaN(amount)) {
    return res.status(200).json({ message: "Formato non valido" });
  }

  // 4. Connetti a Supabase
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { error } = await supabase.from("expenses").insert([
    {
      amount: amount,
      note: note,
      created_at: new Date().toISOString()
    }
  ]);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Errore inserimento" });
  }

  // 5. Risposta a Telegram
  return res.status(200).json({ ok: true });
}
