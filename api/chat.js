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
    const { system, user, messages: clientMessages, max_tokens, temperature } = req.body || {};
    
    // 메시지 배열 구성
    const messages = [];
    if (system && typeof system === 'string') {
      messages.push({ role: 'system', content: system });
    }
    
    // 클라이언트가 messages 배열을 보낸 경우 (새 방식 - 권장)
    if (Array.isArray(clientMessages) && clientMessages.length > 0) {
      for (const m of clientMessages) {
        if (m && typeof m.role === 'string' && typeof m.content === 'string') {
          // role은 'user' 또는 'assistant'만 허용
          const role = m.role === 'assistant' ? 'assistant' : 'user';
          messages.push({ role, content: m.content });
        }
      }
    } else if (user && typeof user === 'string') {
      // 구버전 호환 (user 단일 문자열)
      messages.push({ role: 'user', content: user });
    } else {
      return res.status(400).json({ error: 'Missing messages or user field' });
    }

    // [9단계] 클라이언트가 temperature 보냈으면 그 값 사용. 아니면 기본 0.85.
    //         판정 같은 결정론적 호출은 낮은 값(0.2) 을 받아서 가변성을 줄인다.
    const finalTemperature = (typeof temperature === 'number' && temperature >= 0 && temperature <= 2)
      ? temperature
      : 0.85;

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
        temperature: finalTemperature,
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
