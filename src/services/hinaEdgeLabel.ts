import type { SupabaseClient } from '@supabase/supabase-js';
import type { HinaSourceMessage } from '../utils/hinaAnalysis';
import { heuristicLabelRows, type HinaLabelRow } from '../utils/hinaLabelling';

export async function labelHinaMessagesViaEdge(
  supabase: SupabaseClient,
  messages: HinaSourceMessage[]
): Promise<{ rows: HinaLabelRow[]; source: 'gemini' | 'heuristic' }> {
  const fallback = heuristicLabelRows(messages);
  if (messages.length === 0) return { rows: fallback, source: 'heuristic' };

  const { data, error } = await supabase.functions.invoke('hina-label-messages', {
    body: {
      messages: messages.slice(0, 40).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    },
  });

  if (error) {
    console.warn('[HINA edge label]', error.message);
    return { rows: fallback, source: 'heuristic' };
  }

  const payload = data as { rows?: HinaLabelRow[]; source?: string } | null;
  if (!payload?.rows?.length) {
    return { rows: fallback, source: 'heuristic' };
  }

  return {
    rows: payload.rows,
    source: payload.source === 'gemini' ? 'gemini' : 'heuristic',
  };
}
