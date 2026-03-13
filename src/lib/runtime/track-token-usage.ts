/**
 * Tracks token usage from an adapter response and updates the session.
 */
export function trackTokenUsage({
  session,
  phase,
  usage,
}: {
  session: any;
  phase: string;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    input_bytes?: number;
    output_bytes?: number;
  };
}) {
  if (!session.token_usage) {
    session.token_usage = {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_input_bytes: 0,
      total_output_bytes: 0,
      by_phase: {},
    };
  }

  // Update totals
  session.token_usage.total_input_tokens += usage.input_tokens ?? 0;
  session.token_usage.total_output_tokens += usage.output_tokens ?? 0;
  session.token_usage.total_input_bytes += usage.input_bytes ?? 0;
  session.token_usage.total_output_bytes += usage.output_bytes ?? 0;

  // Update by-phase tracking
  if (!session.token_usage.by_phase[phase]) {
    session.token_usage.by_phase[phase] = {
      input_tokens: 0,
      output_tokens: 0,
      input_bytes: 0,
      output_bytes: 0,
      call_count: 0,
    };
  }

  const phaseStats = session.token_usage.by_phase[phase];
  phaseStats.input_tokens += usage.input_tokens ?? 0;
  phaseStats.output_tokens += usage.output_tokens ?? 0;
  phaseStats.input_bytes += usage.input_bytes ?? 0;
  phaseStats.output_bytes += usage.output_bytes ?? 0;
  phaseStats.call_count += 1;
}
