# conect-guild

[日本語](README.md)

An app for watching a small company run entirely by AI, drawn as a retro RPG guild hall.

At the author's company, a commander AI, Kaname (かなめ), breaks the president's requests down into GitHub Issues, hands them to one Claude Code session per department (accounting, PR, planning, general affairs), and receives the results as pull requests. conect-guild shows all of this as a quest board, a party, and a king on his throne. The on-screen text is in Japanese.

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

- **The guild hall**: draws the work of the commander, the departments (two to six) and the president, taken from GitHub Issues and PRs, as a retro RPG guild
- **Party status**: working, awaiting review, awaiting approval and so on. If you use MulmoTerminal, live 「いま作業中」 (working now) and 「許可待ち」 (waiting for permission) are shown too
- **Visitors**: up to two sessions outside the company, drawn as guests who visit the hall
- **Show mode**: for showing the screen to others, one button masks the titles of Issues and PRs
- **Demo mode**: try it with fictional quests, no settings needed

How it all moves is for you to find out on the screen.

You can have two to six departments (one commander, two to six departments and the president). What your team needs to use it is listed under 「使える条件」 (requirements) in [docs/setup.md](docs/setup.md#0-使える条件) (Japanese).

## Try the demo

With Node.js 26.10 or later:

```bash
git clone https://github.com/yukihiroyamaguchi569/conect-guild.git
cd conect-guild
npm ci --ignore-scripts
npm run dev
```

Just open http://127.0.0.1:5273 and a demo with made-up quests plays by itself (while the collector has not collected anything; press 「♪ 音を出す」 for sound). No collector or GitHub access is needed.

To watch or film it with sound from the start, open http://127.0.0.1:5273/?demo=1 (for a daytime room, `?demo=1&hour=12`) and press 「▶ はじめる」 (Start). The button is disabled in a narrow window, so widen it if needed.

## Learn more

- Design: [docs/DESIGN.md](docs/DESIGN.md) (Japanese)
- Using it with your own team (settings, collecting, data handling): [docs/setup.md](docs/setup.md) (Japanese)
- Having Claude Code write your settings file: run `/guild-setup` in the conect-guild root ([docs/setup.md 2-2](docs/setup.md#2-2-設定ファイルを作って書き換える), Japanese)
- Trying a made-up company: run `/guild-trial` in the conect-guild root (it creates a private repository on GitHub; [docs/setup.md](docs/setup.md), Japanese). Clean up with `/guild-trial-cleanup`
- How the commander and department AIs work through GitHub, with CLAUDE.md templates: [docs/orchestration.md](docs/orchestration.md) (Japanese)
- Changelog: [docs/changes/](docs/changes/) (Japanese)

## License

MIT
