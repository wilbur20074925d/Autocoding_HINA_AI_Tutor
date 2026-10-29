/** Matches web app `tutorMode: 'learning'` brevity instruction (aiTutorNewService). */
export const LEARNING_MODE_USER_SUFFIX = `

CRITICAL - Keep it brief but complete (learning mode):
- START DIRECTLY with the explanation — no "Today we will explore…" openings
- Explain the core idea in just 2–3 complete sentences
- Give 1 quick suggestion for next step
- End with 1 complete reflection question
- Maximum 100–150 words total (do not count code in code blocks)
- Use clear paragraph breaks; markdown code blocks and LaTeX when needed`;

/** Shorter turn when the user only sends a screenshot. */
export const LEARNING_MODE_SCREENSHOT_PREFIX =
  'Read the question in this image and answer in learning mode (brief, 100–150 words excluding code).';
