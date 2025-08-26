import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Funzione per calcolare inizio settimana (lunedi)
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = domenica
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // lunedì
  return new Date(d.setDate(diff)).setHours(0, 0, 0, 0);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  // Controllo secret token
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body;
    const text = body?.message?.text?.trim() || "";
    const chat_id = body.message.chat.id;
    const username = body.message.from?.username || null;

    // Estrai tutti gli importi (positivo o negativo)
    const amounts = text.match(/-?\d+(?:[.,]\d{1,2})?/g);
    if (!amounts) return res.status(200).json({ message: "No amount found" });

    for (let amt of amounts) {
      const amount = parseFloat(amt.replace(",", "."));
      // Estrai categoria #tag
      let note = text.replace(amt, "").trim();
      let category = null;
      const tag = note.match(/#(\w[\w-]*)/);
      if (tag) {
        category = tag[1].toLowerCase();
        note = note.replace(tag[0], "").trim();
      }

      // Inserimento su Supabase
      const { error } = await supabase.from("expenses").insert([{
        chat_id,
        username,
        amount,
        currency: "EUR",
        category,
        note
      }]);

      if (error) console.error("Supabase insert error", error);
    }

    // Calcola totali
    const today = new Date();
    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(getStartOfWeek(today));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const { data: todayData } = await supabase
      .from("expenses")
      .select("amount")
      .gte("created_at", startOfToday.toISOString())
      .eq("chat_id", chat_id);

    const { data: weekData } = await supabase
      .from("expenses")
      .select("amount")
      .gte("created_at", startOfWeek.toISOString())
      .eq("chat_id", chat_id);

    const { data: monthData } = await supabase
      .from("expenses")
      .select("amount")
      .gte("created_at", startOfMonth.toISOString())
      .eq("chat_id", chat_id);

    const sum = arr => arr.reduce((acc, cur) => acc + parseFloat(cur.amount), 0);

    const todaySum = sum(todayData || []);
    const weekSum = sum(weekData || []);
    const monthSum = sum(monthData || []);

    const monthName = today.toLocaleString("it-IT", { month: "long" });

    // Invia messaggio di conferma
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const message = `✅ Spesa di €${amounts.map(a => parseFloat(a.replace(",", "."))).join(", ")} registrata!\n\n` +
                    `💶 Spesa Oggi: €${todaySum.toFixed(2)}\n` +
                    `💶 Spesa Settimana: €${weekSum.toFixed(2)}\n` +
                    `💶 Spesa Mensile (${monthName}): €${monthSum.toFixed(2)}`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text: message })
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error" });
  }
}
