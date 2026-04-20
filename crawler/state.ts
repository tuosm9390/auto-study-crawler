import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

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

export interface VideosDatabase {
  version: string;
  lastUpdated: string;
  channels: Record<string, ChannelRecord>;
}

export class StateManager {
  private dbPath: string;
  private db: VideosDatabase;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = this.load();
  }

  private load(): VideosDatabase {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        return JSON.parse(raw);
      } catch {
        console.warn('⚠️  상태 파일 파싱 실패, 새로 초기화합니다.');
      }
    }
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      channels: {},
    };
  }

  save(): void {
    this.db.lastUpdated = new Date().toISOString();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2), 'utf8');
  }

  getChannel(channelId: string): ChannelRecord | null {
    return this.db.channels[channelId] || null;
  }

  setChannel(channelId: string, record: ChannelRecord): void {
    this.db.channels[channelId] = record;
  }

  hasVideo(channelId: string, videoId: string): boolean {
    const channel = this.db.channels[channelId];
    if (!channel) return false;
    return channel.videos.some((v) => v.videoId === videoId);
  }

  getNewVideos(channelId: string, fetchedVideoIds: string[]): string[] {
    const known = new Set(
      (this.db.channels[channelId]?.videos || []).map((v) => v.videoId)
    );
    return fetchedVideoIds.filter((id) => !known.has(id));
  }

  addVideo(channelId: string, video: VideoRecord): void {
    if (!this.db.channels[channelId]) return;
    this.db.channels[channelId].videos.push(video);
    this.db.channels[channelId].totalVideos =
      this.db.channels[channelId].videos.length;
  }

  markVideoAdded(
    channelId: string,
    videoId: string,
    sourceId: string | null,
    notebookId: string
  ): void {
    const channel = this.db.channels[channelId];
    if (!channel) return;
    const video = channel.videos.find((v) => v.videoId === videoId);
    if (video) {
      video.addedToNotebook = true;
      video.addedAt = new Date().toISOString();
      video.sourceId = sourceId;
      video.notebookId = notebookId;
    }
  }

  updateLastChecked(channelId: string): void {
    if (this.db.channels[channelId]) {
      this.db.channels[channelId].lastChecked = new Date().toISOString();
    }
  }

  getStats(): {
    totalChannels: number;
    totalVideos: number;
    addedToNotebook: number;
  } {
    const channels = Object.values(this.db.channels);
    return {
      totalChannels: channels.length,
      totalVideos: channels.reduce((sum, c) => sum + c.videos.length, 0),
      addedToNotebook: channels.reduce(
        (sum, c) => sum + c.videos.filter((v) => v.addedToNotebook).length,
        0
      ),
    };
  }
}
