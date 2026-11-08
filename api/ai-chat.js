module.exports = async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Metode tidak diizinkan.' });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!geminiApiKey || !firebaseApiKey) {
    return response.status(503).json({ error: 'Konfigurasi AI Agent belum lengkap.' });
  }

  const authorization = request.headers.authorization || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) {
    return response.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  }

  let user;
  try {
    const verificationResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    const verificationData = await verificationResponse.json();
    if (!verificationResponse.ok) {
      return response.status(401).json({ error: 'Sesi login tidak valid.' });
    }
    user = verificationData.users?.[0];
  } catch {
    return response.status(503).json({ error: 'Tidak dapat memverifikasi sesi login.' });
  }

  if (!user?.localId) {
    return response.status(401).json({ error: 'Sesi login tidak valid.' });
  }

  const { message, history = [] } = request.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return response.status(400).json({ error: 'Pesan tidak boleh kosong.' });
  }

  const safeHistory = Array.isArray(history)
    ? history
        .filter((item) => item && typeof item.text === 'string')
        .slice(-20)
        .map((item) => ({
          role: item.role === 'model' ? 'model' : 'user',
          parts: [{ text: item.text.slice(0, 4000) }],
        }))
    : [];

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

  try {
    const responseAi = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          ...safeHistory,
          { role: 'user', parts: [{ text: message.trim().slice(0, 4000) }] },
        ],
        systemInstruction: {
          parts: [{ text: 'Anda adalah Niaga AI, asisten resmi SobatNiaga. Jawab dalam bahasa Indonesia yang ramah, ringkas, dan praktis. Bantuan mencakup belanja, pembayaran rekber, pengiriman, top up, status transaksi, dan menjadi penjual. Jangan meminta atau menampilkan API key, kata sandi, PIN, OTP, atau data pembayaran rahasia. Jika masalah memerlukan akses transaksi atau tindakan manual, jelaskan bahwa tim admin dapat membantu melalui obrolan ini.' }],
        },
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      }),
    });

    const data = await responseAi.json();
    if (!responseAi.ok) {
      console.error('Gemini error:', data?.error?.message || responseAi.status);
      return response.status(responseAi.status === 429 ? 429 : 502).json({
        error: responseAi.status === 429
          ? 'Kuota AI Agent sedang penuh. Coba lagi beberapa saat lagi.'
          : 'AI Agent belum dapat menjawab saat ini. Coba lagi sebentar.',
      });
    }

    const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    if (!reply) {
      return response.status(502).json({ error: 'AI Agent tidak menghasilkan jawaban.' });
    }

    return response.status(200).json({ reply });
  } catch (error) {
    console.error('AI Agent fetch error:', error);
    return response.status(503).json({ error: 'Gagal terhubung ke AI Agent.' });
  }
};
