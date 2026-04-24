import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

export interface AskResult {
  answer: string
}

/**
 * Read mode's Highlight & Ask: reader selected a passage, wants a short
 * explanation in the context of the chapter and their goal.
 *
 * Rules:
 * - Short. 2-4 sentences max. Don't lecture.
 * - Explain what the passage is saying, in plain words — not restate it.
 * - Tie back to the reader's goal when relevant, but don't force it.
 * - Don't summarize the whole chapter. Zoom into the selection only.
 */
export async function askAboutSelection({
  goal,
  chapterTitle,
  chapterContent,
  selection,
  question,
}: {
  goal: string
  chapterTitle: string
  chapterContent: string
  selection: string
  question?: string
}): Promise<AskResult> {
  const prompt = `A reader is reading a chapter. They selected a passage and want you to explain it.

READER'S GOAL (for context only — don't force a tie-in):
"${goal}"

CHAPTER: ${chapterTitle}
CHAPTER CONTEXT (surrounding text, for grounding):
${chapterContent.slice(0, 8000)}

SELECTED PASSAGE:
"""
${selection.slice(0, 2000)}
"""

${question ? `READER'S QUESTION: ${question}\n\n` : ''}Explain what the selected passage is saying. Rules:
- 2-4 sentences max. Plain words.
- Don't restate the passage. Clarify or unpack it.
- Don't summarize the whole chapter — stay on the selection.
- Tie to the goal only if there's a real connection.
- No preamble like "This passage discusses..." — just dive in.

Return a JSON object: { "answer": "..." }`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as { answer?: unknown }
  const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
  return { answer }
}
