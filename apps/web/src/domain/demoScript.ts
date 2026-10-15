/**
 * The script of the demo mode (Issue #49): what happens when in one loop, as a list of beats.
 * Everything here is fictional; no title or name comes from real data. To show something new in
 * the demo (the king's call of #28, levels of #19), add a beat (and its action in domain/demo.ts).
 */

/** One loop of the demo; it then starts over with new quest numbers. */
export const DEMO_LOOP_MS = 60_000;

/** A fictional repository: the demo never reads or names the real one. */
export const DEMO_REPO = 'demo-guild/demo-company';

/**
 * Who a beat is about. commander is かなめ (an Issue on this lane has no department and waits at
 * the reception). Each loop gives the other four lanes to departments: two of them carry a quest
 * from opening to clearing (quest1, and quest2, which needs the president), and up to two others
 * help. Half the departments carry a quest each loop (domain/demo.ts laneDepartments): with four,
 * the pairs swap every loop, so all four carry one every two loops. With two departments the
 * helper lanes are left out, with three one of them.
 */
export const DEMO_LANES = ['commander', 'quest1', 'quest2', 'helper1', 'helper2'] as const;
export type DemoLane = (typeof DEMO_LANES)[number];

/**
 * What a beat does to its lane. open-issue: かなめ hands over the scroll. work / ask / rest: the
 * lane's session is working / awaiting permission (「？」) / resting. open-pr: a PR waits for
 * かなめ's review. open-rule-pr: a PR that changes rules waits for the president (承認まち).
 * merge-pr: the chest is delivered to かなめ. close-issue: 「クリアした！」 and confetti.
 */
export type DemoAction =
  'open-issue' | 'work' | 'ask' | 'rest' | 'open-pr' | 'open-rule-pr' | 'merge-pr' | 'close-issue';

export interface DemoBeat {
  /** Ms from the start of the loop. */
  readonly at: number;
  readonly lane: DemoLane;
  readonly action: DemoAction;
}

/**
 * One loop, in time order. The gaps follow the scenes the beats start (render/scenes.ts): handing
 * over a scroll keeps かなめ about 8.5 s, delivering a chest about 12.5 s, and a message stays at
 * least 8 s (app/guildStore.ts), so each event reaches the window about when かなめ is free.
 * A session that starts working from idle or resting is the president's order: the king calls
 * that member, who answers 「はっ！」 (Issue #28, about 3.7 s). A department that starts within 60 s
 * of かなめ's work is her handing it on: she says 「おねがい！」, it answers 「はい！」 (Issue #155, 3 s).
 */
export const DEMO_SCRIPT: readonly DemoBeat[] = [
  // The king's order to かなめ, who then hands out the scrolls.
  { at: 500, lane: 'commander', action: 'work' },
  { at: 3_500, lane: 'commander', action: 'rest' },
  { at: 4_500, lane: 'quest1', action: 'open-issue' },
  { at: 13_500, lane: 'quest2', action: 'open-issue' },
  // quest1 works (かなめ hands it on), asks for a permission (「？」), then sends a PR.
  { at: 16_500, lane: 'quest1', action: 'work' },
  { at: 19_000, lane: 'quest1', action: 'ask' },
  { at: 22_000, lane: 'quest1', action: 'work' },
  { at: 23_000, lane: 'quest1', action: 'open-pr' },
  { at: 23_000, lane: 'quest1', action: 'rest' },
  { at: 25_500, lane: 'quest2', action: 'work' },
  { at: 27_000, lane: 'quest1', action: 'merge-pr' },
  // quest2's PR changes rules: it waits for the president (承認まち) until he merges it.
  { at: 31_000, lane: 'quest2', action: 'open-rule-pr' },
  { at: 31_000, lane: 'quest2', action: 'rest' },
  { at: 33_000, lane: 'helper1', action: 'work' },
  { at: 40_000, lane: 'quest1', action: 'close-issue' },
  { at: 46_000, lane: 'helper1', action: 'rest' },
  { at: 49_000, lane: 'quest2', action: 'merge-pr' },
  { at: 57_500, lane: 'quest2', action: 'close-issue' },
];

/**
 * The king's quest of the demo (Issue #152): one every `everyLoops` loops from `firstLoop`, so the
 * messages (at least 8 s each, in turn: app/guildStore.ts) keep up with the script about as well as
 * without it (app/demo.lag.test.ts measures it; docs/changes/0152-demo-king.md has the figures).
 * Opened at `openAt`, while かなめ is free between the first chest and the second (she walks it to
 * the throne in about 7.5 s); cleared in the next loop at `clearAt`, while she is free between
 * handing out the second scroll and taking the first chest (the two lines take about 4 s). The
 * first loops are left to the level-ups (domain/demo.ts PAST_WORK).
 */
export const DEMO_KING_QUEST = {
  everyLoops: 5,
  firstLoop: 2,
  openAt: 40_500,
  clearAt: 22_500,
} as const;

/** Fictional quests of the king, in turn. Plain everyday work, as the departments'. */
export const DEMO_KING_TITLES: readonly [string, ...string[]] = [
  '来年の方針を決める',
  '年始のあいさつ文を書く',
  '社内の勉強会で話す',
];

/** A quest of the demo: the Issue's title and the title of the PR that finishes it. */
export interface DemoQuestTitles {
  readonly issue: string;
  readonly pr: string;
}

/** Fictional quests of かなめ's reception (an Issue with no department). */
export const DEMO_RECEPTION_TITLES: readonly DemoQuestTitles[] = [
  { issue: '受付の手順を見直す', pr: '受付の手順書' },
];

/**
 * Fictional quests per department, in the order of guild.settings.json (経理, 広報, 企画, 総務,
 * then two more for the larger offices). Plain everyday work: no client, product or real project
 * names.
 */
export const DEMO_TITLES: readonly (readonly DemoQuestTitles[])[] = [
  [
    { issue: '10 月分の請求書を作る', pr: '請求書の下書き' },
    { issue: '経費の領収書を整理する', pr: '領収書の一覧' },
    { issue: '冬の賞与の試算をする', pr: '賞与の試算表' },
  ],
  [
    { issue: '秋の講座の告知文を書く', pr: '告知文の原稿' },
    { issue: 'お知らせのメールを送る', pr: 'メールの文面' },
    { issue: '新しいチラシを作る', pr: 'チラシの原稿' },
  ],
  [
    { issue: '新サービスの市場を調べる', pr: '市場調査のまとめ' },
    { issue: '冬のイベント案を練る', pr: 'イベント案のまとめ' },
    { issue: '勉強会の企画書を書く', pr: '企画書の下書き' },
  ],
  [
    { issue: '備品の棚卸しをする', pr: '棚卸しの結果' },
    { issue: '会議室の予約表を作る', pr: '予約表のひな形' },
    { issue: '防災用品を点検する', pr: '点検の記録' },
  ],
  [
    { issue: '新しい手順書を読み合わせる', pr: '読み合わせのメモ' },
    { issue: '問い合わせの返事を書く', pr: '返事の下書き' },
    { issue: '来月の予定表を作る', pr: '予定表のひな形' },
  ],
  [
    { issue: '名刺の在庫を数える', pr: '在庫の一覧' },
    { issue: '掲示物を貼り替える', pr: '掲示物の案' },
    { issue: '年末の挨拶状を準備する', pr: '挨拶状の文面' },
  ],
];
