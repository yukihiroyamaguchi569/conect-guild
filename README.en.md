# conect-guild

[日本語](README.md)

An app for watching a small company run entirely by AI, drawn as a retro RPG guild hall.

At [conect-management](https://github.com/yukihiroyamaguchi569/conect-management), a commander AI, Kaname (かなめ), breaks the president's requests down into GitHub Issues, hands them to one Claude Code session per department (accounting, PR, planning, general affairs), and receives the results as pull requests. conect-guild shows all of this as a quest board, a party, and a king on his throne. The on-screen text is in Japanese.

![The demo mode (made-up data)](assets/screenshots/demo-overview.png)

The demo mode with made-up data.

| Company | Game |
|---|---|
| GitHub Issue (with a department label) | A quest scroll |
| Department session | A party member |
| Commander, Kaname (かなめ) | The guild receptionist |
| President, Yukihiro (ゆきひろ) | The king on the throne. A PR awaiting his approval shows as a 「承認まち」 (awaiting approval) bubble |
| Pull request | A treasure chest. Once merged, it counts toward 「最近の成果」 (recent results) |

## Features

- **The guild hall on a Canvas**: Kaname at the reception desk, the department members (two to six) at their desks and the king on his throne, all moving a little even when nothing is happening
- **Scrolls, chests and clears**: when an Issue opens, Kaname carries the scroll to the member's desk (and sometimes just tosses it to a nearby one). When a PR is merged, the member brings a treasure chest to the reception desk. When an Issue is closed, 「クリアした！」 (quest cleared!) appears with confetti
- **Party status**: working, awaiting review, awaiting approval and so on, taken from GitHub Issues and PRs. If you use MulmoTerminal, live 「いま作業中」 (working now) and 「許可待ち」 (waiting for permission) are added within a few seconds
- **Sound effects**: chiptune-style beeps generated with Web Audio. Muted by default, with three volume levels
- **Day and night**: the room's lighting follows your local time, and at night only the lamps glow
- **Idle time**: idle members doze off and fall asleep, or wander off for tea, to a window, to chat with a neighbour, or to play with the toy poodle by the throne
- **Narration**: when nothing is happening, the message window describes what the guild is up to, changing every 20 seconds
- **The king's summons**: when the president gives a session an instruction, the king calls out to that member, who answers 「はっ！」 ("Yes, sire!")
- **XP and levels**: counted from every cleared Issue and merged PR in the repository's history. On a level-up, the member jumps at their desk under a "LEVEL UP" sign
- **Lines**: members say a short line when a scroll is handed over, a chest is delivered, or a quest is cleared
- **Demo mode**: plays a loop of scripted, fictional quests

You can have two to six departments (one commander, two to six departments and the president). What your team needs to use it is listed under 「使える条件」 (requirements) in [docs/setup.md](docs/setup.md#0-使える条件) (Japanese).

## Try the demo

With Node.js 26.10 or later:

```bash
npm ci --ignore-scripts
npm run dev
```

Just open http://127.0.0.1:5173 and a demo with made-up quests plays by itself (while the collector has not collected anything; press 「♪ 音を出す」 for sound). No collector or GitHub access is needed.

To watch or film it with sound from the start, open http://127.0.0.1:5173/?demo=1 (for a daytime room, `?demo=1&hour=12`) and press 「▶ はじめる」 (Start). The button is disabled in a narrow window, so widen it if needed.

## Learn more

- Design: [docs/DESIGN.md](docs/DESIGN.md) (Japanese)
- Using it with your own team (settings, collecting, data handling): [docs/setup.md](docs/setup.md) (Japanese)
- Having Claude Code write your settings file: run `/guild-setup` in the conect-guild root ([docs/setup.md 2-2](docs/setup.md#2-2-設定ファイルを作って書き換える), Japanese)
- How the commander and department AIs work through GitHub, with CLAUDE.md templates: [docs/orchestration.md](docs/orchestration.md) (Japanese)
- Changelog: [docs/changes/](docs/changes/) (Japanese)

## License

MIT
