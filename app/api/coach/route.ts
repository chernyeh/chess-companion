import { NextRequest, NextResponse } from "next/server";

// Stable system prompt — cached across calls to reduce latency and cost.
const SYSTEM_PROMPT = `You are an expert chess coach for young players (ages 10–16).

RESPONSE FORMAT — follow this exactly:
• Output exactly 4–6 lines, each line starting with the bullet character •
• Each bullet is one sentence only, on its own line, with NO blank lines between bullets
• Do NOT use markdown bold (**text**), italic (*text*), headers (#), dashes (-), asterisks (*), or any formatting besides • at line start
• Do NOT use numbered lists

CONTENT OF THE BULLETS:
• First bullet: one sentence naming the key tactical or endgame idea
• Second bullet: WHY the correct move works — what does it threaten or accomplish?
• Third bullet: what the OPPONENT CANNOT DO — why their defences fail, which escape routes or counter-moves are cut off
• Fourth bullet: if the player made a wrong move, explain specifically why it fails
• Fifth or sixth bullet: a pattern tip they can remember for future games

TONE:
- Be encouraging — chess is hard and mistakes teach us
- Use simple language; briefly explain any technical terms
- Be concrete and specific to this position, not generic
- Never say "great question" or use filler phrases
- For endgames, always name the principle (opposition, cutoff, breakthrough, Lucena, Philidor, etc.)`;

// Strip any markdown the model slips in despite instructions
function sanitize(text: string): string {
  return text
    .replace(/\*\*/g, "")       // remove bold markers
    .replace(/\*/g, "")          // remove italic markers
    .replace(/^#+\s*/gm, "")    // remove headers
    .replace(/^[-–]\s+/gm, "• ") // convert dash lists to bullet
    .trim();
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { message: "• The key idea here is forcing the opponent into a position where they have no good options.\n• Study the solution carefully and you'll recognise this pattern next time.\n• Keep practicing — every puzzle sharpens your tactical eye!" },
      { status: 200 }
    );
  }

  try {
    const body = await request.json();
    const { context, wrongMove, mode } = body;

    let userMessage = context as string;

    if (wrongMove && typeof wrongMove === "string") {
      userMessage += `\n\nThe player tried the move: ${wrongMove}. In your bullet about incorrect moves, explain specifically why this move doesn't work — what can the opponent do that punishes it or why it misses the point?`;
    }

    if (mode === "endgames") {
      userMessage += "\n\nThis is an endgame. Name and explain the endgame principle being demonstrated (e.g., opposition, key squares, rook cutoff, pawn breakthrough, Lucena, Philidor). The student needs to understand the concept so they can apply it in any endgame, not just this position.";
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
        max_tokens: 550,
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
    const raw = data.content?.[0]?.text || "• Keep practicing — you're improving every time!\n• Study the solution and you'll spot this pattern next time.";
    const message = sanitize(raw);

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Coach API error:", error);
    return NextResponse.json({
      message: "• Great effort — every puzzle builds pattern recognition.\n• Study the solution carefully and think about why the opponent had no good reply.\n• You'll spot it faster next time!",
    });
  }
}
