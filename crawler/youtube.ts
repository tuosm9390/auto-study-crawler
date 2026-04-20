import { google, youtube_v3 } from 'googleapis';

export interface VideoItem {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  channelId: string;
  channelTitle: string;
  url: string;
  duration?: string;
}

export class YouTubeClient {
  private youtube: youtube_v3.Youtube;

  constructor(apiKey: string) {
    this.youtube = google.youtube({
      version: 'v3',
      auth: apiKey,
    });
  }

  /**
   * 채널 ID로 업로드 재생목록 ID를 가져옵니다.
   */
  async getUploadsPlaylistId(channelId: string): Promise<string> {
    const response = await this.youtube.channels.list({
      part: ['contentDetails', 'snippet'],
      id: [channelId],
    });

    const items = response.data.items;
    if (!items || items.length === 0) {
      throw new Error(`채널을 찾을 수 없습니다: ${channelId}`);
    }

    const uploadsPlaylistId =
      items[0].contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      throw new Error(`업로드 재생목록을 찾을 수 없습니다: ${channelId}`);
    }

    return uploadsPlaylistId;
  }

  /**
   * 채널 핸들(@username)로 채널 ID를 조회합니다.
   */
  async getChannelIdByHandle(handle: string): Promise<string> {
    // @username 형식에서 @ 제거
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    const response = await this.youtube.channels.list({
      part: ['id', 'snippet'],
      forHandle: cleanHandle,
    });

    const items = response.data.items;
    if (!items || items.length === 0) {
      throw new Error(`채널 핸들을 찾을 수 없습니다: ${handle}`);
    }

    return items[0].id!;
  }

  /**
   * 재생목록에서 최신 영상 목록을 가져옵니다.
   */
  async getPlaylistVideos(
    playlistId: string,
    maxResults: number = 50
  ): Promise<VideoItem[]> {
    const videos: VideoItem[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId,
        maxResults: Math.min(maxResults - videos.length, 50),
        pageToken,
      });

      const items = response.data.items || [];

      for (const item of items) {
        const snippet = item.snippet;
        const videoId = snippet?.resourceId?.videoId;

        if (!videoId || snippet?.title === 'Private video' || snippet?.title === 'Deleted video') {
          continue;
        }

        videos.push({
          videoId,
          title: snippet?.title || '제목 없음',
          description: snippet?.description || '',
          publishedAt: snippet?.publishedAt || new Date().toISOString(),
          thumbnailUrl:
            snippet?.thumbnails?.high?.url ||
            snippet?.thumbnails?.default?.url ||
            '',
          channelId: snippet?.channelId || '',
          channelTitle: snippet?.channelTitle || '',
          url: `https://www.youtube.com/watch?v=${videoId}`,
        });

        if (videos.length >= maxResults) break;
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken && videos.length < maxResults);

    return videos;
  }

  /**
   * 채널의 최신 영상을 가져옵니다 (채널 ID 또는 핸들 자동 처리).
   */
  async getChannelVideos(
    channelIdOrHandle: string,
    maxResults: number = 50
  ): Promise<VideoItem[]> {
    let channelId = channelIdOrHandle;

    // 핸들(@)이면 채널 ID로 변환
    if (channelIdOrHandle.startsWith('@') || !channelIdOrHandle.startsWith('UC')) {
      channelId = await this.getChannelIdByHandle(channelIdOrHandle);
    }

    const playlistId = await this.getUploadsPlaylistId(channelId);
    const videos = await this.getPlaylistVideos(playlistId, maxResults);

    return videos;
  }
}
