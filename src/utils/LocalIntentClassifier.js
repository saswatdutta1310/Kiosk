const QUESTION_STARTERS = /^(who|what|where|when|why|how|is|are|do|does|can|would|should|will|did|could|may|might)\b/i;
const COMMAND_VERBS = /^(add|go|goto|set|change|select|checkout|pay|start|stop|reset|view|show|hide|clear|remove|delete|cancel|confirm)\b/i;

/**
 * Determines if a voice transcript should trigger a call to the LLM API.
 * 
 * @param {string} text The transcribed user input
 * @returns {boolean} True if the LLM should be consulted, false for local processing
 */
export function shouldTriggerLLM(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();

  // 1. If it's a direct command (imperative verb), process locally (Zero Cost)
  if (COMMAND_VERBS.test(t)) {
    console.log("AI Efficiency: Detected local command [Zero-Cost Match]");
    return false;
  }

  // 2. If it starts with a question starter, it's likely a query (Trigger API)
  if (QUESTION_STARTERS.test(t) || t.includes("?")) {
    console.log("AI Concierge: Detected complex query [Triggering API]");
    return true;
  }

  // 3. Fallback: If intent is ambiguous, verify with LLM
  return true;
}
