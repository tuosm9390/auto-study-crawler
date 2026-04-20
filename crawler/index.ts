#!/usr/bin/env ts-node
/**
 * YouTube → NotebookLM 자동 크롤러 메인 스크립트
 *
 * 사용법:
 *   npx ts-node crawler/index.ts            # 실제 실행
 *   npx ts-node crawler/index.ts --dry-run  # 테스트 (실제 추가 X)
 *   npx ts-node crawler/index.ts --force    # 상태 무시하고 전체 재처리
 *   npx ts-node crawler/index.ts UCxxxxxx  # 특정 채널만
 *   npx ts-node crawler/index.ts PLxxxxxx  # 특정 재생목록만
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// 환경 변수 로드
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { YouTubeClient, VideoItem, extractPlaylistId } from "./youtube";
import { NotebookLMClient } from "./notebooklm";
import { StateManager, VideoRecord, ChannelRecord } from "./state";
import { sendNotifications } from "./notify";
import { logger } from "./logger";

// =============================================================================
// 설정 로드
// =============================================================================

interface ChannelConfig {
  id: string;
  type?: "channel" | "playlist"; // 기본값 'channel'
  name: string;
  url: string;
  notebookId: string;
  notebookTitle: string;
  enabled: boolean;
  tags: string[];
  notes: string;
}

interface AppConfig {
  channels: ChannelConfig[];
  settings: {
    defaultLanguage: string;
    autoGenerateAudioOverview: boolean;
    autoGenerateBriefingDoc: boolean;
    notifyOnNewVideo: boolean;
    timezone: string;
    scheduleTime: string;
  };
}

function loadConfig(): AppConfig {
  const configPath = path.resolve(__dirname, "../config/channels.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`설정 파일을 찾을 수 없습니다: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

// =============================================================================
// 슬립 유틸리티 (API 레이트 리밋 방지)
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// 채널 처리 로직
// =============================================================================

async function processChannel(
  channelConfig: ChannelConfig,
  youtubeClient: YouTubeClient,
  nlmClient: NotebookLMClient,
  stateManager: StateManager,
  options: { dryRun: boolean; force: boolean },
): Promise<{ newCount: number; newVideos: VideoItem[] }> {
  logger.section(`📺 채널: ${channelConfig.name}`);

  const channelId = channelConfig.id;
  const maxCheckVideos = parseInt(process.env.MAX_CHECK_VIDEOS || "50");
  const maxInitialVideos = parseInt(process.env.MAX_INITIAL_VIDEOS || "20");

  // 기존 채널 상태 확인
  let channelRecord = stateManager.getChannel(channelId);
  const isNewChannel = !channelRecord;

  const fetchCount = isNewChannel ? maxInitialVideos : maxCheckVideos;
  logger.info(
    `${isNewChannel ? "✨ 새 채널 초기화" : "🔄 신규 영상 확인"} — 최대 ${fetchCount}개 조회`,
  );

  // YouTube에서 영상 목록 가져오기
  let videos: VideoItem[];
  try {
    const isPlaylist =
      channelConfig.type === "playlist" || channelId.startsWith("PL");
    if (isPlaylist) {
      // 재생목록 타입: 재생목록 ID로 직접 조회
      const playlistId = extractPlaylistId(channelId) || channelId;
      videos = await youtubeClient.getPlaylistVideos(playlistId, fetchCount);
      logger.info(
        `플레이리스트 [${playlistId}]에서 ${videos.length}개 영상 조회 완료`,
      );
    } else {
      // 일반 채널: 업로드 재생목록으로 조회
      videos = await youtubeClient.getChannelVideos(channelId, fetchCount);
      logger.info(`YouTube에서 ${videos.length}개 영상 조회 완료`);
    }
  } catch (err: any) {
    logger.error(`YouTube API 오류: ${err.message}`);
    return { newCount: 0, newVideos: [] };
  }

  // 채널 레코드 초기화 (신규 채널)
  if (isNewChannel) {
    channelRecord = {
      channelId,
      channelName: channelConfig.name,
      notebookId: channelConfig.notebookId,
      notebookTitle: channelConfig.notebookTitle,
      lastChecked: new Date().toISOString(),
      totalVideos: 0,
      videos: [],
    };
    stateManager.setChannel(channelId, channelRecord);
  }

  // 신규 영상 탐지
  const allVideoIds = videos.map((v) => v.videoId);
  const newVideoIds = options.force
    ? allVideoIds
    : stateManager.getNewVideos(channelId, allVideoIds);

  const newVideos = videos.filter((v) => newVideoIds.includes(v.videoId));

  if (newVideos.length === 0) {
    logger.info("📭 새로운 영상이 없습니다.");
    stateManager.updateLastChecked(channelId);
    return { newCount: 0, newVideos: [] };
  }

  logger.info(`🆕 새 영상 ${newVideos.length}개 발견!`);
  newVideos.forEach((v) => logger.newVideo(v.title, v.url));

  if (options.dryRun) {
    logger.warn("🧪 DRY-RUN 모드: NotebookLM에 실제로 추가하지 않습니다.");
    return { newCount: newVideos.length, newVideos };
  }

  // NotebookLM이 없으면 새 노트북 생성
  let notebookId = channelConfig.notebookId;
  if (!notebookId) {
    logger.info(`📒 새 노트북 생성: "${channelConfig.notebookTitle}"`);
    const newId = await nlmClient.createNotebook(channelConfig.notebookTitle);
    if (newId) {
      notebookId = newId;
      channelConfig.notebookId = newId;
      logger.success(`노트북 생성 완료: ${newId}`);
    } else {
      logger.error(
        "노트북 생성 실패. channels.json에 notebookId를 직접 입력해주세요.",
      );
      return { newCount: 0, newVideos: [] };
    }
  }

  // NotebookLM에 소스 추가
  let successCount = 0;
  for (const video of newVideos) {
    logger.info(`  ➕ 추가 중: ${video.title}`);

    // 상태 파일에 미리 등록
    const record: VideoRecord = {
      videoId: video.videoId,
      title: video.title,
      description: video.description.substring(0, 500),
      publishedAt: video.publishedAt,
      thumbnailUrl: video.thumbnailUrl,
      url: video.url,
      addedToNotebook: false,
      addedAt: null,
      sourceId: null,
      notebookId: null,
    };

    if (!stateManager.hasVideo(channelId, video.videoId)) {
      stateManager.addVideo(channelId, record);
    }

    // NotebookLM에 추가
    const result = await nlmClient.addYouTubeSource(
      notebookId,
      video.url,
      video.title,
    );

    if (result.success) {
      stateManager.markVideoAdded(
        channelId,
        video.videoId,
        result.sourceId || null,
        notebookId,
      );
      logger.success(`  ✅ 추가 완료: ${video.title}`);
      successCount++;
    } else {
      logger.error(`  ❌ 추가 실패: ${video.title} — ${result.error}`);
    }

    // API 레이트 리밋 방지 (2초 대기)
    await sleep(2000);
  }

  stateManager.updateLastChecked(channelId);

  logger.section(`✅ 완료: ${successCount}/${newVideos.length}개 추가`);
  return { newCount: successCount, newVideos };
}

// =============================================================================
// 메인 함수
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const targetChannel = args.find((a) => !a.startsWith("--"));

  console.log("\n");
  logger.section("🚀 YouTube → NotebookLM 크롤러 시작");

  if (dryRun) logger.warn("⚡ DRY-RUN 모드 활성화");
  if (force) logger.warn("⚡ FORCE 모드 활성화 (기존 영상 재처리)");

  // API 키 확인
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || apiKey === "your_youtube_api_key_here") {
    logger.error("❌ YOUTUBE_API_KEY가 설정되지 않았습니다!");
    logger.error("   .env 파일에서 YOUTUBE_API_KEY를 설정해주세요.");
    process.exit(1);
  }

  // 설정 로드
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (err: any) {
    logger.error(`설정 파일 로드 실패: ${err.message}`);
    process.exit(1);
  }

  const enabledChannels = config.channels.filter(
    (c) =>
      c.enabled &&
      (!targetChannel ||
        c.id === targetChannel ||
        c.name === targetChannel ||
        extractPlaylistId(c.id) === targetChannel),
  );

  if (enabledChannels.length === 0) {
    logger.warn("처리할 채널이 없습니다. config/channels.json을 확인해주세요.");
    process.exit(0);
  }

  logger.info(`처리할 채널: ${enabledChannels.length}개`);

  // 클라이언트 초기화
  const youtubeClient = new YouTubeClient(apiKey);
  const nlmClient = new NotebookLMClient();
  const stateManager = new StateManager(
    path.resolve(__dirname, "../data/videos.json"),
  );

  // 채널별 처리
  let totalNewVideos = 0;
  for (const channel of enabledChannels) {
    try {
      const { newCount, newVideos } = await processChannel(
        channel,
        youtubeClient,
        nlmClient,
        stateManager,
        { dryRun, force },
      );

      totalNewVideos += newCount;

      // 알림 전송
      if (newCount > 0 && config.settings.notifyOnNewVideo && !dryRun) {
        await sendNotifications({
          channelName: channel.name,
          newVideos,
          notebookTitle: channel.notebookTitle,
          notebookId: channel.notebookId,
        });
      }

      // 채널 간 딜레이
      if (enabledChannels.indexOf(channel) < enabledChannels.length - 1) {
        await sleep(3000);
      }
    } catch (err: any) {
      logger.error(`채널 처리 중 오류 [${channel.name}]: ${err.message}`);
    }

    // 중간 저장
    if (!dryRun) stateManager.save();
  }

  // 최종 저장
  if (!dryRun) stateManager.save();

  // 통계 출력
  const stats = stateManager.getStats();
  logger.section("📊 전체 통계");
  logger.info(`📺 모니터링 채널: ${stats.totalChannels}개`);
  logger.info(`🎬 총 수집 영상: ${stats.totalVideos}개`);
  logger.info(`📚 NotebookLM 등록: ${stats.addedToNotebook}개`);
  logger.info(`🆕 이번 실행 신규: ${totalNewVideos}개`);

  console.log("\n");
}

main().catch((err) => {
  logger.error(`치명적 오류: ${err.message}`);
  console.error(err);
  process.exit(1);
});
