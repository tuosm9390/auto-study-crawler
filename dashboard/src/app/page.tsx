"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── 설정 채널 타입 (channels.json) ─────────────────────────────────────────

interface ConfigChannel {
  id: string;
  name: string;
  url: string;
  notebookId: string;
  notebookTitle: string;
  enabled: boolean;
  tags: string[];
  notes: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isError?: boolean;
}

// ─── 타입 정의 ─────────────────────────────────────────────────────────────

interface VideoRecord {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  url: string;
  addedToNotebook: boolean;
  addedAt: string | null;
  channelName: string;
  notebookId: string | null;
}

interface ChannelRecord {
  channelId: string;
  channelName: string;
  notebookId: string;
  notebookTitle: string;
  lastChecked: string;
  totalVideos: number;
  videos: VideoRecord[];
}

interface DashboardData {
  stats: {
    totalChannels: number;
    totalVideos: number;
    addedToNotebook: number;
    pendingVideos: number;
    lastUpdated: string | null;
  };
  channels: ChannelRecord[];
  recentVideos: VideoRecord[];
}

// ─── 유틸리티 ──────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso: string | null) {
  if (!iso) return "알 수 없음";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}일 전`;
  if (hours > 0) return `${hours}시간 전`;
  if (mins > 0) return `${mins}분 전`;
  return "방금 전";
}

// ─── 통계 카드 ──────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  delay = 0,
}: {
  icon: string;
  label: string;
  value: number | string;
  color: string;
  delay?: number;
}) {
  return (
    <div
      className="card p-6 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="text-3xl mb-3"
        style={{ filter: "drop-shadow(0 0 8px currentColor)" }}
      >
        {icon}
      </div>
      <div className="text-3xl font-bold mb-1" style={{ color }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
    </div>
  );
}

// ─── 영상 카드 ──────────────────────────────────────────────────────────────

function VideoCard({ video }: { video: VideoRecord }) {
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card flex gap-4 p-4 no-underline group"
    >
      {/* 썸네일 */}
      <div
        className="flex-shrink-0 rounded-xl overflow-hidden"
        style={{ width: 140, height: 79, background: "var(--bg-secondary)" }}
      >
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-2xl"
            style={{ background: "var(--bg-card-hover)" }}
          >
            🎬
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div
          className="font-semibold text-sm mb-1 line-clamp-2 group-hover:text-purple-400 transition-colors"
          style={{ color: "var(--text-primary)" }}
        >
          {video.title}
        </div>
        <div
          className="text-xs mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          {video.channelName} · {timeAgo(video.publishedAt)}
        </div>
        <div className="flex items-center gap-2">
          {video.addedToNotebook ? (
            <span className="badge badge-green">✅ NotebookLM 등록</span>
          ) : (
            <span className="badge badge-yellow">⏳ 대기 중</span>
          )}
        </div>
      </div>
    </a>
  );
}

// ─── 채널 카드 (설정 기반) ────────────────────────────────────────────────────

function ChannelCard({
  ch,
  statsChannel,
  onDelete,
  onToggle,
}: {
  ch: ConfigChannel;
  statsChannel?: ChannelRecord;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const addedCount = statsChannel?.videos.filter((v) => v.addedToNotebook).length ?? 0;
  const totalCount = statsChannel?.videos.length ?? 0;
  const percentage = totalCount > 0 ? Math.round((addedCount / totalCount) * 100) : 0;

  const handleDelete = async () => {
    if (!confirm(`"${ch.name}" 채널을 삭제할까요?\n수집된 영상 기록은 유지됩니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/channel", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: ch.id }),
      });
      if (res.ok) onDelete(ch.id);
      else alert((await res.json()).error);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/channel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: ch.id, enabled: !ch.enabled }),
      });
      if (res.ok) onToggle(ch.id, !ch.enabled);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className="card p-5"
      style={{ opacity: ch.enabled ? 1 : 0.55, transition: "opacity 0.3s" }}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 mr-2">
          <div className="font-bold text-base mb-0.5 truncate" style={{ color: "var(--text-primary)" }}>
            {ch.name}
          </div>
          <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            {ch.id}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {/* 활성화 토글 */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={ch.enabled ? "비활성화" : "활성화"}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all"
            style={{
              background: ch.enabled ? "rgba(61,223,168,0.15)" : "var(--bg-card-hover)",
              border: `1px solid ${ch.enabled ? "rgba(61,223,168,0.3)" : "var(--border)"}`,
              color: ch.enabled ? "var(--accent-green)" : "var(--text-muted)",
            }}
          >
            {ch.enabled ? "●" : "○"}
          </button>
          {/* 삭제 버튼 */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="채널 삭제"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all"
            style={{
              background: "rgba(255,95,126,0.1)",
              border: "1px solid rgba(255,95,126,0.2)",
              color: "var(--accent-red)",
            }}
          >
            {deleting ? "…" : "✕"}
          </button>
        </div>
      </div>

      {/* 태그 */}
      {ch.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {ch.tags.map((t) => (
            <span key={t} className="badge badge-blue" style={{ fontSize: 10 }}>{t}</span>
          ))}
        </div>
      )}

      {/* 진행률 */}
      {totalCount > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
            <span>NotebookLM 등록률</span>
            <span>{addedCount}/{totalCount}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-secondary)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${percentage}%`, background: "var(--gradient-primary)" }}
            />
          </div>
        </div>
      )}

      {/* 링크 버튼 */}
      <div className="flex gap-2 mt-3">
        <a href={ch.url} target="_blank" rel="noopener noreferrer"
          className="flex-1 btn-secondary text-xs text-center"
          style={{ padding: "7px 0" }}
        >
          ▶ YouTube
        </a>
        {ch.notebookId && (
          <a
            href={`https://notebooklm.google.com/notebook/${ch.notebookId}`}
            target="_blank" rel="noopener noreferrer"
            className="flex-1 btn-secondary text-xs text-center"
            style={{ padding: "7px 0" }}
          >
            📖 NotebookLM
          </a>
        )}
      </div>
    </div>
  );
}

// ─── 채널 추가 폼 ────────────────────────────────────────────────────────────

function AddChannelForm({ onAdded }: { onAdded: (ch: ConfigChannel) => void }) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [notebookUrl, setNotebookUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!youtubeUrl.trim() || !notebookUrl.trim()) {
      setError("YouTube URL과 NotebookLM URL을 모두 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: youtubeUrl.trim(), notebookUrl: notebookUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSuccess(`✅ "${json.channel.name}" 채널이 등록되었습니다!`);
      setYoutubeUrl("");
      setNotebookUrl("");
      onAdded(json.channel);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    transition: "border-color 0.2s",
  };

  return (
    <div className="card p-6 mb-6">
      <div className="font-bold text-base mb-4" style={{ color: "var(--text-primary)" }}>
        ➕ 새 채널 등록
      </div>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
              YouTube 채널 또는 재생목록 URL
            </label>
            <input
              type="text"
              placeholder="채널: https://www.youtube.com/@handle  |  재생목록: https://www.youtube.com/playlist?list=PL..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
              NotebookLM 노트북 URL
            </label>
            <input
              type="text"
              placeholder="https://notebooklm.google.com/notebook/..."
              value={notebookUrl}
              onChange={(e) => setNotebookUrl(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {error && (
          <div className="text-sm mb-3 px-3 py-2 rounded-lg"
            style={{ background: "rgba(255,95,126,0.1)", color: "var(--accent-red)", border: "1px solid rgba(255,95,126,0.2)" }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div className="text-sm mb-3 px-3 py-2 rounded-lg"
            style={{ background: "rgba(61,223,168,0.1)", color: "var(--accent-green)", border: "1px solid rgba(61,223,168,0.2)" }}>
            {success}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting} className="btn-primary text-sm" style={{ minWidth: 120 }}>
            {submitting ? "등록 중…" : "채널 등록"}
          </button>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            채널명은 YouTube API로 자동 조회됩니다
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── 헤더 ──────────────────────────────────────────────────────────────────

function Header({ lastUpdated }: { lastUpdated: string | null }) {
  return (
    <header
      className="glass sticky top-0 z-50 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg animate-pulse-glow"
            style={{ background: "var(--gradient-primary)" }}
          >
            🎯
          </div>
          <div>
            <div className="font-bold text-base">YouTube 학습 플랫폼</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              NotebookLM 자동 연동
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              마지막 업데이트: {timeAgo(lastUpdated)}
            </div>
          )}
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: "var(--accent-green)",
              boxShadow: "0 0 8px var(--accent-green)",
            }}
          />
        </div>
      </div>
    </header>
  );
}

// ─── 학습하기 탭 (NotebookLM 채팅) ─────────────────────────────────────────

function LearnTab({ channels }: { channels: ConfigChannel[] }) {
  const [selectedNotebookId, setSelectedNotebookId] = useState(
    channels[0]?.notebookId || ""
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedChannel = channels.find((c) => c.notebookId === selectedNotebookId);

  const handleNotebookChange = (id: string) => {
    setSelectedNotebookId(id);
    setMessages([]);
    setConversationId(undefined);
  };

  const handleClearChat = () => {
    setMessages([]);
    setConversationId(undefined);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedNotebookId || loading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebookId: selectedNotebookId,
          question: userMsg.content,
          conversationId,
        }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `❌ 오류: ${json.error || "응답 실패"}`,
            timestamp: new Date().toISOString(),
            isError: true,
          },
        ]);
      } else {
        if (json.conversationId) setConversationId(json.conversationId);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: json.answer,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ 네트워크 오류: ${err.message}`,
          timestamp: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const SUGGESTIONS = [
    "이 노트북의 핵심 개념을 요약해줘",
    "가장 중요한 학습 포인트는?",
    "Daily Bias란 무엇인가요?",
    "ICT 전략 개념 설명해줘",
  ];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 340px)", minHeight: 480 }}>
      {/* 노트북 선택 헤더 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={selectedNotebookId}
          onChange={(e) => handleNotebookChange(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none font-medium"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)", minWidth: 200 }}
        >
          {channels.map((c) => (
            <option key={c.notebookId} value={c.notebookId}>
              📖 {c.name}
            </option>
          ))}
        </select>

        {conversationId && (
          <span
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(61,223,168,0.1)", color: "var(--accent-green)", border: "1px solid rgba(61,223,168,0.2)" }}
          >
            💬 대화 진행 중
          </span>
        )}

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            ↺ 초기화
          </button>
        )}

        {selectedChannel && (
          <a
            href={`https://notebooklm.google.com/notebook/${selectedChannel.notebookId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: "rgba(124,92,252,0.15)", color: "var(--accent-purple)", border: "1px solid rgba(124,92,252,0.3)" }}
          >
            🔗 NotebookLM
          </a>
        )}
      </div>

      {/* 시작 안내 */}
      {messages.length === 0 && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ color: "var(--text-muted)" }}>
          <div className="text-5xl mb-4">🧠</div>
          <div className="text-base font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
            {selectedChannel ? `"${selectedChannel.name}" 노트북에 질문하세요` : "노트북을 선택하세요"}
          </div>
          <div className="text-sm mb-6">영상 내용에 대해 자유롭게 질문하면 NotebookLM이 답변합니다</div>
          <div className="flex flex-wrap gap-2 justify-center max-w-lg">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                className="text-xs px-3 py-2 rounded-xl transition-all"
                style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 대화 목록 */}
      {(messages.length > 0 || loading) && (
        <div
          className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[80%] px-4 py-3 text-sm leading-relaxed"
                style={{
                  background:
                    msg.role === "user"
                      ? "var(--gradient-primary)"
                      : msg.isError
                      ? "rgba(255,95,126,0.1)"
                      : "var(--bg-secondary)",
                  color: msg.role === "user" ? "white" : msg.isError ? "var(--accent-red)" : "var(--text-primary)",
                  border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                }}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1 mb-2" style={{ color: "var(--accent-purple)", fontSize: 11 }}>
                    🧠 NotebookLM
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</div>
                <div className="text-right mt-1" style={{ fontSize: 10, opacity: 0.45 }}>
                  {new Date(msg.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div
                className="px-4 py-3 text-sm"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "18px 18px 18px 4px" }}
              >
                <div className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--accent-purple)", animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: 12 }}>NotebookLM이 생각 중입니다...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* 입력 영역 */}
      <div
        className="flex gap-2 items-end"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "10px 12px" }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedNotebookId ? "질문을 입력하세요... (Shift+Enter로 줄바꿈, Enter로 전송)" : "위에서 노트북을 선택해주세요"}
          disabled={!selectedNotebookId || loading}
          rows={2}
          className="flex-1 resize-none outline-none text-sm"
          style={{ background: "transparent", color: "var(--text-primary)", border: "none", lineHeight: 1.5 }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || !selectedNotebookId || loading}
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all"
          style={{
            background: input.trim() && selectedNotebookId && !loading ? "var(--gradient-primary)" : "var(--bg-secondary)",
            color: input.trim() && selectedNotebookId && !loading ? "white" : "var(--text-muted)",
          }}
        >
          {loading ? (
            <span style={{ fontSize: 16 }}>⏳</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── 빈 상태 ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="card p-16 text-center animate-fade-in-up">
      <div className="text-6xl mb-6">🎬</div>
      <h2 className="text-2xl font-bold mb-3 gradient-text">
        아직 영상이 없습니다
      </h2>
      <p className="mb-8" style={{ color: "var(--text-secondary)" }}>
        크롤러를 실행하여 YouTube 채널 영상을 수집하세요.
      </p>
      <div
        className="card p-5 text-left text-sm max-w-md mx-auto"
        style={{ background: "var(--bg-secondary)" }}
      >
        <div className="font-semibold mb-3" style={{ color: "var(--accent-purple)" }}>
          시작하기
        </div>
        <ol className="space-y-2" style={{ color: "var(--text-secondary)" }}>
          <li>
            1️⃣{" "}
            <code
              className="px-2 py-0.5 rounded text-xs"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent-blue)" }}
            >
              .env
            </code>{" "}
            파일에 <code className="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-card-hover)", color: "var(--accent-blue)" }}>YOUTUBE_API_KEY</code> 설정
          </li>
          <li>
            2️⃣{" "}
            <code className="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-card-hover)", color: "var(--accent-blue)" }}>config/channels.json</code>에 채널 추가
          </li>
          <li>
            3️⃣{" "}
            <code className="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-card-hover)", color: "var(--accent-blue)" }}>npm run crawler:dry-run</code> 으로 테스트
          </li>
          <li>
            4️⃣{" "}
            <code className="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-card-hover)", color: "var(--accent-blue)" }}>npm run crawler</code> 로 실제 실행
          </li>
        </ol>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ────────────────────────────────────────────────────────────

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"videos" | "channels" | "learn">("videos");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterAdded, setFilterAdded] = useState<"all" | "added" | "pending">("all");
  const [configChannels, setConfigChannels] = useState<ConfigChannel[]>([]);

  // channels.json 로드
  const fetchConfigChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const json = await res.json();
        setConfigChannels(json.channels ?? []);
      }
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("데이터 로드 실패");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchConfigChannels();
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, [fetchData, fetchConfigChannels]);

  const handleChannelAdded = (ch: ConfigChannel) => {
    setConfigChannels((prev) => [...prev, ch]);
  };

  const handleChannelDeleted = (channelId: string) => {
    setConfigChannels((prev) => prev.filter((c) => c.id !== channelId));
  };

  const handleChannelToggled = (channelId: string, enabled: boolean) => {
    setConfigChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, enabled } : c))
    );
  };

  // 필터링된 영상 목록
  const filteredVideos = (data?.recentVideos || []).filter((v) => {
    const matchSearch =
      !searchQuery ||
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.channelName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchChannel =
      filterChannel === "all" || v.channelName === filterChannel;
    const matchAdded =
      filterAdded === "all" ||
      (filterAdded === "added" && v.addedToNotebook) ||
      (filterAdded === "pending" && !v.addedToNotebook);
    return matchSearch && matchChannel && matchAdded;
  });

  const channelNames = [
    ...new Set((data?.recentVideos || []).map((v) => v.channelName)),
  ];

  return (
    <div style={{ background: "var(--bg-primary)", minHeight: "100vh" }}>
      {/* 배경 그라디언트 장식 */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 20% 20%, rgba(124,92,252,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(77,159,255,0.04) 0%, transparent 60%)",
          zIndex: 0,
        }}
      />

      <Header lastUpdated={data?.stats.lastUpdated || null} />

      <main
        className="max-w-7xl mx-auto px-6 py-8"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 제목 */}
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-4xl font-bold mb-2">
            <span className="gradient-text">학습 대시보드</span>
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            YouTube 채널 영상을 자동으로 수집하고 NotebookLM으로 분석합니다
          </p>
        </div>

        {/* 로딩 상태 */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-32" />
            ))}
          </div>
        )}

        {/* 에러 상태 */}
        {error && !loading && (
          <div
            className="card p-6 mb-8 text-center"
            style={{ borderColor: "var(--accent-red)", color: "var(--accent-red)" }}
          >
            <div className="text-3xl mb-2">⚠️</div>
            <div className="font-semibold mb-1">데이터 로드 오류</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              {error}
            </div>
            <button onClick={fetchData} className="btn-primary mt-4 text-sm">
              다시 시도
            </button>
          </div>
        )}

        {/* 통계 카드 */}
        {data && !loading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon="📺"
                label="모니터링 채널"
                value={data.stats.totalChannels}
                color="var(--accent-purple)"
                delay={0}
              />
              <StatCard
                icon="🎬"
                label="총 수집 영상"
                value={data.stats.totalVideos}
                color="var(--accent-blue)"
                delay={100}
              />
              <StatCard
                icon="📚"
                label="NotebookLM 등록"
                value={data.stats.addedToNotebook}
                color="var(--accent-green)"
                delay={200}
              />
              <StatCard
                icon="⏳"
                label="등록 대기"
                value={data.stats.pendingVideos}
                color="var(--accent-yellow)"
                delay={300}
              />
            </div>

            {/* 탭 */}
            <div
              className="flex gap-2 mb-6 p-1 rounded-xl w-fit"
              style={{ background: "var(--bg-secondary)" }}
            >
              {(["videos", "channels", "learn"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    background:
                      activeTab === tab ? "var(--accent-purple)" : "transparent",
                    color:
                      activeTab === tab ? "white" : "var(--text-secondary)",
                  }}
                >
                  {tab === "videos" ? "🎬 영상 목록" : tab === "channels" ? "📺 채널 관리" : "🧠 학습하기"}
                </button>
              ))}
            </div>

            {/* 영상 목록 탭 */}
            {activeTab === "videos" && (
              <div className="animate-fade-in-up">
                {/* 필터 바 */}
                <div className="flex flex-wrap gap-3 mb-6">
                  <input
                    type="text"
                    placeholder="🔍 영상 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-48 px-4 py-2 rounded-xl text-sm outline-none"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <select
                    value={filterChannel}
                    onChange={(e) => setFilterChannel(e.target.value)}
                    className="px-4 py-2 rounded-xl text-sm outline-none"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="all">전체 채널</option>
                    {channelNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterAdded}
                    onChange={(e) =>
                      setFilterAdded(e.target.value as "all" | "added" | "pending")
                    }
                    className="px-4 py-2 rounded-xl text-sm outline-none"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="all">전체 상태</option>
                    <option value="added">✅ 등록 완료</option>
                    <option value="pending">⏳ 대기 중</option>
                  </select>
                  <div
                    className="px-4 py-2 rounded-xl text-sm"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {filteredVideos.length}개
                  </div>
                </div>

                {filteredVideos.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredVideos.map((video) => (
                      <VideoCard key={video.videoId} video={video} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 채널 관리 탭 */}
            {activeTab === "channels" && (
              <div className="animate-fade-in-up">
                {/* 채널 추가 폼 */}
                <AddChannelForm onAdded={handleChannelAdded} />

                {/* 채널 목록 */}
                {configChannels.length === 0 ? (
                  <div className="card p-10 text-center">
                    <div className="text-4xl mb-3">📺</div>
                    <div className="font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                      등록된 채널이 없습니다
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                      위 폼에서 YouTube 채널을 추가해보세요
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {configChannels.map((ch) => (
                      <ChannelCard
                        key={ch.id}
                        ch={ch}
                        statsChannel={data.channels.find((c) => c.channelId === ch.id || c.channelName === ch.name)}
                        onDelete={handleChannelDeleted}
                        onToggle={handleChannelToggled}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* 학습하기 탭 */}
            {activeTab === "learn" && (
              <div className="animate-fade-in-up">
                {configChannels.filter((c) => c.notebookId).length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="text-5xl mb-4">🧠</div>
                    <div className="text-lg font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                      학습할 노트북이 없습니다
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                      채널 관리 탭에서 YouTube 채널과 NotebookLM 노트북을 먼저 등록해주세요
                    </div>
                  </div>
                ) : (
                  <div className="card p-6">
                    <LearnTab channels={configChannels.filter((c) => c.notebookId)} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* 푸터 */}
      <footer
        className="text-center py-8 mt-12"
        style={{ color: "var(--text-muted)", fontSize: 13 }}
      >
        YouTube 학습 플랫폼 · NotebookLM 자동 연동 · 5분마다 자동 갱신
      </footer>
    </div>
  );
}
