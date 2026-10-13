export const CRITERIA_VERSION = '2026-10-demo-v1';
export const actions = ['要対応', '把握のみ', '対応不要', '判断保留'] as const;
export const reasons = ['担当案件', '業務の依存関係', '関係者との連携', '直接の依頼', '全体周知', '関連が薄い', '情報不足'] as const;
export type Action = typeof actions[number];
export type Reason = typeof reasons[number];
export type Profile = { id: string; name: string; userId: string; role: string; projects: string[]; people: { name: string; userId: string; role: string; project: string }[]; themes: string[] };
const people = [
  { name: '森 悠斗', userId: 'u-mori', role: 'API担当', project: '取引先ポータル' },
  { name: '小林 凛', userId: 'u-kobayashi', role: '営業企画', project: '取引先ポータル' },
  { name: '井上 葵', userId: 'u-inoue', role: 'サポートリーダー', project: 'ヘルプセンター' },
];
export const profiles: Profile[] = [
  { id: 'frontend', name: '佐藤 真央', userId: 'u-sato', role: 'フロントエンド担当：取引先画面・CSV取り込み画面の実装', projects: ['取引先ポータル'], people, themes: ['API仕様', '入力検証', 'アクセシビリティ'] },
  { id: 'pm', name: '高橋 陽', userId: 'u-takahashi', role: 'PM：取引先ポータルのスケジュール・仕様・部門間調整', projects: ['取引先ポータル', '営業ワークフロー'], people, themes: ['リリース計画', 'スコープ', '依存関係'] },
  { id: 'support', name: '田中 結衣', userId: 'u-tanaka', role: 'カスタマーサポート担当：問い合わせ対応・ヘルプ記事の更新', projects: ['ヘルプセンター', '取引先ポータル'], people, themes: ['問い合わせ', 'FAQ', '障害案内'] },
];
export type Thread = { id: string; channel: string; updatedAt: string; title: string; posts: { author: string; userId: string; at: string; text: string; mentions: string[] }[]; caseIndex: number };
const cases = [
  { channel: 'portal-api', title: '取引先APIの返却項目を変更', text: '取引先一覧APIの company_name を display_name に変更します。画面側の表示処理をリリース前に更新してください。', author: '森 悠斗', uid: 'u-mori', reply: '切り替え日は今週金曜です。対応状況をこのスレッドで確認します。' },
  { channel: 'general', title: '担当外：倉庫移転のお知らせ', text: '@佐藤真央 配送チームの倉庫が移転します。対象は物流管理案件のみで、取引先ポータルの変更はありません。', author: '小林 凛', uid: 'u-kobayashi', reply: '全員向けの周知です。開発・サポートでの対応は不要です。' },
  { channel: 'random', title: '関係者の雑談：週末の散歩', text: '週末に公園を歩きました。おすすめの散歩道を教えてください。', author: '森 悠斗', uid: 'u-mori', reply: '川沿いも気持ちがよかったです。' },
  { channel: 'portal-ui', title: '解決済み：CSV入力のエラー表示', text: 'CSVのメール未入力時にエラーが出ないため、@佐藤真央 修正をお願いします。', author: '小林 凛', uid: 'u-kobayashi', reply: '修正を確認しました。この依頼は解決済みです。追加対応は不要です。' },
  { channel: 'release', title: '部門別に確認：ポータルのリリース日', text: 'ポータルの公開を木曜から金曜へ変更する案です。PMは関係部門の合意をまとめてください。開発は変更を把握し、サポートは案内日を確認してください。', author: '小林 凛', uid: 'u-kobayashi', reply: '案内原稿の確認がまだ残っています。' },
  { channel: 'support', title: '問い合わせ：取り込み手順の説明', text: '@田中結衣 CSVの取り込み手順について問い合わせが増えています。FAQの手順を更新し、回答テンプレートを用意してください。', author: '井上 葵', uid: 'u-inoue', reply: '実装不具合ではなく、説明が不足している状況です。' },
  { channel: 'portal-ui', title: 'キーボード操作の確認依頼', text: '@佐藤真央 確認ダイアログでフォーカスを戻す処理を確認してください。PMとサポートへの依頼はありません。', author: '森 悠斗', uid: 'u-mori', reply: '検証項目を追加しました。確認結果をお願いします。' },
  { channel: 'sales', title: '営業ワークフローの範囲調整', text: '@高橋陽 次期の承認フローを今回のリリースに含めるか判断してください。フロントエンドとFAQへの変更は次期を想定しています。', author: '小林 凛', uid: 'u-kobayashi', reply: '営業部門の要望一覧をまとめました。優先度を決めたいです。' },
  { channel: 'general', title: '全体周知：社内研修', text: '全社員向けの研修資料を公開しました。各自、内容を把握してください。個別案件の対応依頼ではありません。', author: '井上 葵', uid: 'u-inoue', reply: '録画も社内に公開済みです。' },
  { channel: 'portal-questions', title: '情報不足：表示の相談', text: 'ある画面が変わったように見えます。担当者に確認したいです。対象画面、環境、発生時刻はまだ分かりません。', author: '小林 凛', uid: 'u-kobayashi', reply: '具体的な情報が集まり次第、追記します。' },
];
export const threads: Thread[] = Array.from({ length: 50 }, (_, i) => {
  const c = cases[i % cases.length];
  const day = String(1 + Math.floor(i / 10)).padStart(2, '0');
  const hour = String(9 + i % 10).padStart(2, '0');
  const start = `2026-10-${day}T${hour}:00:00+09:00`;
  const updatedAt = `2026-10-${day}T${hour}:30:00+09:00`;
  return { id: `thread-${String(i + 1).padStart(2, '0')}`, channel: `#${c.channel}`, title: `${c.title}（第${1 + Math.floor(i / 10)}回）`, updatedAt, caseIndex: i % 10,
    posts: [{ author: c.author, userId: c.uid, at: start, text: c.text, mentions: i % 10 === 1 || i % 10 === 3 || i % 10 === 6 ? ['u-sato'] : i % 10 === 5 ? ['u-tanaka'] : i % 10 === 7 ? ['u-takahashi'] : [] },
      { author: c.author, userId: c.uid, at: updatedAt, text: c.reply, mentions: [] }] };
});
export const relevanceModels = [
  { key: 'jev', label: 'Jev', id: 'typesafe/jev-1.13.0' },
  { key: 'decisions', label: 'Decisions API', id: 'openai/gpt-6-luna' },
] as const;
export const videoModels = [
  { key: 'd1', label: 'Hosted d1', id: 'liquid/d1' },
  { key: 'clef', label: 'Clef Flash', id: 'cloudflare/@cf/cloudflare/clef-flash' },
] as const;
export type RelevanceModel = typeof relevanceModels[number]['key'];
export type VideoModel = typeof videoModels[number]['key'];
export type Relevance = { relevance: number; action: Action; reason: Reason };
// Explicit fixture rows by case, independent of edited/free input. Scores are illustrative.
const fixtureRows: Record<string, [number, Action, Reason][]> = {
  frontend: [[96,'要対応','業務の依存関係'],[12,'対応不要','関連が薄い'],[3,'対応不要','関連が薄い'],[95,'対応不要','担当案件'],[76,'把握のみ','担当案件'],[42,'把握のみ','関係者との連携'],[98,'要対応','直接の依頼'],[25,'把握のみ','関連が薄い'],[45,'把握のみ','全体周知'],[50,'判断保留','情報不足']],
  pm: [[83,'把握のみ','業務の依存関係'],[15,'対応不要','関連が薄い'],[4,'対応不要','関連が薄い'],[80,'対応不要','担当案件'],[98,'要対応','直接の依頼'],[60,'把握のみ','関係者との連携'],[70,'把握のみ','担当案件'],[96,'要対応','担当案件'],[45,'把握のみ','全体周知'],[50,'判断保留','情報不足']],
  support: [[65,'把握のみ','業務の依存関係'],[10,'対応不要','関連が薄い'],[2,'対応不要','関連が薄い'],[78,'対応不要','担当案件'],[89,'要対応','業務の依存関係'],[99,'要対応','直接の依頼'],[35,'把握のみ','関連が薄い'],[30,'把握のみ','関連が薄い'],[45,'把握のみ','全体周知'],[50,'判断保留','情報不足']],
};
export function mockRelevance(profileId: string, model: RelevanceModel, caseIndex: number): Relevance {
  const row = fixtureRows[profileId]?.[caseIndex];
  if (!row) throw new Error('同梱サンプルが見つかりません');
  const [score, action, reason] = row;
  return { relevance: Math.max(0, Math.min(100, score + (model === 'decisions' ? [3,-2,0,-1,2,-3,0,1,0,0][caseIndex] : 0))), action, reason };
}
export const tags = ['エラー表示', '確認ダイアログ', '完了表示'] as const;
export type Tag = typeof tags[number];
export const choices = ['あり', 'なし', '判定不能'] as const;
export type Choice = typeof choices[number];
export type VideoJudgment = Record<Tag, Choice>;
export const SAMPLE_VIDEO_ID = 'csv-import-v1';
export function mockFrame(model: VideoModel, time: number): VideoJudgment {
  const stage = Math.floor(time / 4);
  return {
    エラー表示: stage === 1 || stage === 4 ? 'あり' : 'なし',
    確認ダイアログ: stage === 3 || stage === 4 ? 'あり' : 'なし',
    完了表示: stage === 5 ? (model === 'clef' && time === 20 ? '判定不能' : 'あり') : 'なし',
  };
}
