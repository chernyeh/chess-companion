import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { message: "Great effort! Keep practicing and you'll get even better!" },
      { status: 200 }
    );
  }

  try {
    const body = await request.json();
    const { context } = body;

    const prompt = `You are a friendly chess coach for a young player (around 12 years old). Be encouraging, specific, and use simple language. Keep your response to 3-4 sentences max.\n\n${context}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.content?.[0]?.text || "Keep practicing!";

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Coach API error:", error);
    return NextResponse.json({
      message: "Great effort! Every puzzle makes you a stronger player. Keep going!",
    });
  }
}
