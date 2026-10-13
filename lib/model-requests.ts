// サーバー専用。各関数の body が、そのサービスへ送信する JSON です。
// 質問文・判定基準は decision-policy.ts、送信前の検証は real-validation.ts を参照。
import { relevanceQuestions, videoQuestions, videoState } from './decision-policy.ts';
import { DecisionError, type RealInput } from './real-validation.ts';

type Env = Record<string, string | undefined>;
type RelevanceInput = Extract<RealInput, { kind: 'relevance' }>;
type VideoInput = Extract<RealInput, { kind: 'video' }>;
type Models = Record<RealInput['model'], string>;
export type ModelRequest = { url: string; key: string; model: string; body: object };

function requireSecret(env: Env, name: string): string {
  const value = env[name];
  if (!value || /[\r\n]/.test(value)) {
    throw new DecisionError(`${name}をサーバー側に設定してください。`, 503);
  }
  return value;
}

function relevanceState({ profile, thread }: RelevanceInput) {
  // 架空データのケースIDや正解ラベルは送らず、プロフィールと投稿だけを渡す。
  return {
    profile,
    thread: {
      title: thread.title,
      channel: thread.channel,
      updatedAt: thread.updatedAt,
      posts: thread.posts,
    },
  };
}

/** Jev: System One形式。state はオブジェクト、questions は質問IDをキーにした辞書。 */
export function buildJevRequest(input: RelevanceInput, env: Env, model: string): ModelRequest {
  return {
    url: 'https://api.typesafe.ai/v1/systemone',
    key: requireSecret(env, 'TYPESAFE_API_KEY'),
    model,
    body: {
      model,
      state: relevanceState(input),
      questions: relevanceQuestions,
    },
  };
}

function openaiScoreQuestion(name: string, question: { instructions: string; criteria: string[] }) {
  return {
    name,
    type: 'score',
    instructions: question.instructions,
    levels: question.criteria.map((description, index) => ({ label: String(index), description })),
  };
}

function openaiChoiceQuestion(name: string, question: { instructions: string; criteria: Record<string, string> }) {
  return {
    name,
    type: 'choice',
    instructions: question.instructions,
    choices: Object.entries(question.criteria).map(([value, description]) => ({ value, description })),
  };
}

/** OpenAI Decisions: input はJSON文字列、questions は name 付き配列。 */
export function buildOpenAIRequest(input: RelevanceInput, env: Env, model: string): ModelRequest {
  return {
    url: 'https://api.openai.com/v1/decisions',
    key: requireSecret(env, 'OPENAI_API_KEY'),
    model,
    body: {
      model,
      input: JSON.stringify(relevanceState(input)),
      questions: [
        openaiScoreQuestion('relevance', relevanceQuestions.relevance),
        openaiChoiceQuestion('action', relevanceQuestions.action),
        openaiChoiceQuestion('reason', relevanceQuestions.reason),
      ],
    },
  };
}

/** Liquid Hosted d1: System One形式に、JPEG data URLを1枚追加。 */
export function buildD1Request(input: VideoInput, env: Env): ModelRequest {
  return {
    url: 'https://api.liquid.ai/decisions/v1/systemone',
    key: requireSecret(env, 'LIQUID_API_KEY'),
    model: 'd1',
    body: {
      model: 'd1',
      state: videoState,
      questions: videoQuestions,
      images: [input.image],
    },
  };
}

/** Cloudflare Clef Flash: アカウント別Workers AI URLへ、d1と同じ画像・質問を送信。 */
export function buildClefRequest(input: VideoInput, env: Env): ModelRequest {
  const key = requireSecret(env, 'CLOUDFLARE_API_TOKEN');
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId || !/^[a-fA-F0-9]{32}$/.test(accountId)) {
    throw new DecisionError('CLOUDFLARE_ACCOUNT_IDを確認してください。', 503);
  }
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/clef-flash`,
    key,
    model: 'clef-flash',
    body: {
      model: 'clef-flash',
      state: videoState,
      // Cloudflareの質問IDはASCII限定。日本語の表示タグへの変換は応答解析で行う。
      questions: videoQuestions,
      images: [input.image],
    },
  };
}

export function buildModelRequest(input: RealInput, env: Env, models: Models): ModelRequest {
  if (input.kind === 'relevance') {
    switch (input.model) {
      case 'jev': return buildJevRequest(input, env, models.jev);
      case 'decisions': return buildOpenAIRequest(input, env, models.decisions);
    }
  }
  switch (input.model) {
    case 'd1': return buildD1Request(input, env);
    case 'clef': return buildClefRequest(input, env);
  }
}
