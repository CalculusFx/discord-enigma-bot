// Use global fetch available in Node 18+
export async function check(content, config) {
    const apiKey = config.openai?.apiKey;
    if (!apiKey) {
        console.warn('[OpenAI] No API key configured for OpenAI provider');
        return { isViolation: false };
    }

    try {
        const url = 'https://api.openai.com/v1/moderations';
    const controller = new AbortController();
    const timeoutMs = Math.max(1, 8000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ input: content }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const text = await res.text();
            console.error('OpenAI moderation HTTP error:', res.status, text);
            return { isViolation: false };
        }

        const data = await res.json();
        const results = data.results && data.results[0];
        if (results && results.flagged) {
            const categoryMap = {
                sexual: 'เนื้อหาเพศเลว',
                sexual_minors: 'เนื้อหาเกี่ยวกับเด็ก',
                sexual_explicit: 'เนื้อหาเพศชัดเจน',
                sexual_images: 'รูปภาพลามก',
                hate: 'สัญญาณเกลียดชัง',
                hate_threatening: 'คำขู่/ความรุนแรง',
                self_harm: 'พฤติกรรมทำร้ายตัวเอง',
                harassment: 'การคุกคาม/รังแก',
                sexual_and_pornography: 'เนื้อหาอนาจาร',
                violence: 'ความรุนแรง',
            };

            const matched = Object.keys(results.categories || {}).filter(k => results.categories[k]);
            const friendly = matched.map(k => categoryMap[k] || k).join(', ') || 'เนื้อหาไม่เหมาะสม';
            return { isViolation: true, type: 'ai_moderation', reason: friendly, raw: results };
        }
    } catch (err) {
        if (err.name === 'AbortError') console.error('[OpenAI] request timed out');
        else console.error('OpenAI moderation error:', err);
    }

    return { isViolation: false };
}
