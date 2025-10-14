import { CONFIG } from './config.js';

  const {
    AMPLIFY_BASE_URL,
    AMPLIFY_API_KEY,
    AMPLIFY_MODEL,
    AMPLIFY_AUTH_SCHEME,
    AMPLIFY_API_KEY_HEADER,
    USE_AMPLIFY,
  } = CONFIG;

function buildHeaders() {
  const { AMPLIFY_API_KEY, AMPLIFY_AUTH_SCHEME } = CONFIG;
  if ((AMPLIFY_AUTH_SCHEME || 'bearer') !== 'bearer') {
    throw new Error(`Unsupported AMPLIFY_AUTH_SCHEME: ${AMPLIFY_AUTH_SCHEME}`);
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AMPLIFY_API_KEY}`,
  };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = typeof json === 'string' ? json : JSON.stringify(json ?? text);
    throw new Error(`Amplify API error: ${res.status}${msg ? ` - ${msg}` : ''}`);
  }
  return json ?? {};
}


export async function chatWithAmplify(message, context = []) {
  const {
      USE_AMPLIFY,
      AMPLIFY_BASE_URL,
      AMPLIFY_MODEL,
      AMPLIFY_PATH,
    } = CONFIG;

  if (!USE_AMPLIFY) return 'AI is disabled by configuration.';
  if (!AMPLIFY_BASE_URL) throw new Error('Amplify configuration missing (base URL)');
  
  const path = (AMPLIFY_PATH && AMPLIFY_PATH.trim()) || '/chat';
  const url  = `${AMPLIFY_BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

  const messages = [
    {
      role: 'system',
      content: `You are a Program Planning AI Assistant for Vanderbilt University. Help users navigate program planning policies, timelines, and requirements. Focus on:
      - Space booking procedures
      - Marketing timelines  
      - Invitation requirements
      - Vendor coordination
      - Financial policies
      - On-campus vs off-campus considerations
      - Alcohol policy compliance
      
      Ask clarifying questions about:
      - Program type (mixer, concert, workshop, lecture)
      - Location (on/off campus)
      - Alcohol involvement
      - Expected attendance
      - Budget range
      - Timeline
      
      Provide specific, actionable guidance with policy citations and create checklists when appropriate.`
    },
    ...context,
    { role: 'user', content: message }
  ];

  const payload = {
    data: {
      messages,
      temperature: 0.7,
      max_tokens: 1500,
      dataSources: [],               // add file IDs later if you enable RAG
      options: {
        model: { id: AMPLIFY_MODEL }, // e.g., gpt-4o-mini
        prompt: message,
        ragOnly: false,
        skipRag: true,
      },
    },
  };
  const resp = await postJson(url, payload);

  return (
    resp?.data ??
    resp?.choices?.[0]?.message?.content ??
    resp?.message ??
    'Sorry, I could not process your request.'
  );
}