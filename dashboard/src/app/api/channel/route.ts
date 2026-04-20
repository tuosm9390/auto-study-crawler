import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "../config/channels.json");

// ─── URL 파싱 유틸리티 ──────────────────────────────────────────────────────

function extractYouTubeId(url: string): string {
  // @handle
  const atMatch = url.match(/@([a-zA-Z0-9_.\-]+)/);
  if (atMatch) return `@${atMatch[1]}`;
  // /channel/UCxxxxx
  const channelMatch = url.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (channelMatch) return channelMatch[1];
  // 이미 @handle 또는 UCxxxxx
  if (url.startsWith("@") || url.startsWith("UC")) return url;
  return url.trim();
}

/** 유튜브 URL이 재생목록인지 확인 */
function extractPlaylistId(url: string): string | null {
  const match = url.match(/[?&]list=(PL[a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (url.startsWith("PL")) return url.trim();
  return null;
}

function extractNotebookId(url: string): string {
  // https://notebooklm.google.com/notebook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const match = url.match(/\/notebook\/([a-f0-9-]{36})/i);
  if (match) return match[1];

  // 이미 UUID 형식
  if (url.match(/^[a-f0-9-]{36}$/i)) return url.trim();

  return url.trim();
}

// ─── YouTube API로 채널명 조회 ──────────────────────────────────────────────

async function fetchChannelInfo(
  channelId: string
): Promise<{ name: string; url: string } | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  try {
    const isUCId = channelId.startsWith("UC");
    const cleanHandle = channelId.startsWith("@")
      ? channelId.slice(1)
      : channelId;

    const params = new URLSearchParams({
      part: "snippet",
      key: apiKey,
      ...(isUCId ? { id: channelId } : { forHandle: cleanHandle }),
    });

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params}`
    );
    const data = await res.json();

    if (data.items && data.items.length > 0) {
      const snippet = data.items[0].snippet;
      const id = data.items[0].id;
      return {
        name: snippet.title,
        url: `https://www.youtube.com/channel/${id}`,
      };
    }
  } catch {
    // API 오류 무시
  }
  return null;
}

/** YouTube API로 재생목록 정보 조회 */
async function fetchPlaylistInfo(
  playlistId: string,
  apiKey: string
): Promise<{ title: string; channelTitle: string } | null> {
  try {
    const params = new URLSearchParams({
      part: "snippet",
      id: playlistId,
      key: apiKey,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?${params}`
    );
    const data = await res.json();
    if (data.items?.length > 0) {
      return {
        title: data.items[0].snippet.title,
        channelTitle: data.items[0].snippet.channelTitle,
      };
    }
  } catch {}
  return null;
}

// ─── POST: 채널/재생목록 추가 ────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { youtubeUrl, notebookUrl, channelName: overrideName, tags, notes } =
      body;

    if (!youtubeUrl?.trim() || !notebookUrl?.trim()) {
      return NextResponse.json(
        { error: "YouTube URL과 NotebookLM URL을 모두 입력해주세요." },
        { status: 400 }
      );
    }

    // 재생목록 URL인지 체크
    const playlistId = extractPlaylistId(youtubeUrl);
    const isPlaylist = !!playlistId;

    const channelId = isPlaylist ? playlistId! : extractYouTubeId(youtubeUrl);
    const notebookId = extractNotebookId(notebookUrl);

    if (!notebookId || notebookId.length < 10) {
      return NextResponse.json(
        { error: "NotebookLM URL이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 기존 설정 로드
    let config: any = { channels: [], settings: {} };
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }

    // 중복 체크
    const duplicate = config.channels?.find(
      (c: any) => c.id === channelId || c.notebookId === notebookId
    );
    if (duplicate) {
      return NextResponse.json(
        { error: `이미 등록된 항목입니다: ${duplicate.name}` },
        { status: 409 }
      );
    }

    // 이름 자동 조회
    const apiKey = process.env.YOUTUBE_API_KEY;
    let name = overrideName?.trim() || channelId;
    let canonicalUrl = youtubeUrl.startsWith("http") ? youtubeUrl : `https://www.youtube.com/${youtubeUrl}`;

    if (isPlaylist && apiKey) {
      const info = await fetchPlaylistInfo(playlistId!, apiKey);
      if (info) name = overrideName?.trim() || info.title;
    } else if (!isPlaylist && apiKey) {
      const info = await fetchChannelInfo(channelId);
      if (info) {
        name = overrideName?.trim() || info.name;
        canonicalUrl = info.url;
      }
    }

    const newChannel = {
      id: channelId,
      type: isPlaylist ? "playlist" : "channel",
      name,
      url: canonicalUrl,
      notebookId,
      notebookTitle: name,
      enabled: true,
      tags: tags || [],
      notes: notes || "",
    };

    if (!Array.isArray(config.channels)) config.channels = [];
    config.channels.push(newChannel);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");

    return NextResponse.json({ success: true, channel: newChannel });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── DELETE: 채널 삭제 ──────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const { channelId } = await req.json();

    let config: any = { channels: [], settings: {} };
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }

    const before = config.channels?.length ?? 0;
    config.channels = (config.channels ?? []).filter(
      (c: any) => c.id !== channelId
    );

    if (config.channels.length === before) {
      return NextResponse.json({ error: "채널을 찾을 수 없습니다." }, { status: 404 });
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PATCH: 채널 활성화/비활성화 토글 ──────────────────────────────────────

export async function PATCH(req: Request) {
  try {
    const { channelId, enabled } = await req.json();

    let config: any = { channels: [], settings: {} };
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }

    const channel = config.channels?.find((c: any) => c.id === channelId);
    if (!channel) {
      return NextResponse.json({ error: "채널을 찾을 수 없습니다." }, { status: 404 });
    }

    channel.enabled = enabled;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
    return NextResponse.json({ success: true, channel });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
