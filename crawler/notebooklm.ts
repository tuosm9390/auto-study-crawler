import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface NotebookInfo {
  id: string;
  title: string;
}

export interface AddSourceResult {
  success: boolean;
  sourceId?: string;
  error?: string;
}

/**
 * NotebookLM과 연동하는 모듈.
 * nlm CLI 또는 MCP 서버를 통해 소스를 추가합니다.
 */
export class NotebookLMClient {
  private nlmCommand: string;

  constructor() {
    // nlm CLI 명령어 확인
    this.nlmCommand = this.detectNlmCommand();
  }

  private detectNlmCommand(): string {
    // Windows에서 nlm 실행 파일 탐색
    const candidates = ['nlm', 'nlm.exe'];
    for (const cmd of candidates) {
      try {
        const result = spawnSync(cmd, ['--version'], { encoding: 'utf8', shell: true });
        if (result.status === 0) {
          return cmd;
        }
      } catch {
        // 계속 탐색
      }
    }
    // 직접 실행 경로 탐색
    const homedir = process.env.USERPROFILE || process.env.HOME || '';
    const possiblePaths = [
      path.join(homedir, '.local', 'bin', 'nlm'),
      path.join(homedir, '.cargo', 'bin', 'nlm'),
      '/usr/local/bin/nlm',
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
    return 'nlm'; // 기본값
  }

  /**
   * nlm CLI로 노트북 목록을 가져옵니다.
   */
  async listNotebooks(): Promise<NotebookInfo[]> {
    try {
      const result = spawnSync(
        this.nlmCommand,
        ['notebook', 'list', '--format', 'json'],
        { encoding: 'utf8', shell: true }
      );
      if (result.status === 0 && result.stdout) {
        return JSON.parse(result.stdout);
      }
    } catch (err) {
      console.error('노트북 목록 조회 실패:', err);
    }
    return [];
  }

  /**
   * 새 노트북을 생성합니다.
   */
  async createNotebook(title: string): Promise<string | null> {
    try {
      const result = spawnSync(
        this.nlmCommand,
        ['notebook', 'create', '--title', `"${title}"`, '--format', 'json'],
        { encoding: 'utf8', shell: true }
      );
      if (result.status === 0 && result.stdout) {
        const data = JSON.parse(result.stdout);
        return data.id || null;
      }
    } catch (err) {
      console.error('노트북 생성 실패:', err);
    }
    return null;
  }

  /**
   * YouTube URL을 노트북 소스로 추가합니다.
   * nlm CLI 구문: nlm source add <notebook_id> --youtube <url>
   */
  async addYouTubeSource(
    notebookId: string,
    videoUrl: string,
    title?: string
  ): Promise<AddSourceResult> {
    try {
      // 올바른 구문: notebook_id는 위치 인수, YouTube URL은 --youtube 플래그
      const args = [
        'source', 'add',
        notebookId,
        '--youtube', videoUrl,
        '--wait',
      ];

      if (title) {
        args.push('--title', title);
      }

      const result = spawnSync(this.nlmCommand, args, {
        encoding: 'utf8',
        shell: false,   // shell: false로 인수 보안 문제 방지
        timeout: 60000, // --wait가 있으므로 타임아웃을 넉넉히
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',  // Python이 UTF-8로 출력하도록 강제
          PYTHONUTF8: '1',            // Python 3.7+ UTF-8 모드
          NO_COLOR: '1',              // Rich 컬러 렌더링 비활성화 (Windows 인코딩 오류 방지)
        },
      });

      if (result.status === 0) {
        let sourceId: string | undefined;
        try {
          const data = JSON.parse(result.stdout || '{}');
          sourceId = data.id;
        } catch {
          // JSON 파싱 실패 시 무시 (CLI가 JSON이 아닌 텍스트를 반환할 수 있음)
        }
        return { success: true, sourceId };
      } else {
        const error = (result.stderr || result.stdout || '알 수 없는 오류').trim();
        return { success: false, error };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * MCP API를 직접 사용하는 방식 (nlm CLI 없을 때 대안).
   * Python subprocess로 MCP 서버에 요청합니다.
   */
  async addYouTubeSourceViaMCP(
    notebookId: string,
    videoUrl: string
  ): Promise<AddSourceResult> {
    const script = `
import json, sys, subprocess
result = subprocess.run(
    ['python', '-m', 'notebooklm_mcp', 'source_add',
     '--notebook_id', '${notebookId}',
     '--source_type', 'url',
     '--url', '${videoUrl}'],
    capture_output=True, text=True
)
print(result.stdout)
print(result.stderr, file=sys.stderr)
sys.exit(result.returncode)
`;
    try {
      execSync(`python -c "${script.replace(/"/g, '\\"')}"`, { timeout: 30000 });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
