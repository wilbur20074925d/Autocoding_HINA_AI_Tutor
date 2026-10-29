import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import codebook from './codebook.json' assert { type: 'json' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type IncomingMessage = { id: string; role: 'user' | 'assistant'; content: string };

type CodebookEntry = {
  i: number;
  id: string;
  dimensionId: string;
  dimension: string;
  code: string;
  definition: string;
};

type LabelRow = {
  messageId: string;
  turn: number;
  speaker: 'Student' | 'Tutor';
  actor: 'me' | 'ai';
  dimension: string;
  dimensionLabel: string;
  codeId: string;
  codeLabel: string;
  definition: string;
  evidence: string;
  rationale: string;
  source: 'gemini';
};

const entries = codebook as CodebookEntry[];
const codeById = new Map(entries.map((entry) => [entry.id, entry]));

const excerptOf = (text: string, limit = 180) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
};

function codebookBlock(): string {
  return entries
    .map(
      (entry) =>
        `${entry.i}. id=${entry.id} | dimension=${entry.dimension} | code=${entry.code} | definition=${entry.definition}`
    )
    .join('\n');
}

function buildPrompt(messages: IncomingMessage[]): string {
  const turns = messages.slice(0, 40).map((message, index) => ({
    turn: index + 1,
    messageId: message.id,
    speaker: message.role === 'user' ? 'Student' : 'Tutor',
    text: excerptOf(message.content, 700),
  }));

  return `You are coding a 1-to-1 student–AI tutor chat with the HINA codebook below.
Assign EXACTLY one code to EACH turn. Do not invent codes. Dimension must match the chosen code.

CODEBOOK:
${codebookBlock()}

CODING RULES:
- Direct Solution Request: asking for the finished answer or complete work.
- Information / Idea Question: asking for an idea, meaning, or explanation — not the finished answer.
- Extend / Refine Request: asking to change existing content. Extend / Refine Solution: actually modifying a solution.
- Direct Solution Provide: handing over a complete answer. Idea / Explanation Sharing: explaining without dumping the full answer.
- Build on Question: following up on the previous turn.
- Critical Assessment: challenging or judging an idea.
- Integration / Synthesis: connecting several ideas.
- Planning / Monitoring / Evaluation: process moves, not content answers.
- Socio-emotional codes only for greeting, thanks, empathy, or brief agreement.
- Coordinative codes for task scope, who does what, or tools/files.
- Prefer the most specific matching code. One code per turn.

TURNS:
${turns.map((turn) => `[${turn.turn}] id=${turn.messageId} ${turn.speaker}: ${turn.text}`).join('\n\n')}

Return ONLY JSON with this schema:
{
  "rows": [
    {
      "turn": 1,
      "messageId": "same id as the turn",
      "speaker": "Student or Tutor",
      "dimension": "Cognitive | Metacognitive | Socio-emotional | Coordinative",
      "code": "exact code name from the codebook",
      "codeId": "exact id from the codebook",
      "evidence": "short quote from the turn",
      "rationale": "one sentence: why this code rather than a nearby one"
    }
  ]
}`;
}

function extractJson(text: string): unknown | null {
  if (!text) return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const block =
    fenced ||
    (trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0]) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed : trimmed.match(/\[[\s\S]*\]/)?.[0]);
  if (!block) return null;
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
}

function parseRows(raw: unknown, messages: IncomingMessage[]): LabelRow[] | null {
  if (!raw) return null;
  const payload = Array.isArray(raw) ? { rows: raw } : (raw as { rows?: unknown; labels?: unknown });
  const list = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload.labels) ? payload.labels : null;
  if (!list) return null;

  const byId = new Map(messages.map((message) => [message.id, message]));
  const rows: LabelRow[] = [];

  list.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const entry = item as Record<string, unknown>;
    const turn = Number(entry.turn) || index + 1;
    const message =
      (typeof entry.messageId === 'string' && byId.get(entry.messageId)) ||
      messages[turn - 1] ||
      messages[index];
    if (!message) return;

    const codeId = String(entry.codeId || entry.code || entry.label || '').trim();
    const code =
      codeById.get(codeId) ||
      entries.find((c) => c.code.toLowerCase() === codeId.toLowerCase()) ||
      entries[0];
    if (!code) return;

    const actor = message.role === 'user' ? 'me' : 'ai';
    rows.push({
      messageId: message.id,
      turn,
      speaker: actor === 'me' ? 'Student' : 'Tutor',
      actor,
      dimension: code.dimensionId,
      dimensionLabel: code.dimension,
      codeId: code.id,
      codeLabel: code.code,
      definition: code.definition,
      evidence: excerptOf(String(entry.evidence || entry.excerpt || message.content || '')),
      rationale: excerptOf(String(entry.rationale || entry.why || entry.reason || ''), 220),
      source: 'gemini',
    });
  });

  return rows.length ? rows : null;
}

const DEFAULT_KIMI_API_BASE = 'https://api.moonshot.ai/v1';
const DEFAULT_KIMI_LABEL_MODEL = 'moonshot-v1-32k';
const LABEL_SYSTEM_PROMPT =
  'You are a careful qualitative coder. Follow the closed HINA codebook exactly. Return valid JSON only. No markdown.';

async function callKimi(prompt: string, apiKey: string): Promise<string> {
  const apiBase = (Deno.env.get('KIMI_API_BASE') ?? DEFAULT_KIMI_API_BASE).replace(/\/$/, '');
  const model =
    Deno.env.get('KIMI_LABEL_MODEL') ??
    Deno.env.get('KIMI_MODEL') ??
    Deno.env.get('VITE_KIMI_LABEL_MODEL') ??
    Deno.env.get('VITE_KIMI_MODEL') ??
    DEFAULT_KIMI_LABEL_MODEL;
  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: LABEL_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Kimi API error ${response.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as { messages?: IncomingMessage[] };
    const messages = (body.messages || []).filter(
      (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    );
    if (messages.length === 0) {
      return new Response(JSON.stringify({ rows: [], source: 'heuristic' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const kimiKey =
      Deno.env.get('KIMI_API_KEY') ??
      Deno.env.get('MOONSHOT_API_KEY') ??
      Deno.env.get('VITE_KIMI_API_KEY') ??
      '';
    if (!kimiKey) {
      return new Response(JSON.stringify({ error: 'KIMI_API_KEY not configured on server' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt(messages);
    const modelText = await callKimi(prompt, kimiKey);
    const parsed = parseRows(extractJson(modelText), messages.slice(0, 40));

    if (!parsed?.length) {
      return new Response(JSON.stringify({ error: 'Could not parse model response', raw: modelText.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ rows: parsed, source: 'gemini' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
