import { NextRequest, NextResponse } from "next/server";

// System prompt is stable across all requests — ideal for prompt caching.
const SYSTEM_PROMPT = `You are an expert chess coach for young players (ages 10–16). Your coaching style:

- Always be encouraging, even when correcting mistakes — chess is hard and mistakes are how we learn
- Use simple, clear language; briefly explain any chess terms you use
- Focus on the PATTERN so players recognize it next time, not just this specific position
- Explain WHY moves work or fail using chess principles (king safety, piece activity, material, etc.)
- When a player failed, specifically address why their attempted move doesn't work, then explain the correct idea
- Give concrete, actionable advice the student can apply in their next game
- For endgame positions, emphasize the underlying principle (opposition, key squares, cutoff, etc.)
- Keep responses to 4–6 clear, focused sentences — quality over quantity`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { message: "Great effort! Every puzzle you try makes you a stronger player. Keep going!" },
      { status: 200 }
    );
  }

  try {
    const body = await request.json();
    const { context, wrongMove, mode } = body;

    // Build the user message — append wrong-move analysis when available
    let userMessage = context as string;
    if (wrongMove && typeof wrongMove === "string") {
      userMessage += `\n\nIMPORTANT: The player tried the move ${wrongMove}. Please explain specifically why this move doesn't work in this position, then clearly explain why the correct solution is stronger.`;
    }
    if (mode === "endgames") {
      userMessage += "\n\nNote: This is an endgame position. Emphasize the endgame principle being demonstrated (e.g., opposition, key squares, rook cutoff, pawn breakthrough) so the student understands the concept, not just the move.";
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.content?.[0]?.text || "Keep practicing — you're improving every time!";

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Coach API error:", error);
    return NextResponse.json({
      message: "Great effort! Every puzzle makes you a stronger player. Study the solution and you'll spot this pattern next time!",
    });
  }
}
