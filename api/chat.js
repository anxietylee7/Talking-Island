// Vercel Serverless Function: /api/chat
// 브라우저 → 이 함수 → OpenAI API → 이 함수 → 브라우저 (API 키는 서버에만 존재)
//
// 필요한 환경변수: OPENAI_API_KEY (Vercel 대시보드에서 설정)

export default async function handler(req, res) {
  // CORS 헤더 (같은 도메인에서만 써도 안전)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // API 키 체크
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[api/chat] OPENAI_API_KEY not set');
    return res.status(500).json({ error: 'Server misconfigured: API key missing' });
  }

  try {
    const { system, user, max_tokens } = req.body || {};
    
    if (!user || typeof user !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "user" field' });
    }

    // OpenAI Chat Completions 형식으로 변환
    const messages = [];
    if (system && typeof system === 'string') {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: user });

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages,
        max_tokens: typeof max_tokens === 'number' ? max_tokens : 1000,
        temperature: 0.85,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('[api/chat] OpenAI error:', openaiRes.status, errText);
      return res.status(openaiRes.status).json({ 
        error: 'OpenAI API error', 
        detail: errText.substring(0, 500)
      });
    }

    const data = await openaiRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    // 프론트엔드가 기대하는 형식으로 반환: { text: "..." }
    return res.status(200).json({ text });
  } catch (err) {
    console.error('[api/chat] unexpected error:', err);
    return res.status(500).json({ error: 'Internal error', detail: String(err) });
  }
}
