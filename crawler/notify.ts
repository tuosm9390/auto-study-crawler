import axios from 'axios';
import { VideoItem } from './youtube';
import { logger } from './logger';

export interface NotificationPayload {
  channelName: string;
  newVideos: VideoItem[];
  notebookTitle: string;
  notebookId: string;
}

export async function sendSlackNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<void> {
  const videoList = payload.newVideos
    .map((v) => `• <${v.url}|${v.title}>`)
    .join('\n');

  const message = {
    text: `📺 *${payload.channelName}* 에서 새 영상 ${payload.newVideos.length}개가 추가되었습니다!`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📺 *${payload.channelName}* — 새 영상 ${payload.newVideos.length}개`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: videoList,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📖 NotebookLM에서 보기' },
            url: `https://notebooklm.google.com/notebook/${payload.notebookId}`,
          },
        ],
      },
    ],
  };

  await axios.post(webhookUrl, message);
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  payload: NotificationPayload
): Promise<void> {
  const videoList = payload.newVideos
    .map((v) => `• <a href="${v.url}">${v.title}</a>`)
    .join('\n');

  const text = [
    `📺 <b>${payload.channelName}</b> — 새 영상 ${payload.newVideos.length}개`,
    '',
    videoList,
    '',
    `📖 <a href="https://notebooklm.google.com/notebook/${payload.notebookId}">NotebookLM에서 보기</a>`,
  ].join('\n');

  await axios.post(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }
  );
}

export async function sendNotifications(
  payload: NotificationPayload
): Promise<void> {
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  const tasks: Promise<void>[] = [];

  if (slackWebhook) {
    tasks.push(
      sendSlackNotification(slackWebhook, payload).catch((err) =>
        logger.warn('Slack 알림 전송 실패:', err.message)
      )
    );
  }

  if (telegramToken && telegramChatId) {
    tasks.push(
      sendTelegramNotification(telegramToken, telegramChatId, payload).catch(
        (err) => logger.warn('Telegram 알림 전송 실패:', err.message)
      )
    );
  }

  await Promise.all(tasks);
}
