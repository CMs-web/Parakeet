const INTERROGATIVE_STARTERS = [
  'what',
  'why',
  'how',
  'when',
  'where',
  'who',
  'whom',
  'whose',
  'which',
  'can you',
  'could you',
  'would you',
  'will you',
  'do you',
  'did you',
  'are you',
  'is it',
  'was it',
  'were you',
  'have you',
  'has it',
  'should we',
  'may i',
  'might',
  'tell me',
  'explain',
  'describe',
  'walk me through',
  'give me an example',
  'talk me through',
  'show me'
]

const REQUEST_PATTERNS = [
  /\bcan you\b/,
  /\bcould you\b/,
  /\bwould you\b/,
  /\bdo you have\b/,
  /\bwhat about\b/,
  /\bhow about\b/,
  /\bthoughts on\b/,
  /\bexperience with\b/
]

export function looksLikeQuestion(text: string): boolean {
  const value = text.trim().toLowerCase()
  if (!value) return false
  if (value.includes('?')) return true
  const words = value.split(/\s+/)
  for (const starter of INTERROGATIVE_STARTERS) {
    if (value.startsWith(starter) && words.length >= 3) return true
  }
  for (const pattern of REQUEST_PATTERNS) {
    if (pattern.test(value) && words.length >= 4) return true
  }
  return false
}
