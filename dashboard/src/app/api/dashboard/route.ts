import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const DB_PATH = path.resolve(process.cwd(), "../data/videos.json");
const CONFIG_PATH = path.resolve(process.cwd(), "../config/channels.json");

export interface VideoRecord {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  url: string;
  addedToNotebook: boolean;
  addedAt: string | null;
  sourceId: string | null;
  notebookId: string | null;
}

export interface ChannelRecord {
  channelId: string;
  channelName: string;
  notebookId: string;
  notebookTitle: string;
  lastChecked: string;
  totalVideos: number;
  videos: VideoRecord[];
}

export interface DashboardData {
  stats: {
    totalChannels: number;
    totalVideos: number;
    addedToNotebook: number;
    pendingVideos: number;
    lastUpdated: string | null;
  };
  channels: ChannelRecord[];
  recentVideos: (VideoRecord & { channelName: string })[];
}

export async function GET() {
  try {
    let db: any = { channels: {}, lastUpdated: null };
    let config: any = { channels: [], settings: {} };

    if (fs.existsSync(DB_PATH)) {
      db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }

    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }

    const channels: ChannelRecord[] = Object.values(db.channels || {});

    // 채널 설정과 병합
    const enrichedChannels = channels.map((ch: ChannelRecord) => {
      const cfgChannel = config.channels?.find(
        (c: any) => c.id === ch.channelId
      );
      return {
        ...ch,
        notebookTitle: ch.notebookTitle || cfgChannel?.notebookTitle || ch.channelName,
      };
    });

    // 최근 영상 (전체 채널 통합, 날짜 역순)
    const allVideos = enrichedChannels.flatMap((ch) =>
      ch.videos.map((v) => ({
        ...v,
        channelName: ch.channelName,
      }))
    );

    allVideos.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    const totalVideos = channels.reduce((s, c) => s + c.videos.length, 0);
    const addedToNotebook = channels.reduce(
      (s, c) => s + c.videos.filter((v) => v.addedToNotebook).length,
      0
    );

    const data: DashboardData = {
      stats: {
        totalChannels: channels.length,
        totalVideos,
        addedToNotebook,
        pendingVideos: totalVideos - addedToNotebook,
        lastUpdated: db.lastUpdated || null,
      },
      channels: enrichedChannels,
      recentVideos: allVideos.slice(0, 20),
    };

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
