import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const nlmCommand = "nlm";

// ─── POST: NotebookLM에 질문 전송 ─────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { notebookId, question, conversationId } = await req.json();

    if (!notebookId?.trim() || !question?.trim()) {
      return NextResponse.json(
        { error: "notebookId와 question이 필요합니다." },
        { status: 400 }
      );
    }

    const args = ["query", "notebook", notebookId, question];

    if (conversationId) {
      args.push("--conversation-id", conversationId);
    }

    // 타임아웃을 넉넉히 (NotebookLM 응답이 느릴 수 있음)
    args.push("--timeout", "120");

    const result = spawnSync(nlmCommand, args, {
      encoding: "utf8",
      shell: false,
      timeout: 130000,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        NO_COLOR: "1",
      },
    });

    if (result.status === 0) {
      const rawOutput = (result.stdout || "").trim();

      // nlm query는 JSON 또는 텍스트로 응답
      let answer = rawOutput;
      let newConversationId: string | undefined;

      try {
        const parsed = JSON.parse(rawOutput);
        answer = parsed.answer || parsed.response || parsed.text || rawOutput;
        newConversationId = parsed.conversation_id || parsed.conversationId;
      } catch {
        // JSON이 아니면 그대로 텍스트 사용
        // conversation_id를 텍스트에서 추출 시도
        const cidMatch = rawOutput.match(/conversation[_-]?id[:\s]+([a-zA-Z0-9_-]+)/i);
        if (cidMatch) newConversationId = cidMatch[1];
      }

      return NextResponse.json({
        success: true,
        answer,
        conversationId: newConversationId,
      });
    } else {
      const error = (result.stderr || result.stdout || "알 수 없는 오류").trim();
      return NextResponse.json(
        { error: `쿼리 실패: ${error.substring(0, 500)}` },
        { status: 500 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
