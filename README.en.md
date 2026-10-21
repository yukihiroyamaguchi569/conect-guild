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
- **Visitors**: up to two sessions outside the company, drawn as guests who visit the hall

How it all moves is for you to find out on the screen.

## Ways to try it

There are three ways to try it. Each one takes a little more setup and gets closer to your own work.

1. [Watch the demo](#1-watch-the-demo): just run the screen locally. No GitHub, no settings
2. [Try a made-up company](#2-try-a-made-up-company): Claude Code creates a made-up company and Issues, so you can try the real flow
3. [Try it with your own team](#3-try-it-with-your-own-team): watch the Issues and PRs of your own repository

### 1. Watch the demo

With Node.js 26.10 or later:

```bash
git clone https://github.com/yukihiroyamaguchi569/conect-guild.git
cd conect-guild
npm ci --ignore-scripts
npm run dev
```

Just open http://127.0.0.1:5273 and a demo with made-up quests plays by itself (while the collector has not collected anything; press 「♪ 音を出す」 for sound). No collector or GitHub access is needed.

### 2. Try a made-up company

After the demo, start Claude Code in the conect-guild root and run `/guild-trial`. It creates a made-up company (a private repository on GitHub, department folders and local settings) so you can try the screen with made-up Issues. Clean up with `/guild-trial-cleanup`. To keep it as your own company, graduate it with `/guild-trial-graduate` (it renames it and removes the trial marks). See [docs/trial.md](docs/trial.md) (Japanese).

### 3. Try it with your own team

You can have two to six departments (one commander, two to six departments and the president). Where you start depends on whether you already run an AI company (commander and department sessions working through GitHub Issues and PRs).

- **You already run one**: follow [docs/setup.md](docs/setup.md) (Japanese) and run `/guild-setup` in the conect-guild root to write your settings
- **You don't yet**: create a trial company as in "2. Try a made-up company" above, and when you like it, graduate it into your own company with `/guild-trial-graduate` ([docs/trial.md](docs/trial.md), Japanese). To build one from scratch, see [chapter 3 of docs/orchestration.md](docs/orchestration.md#3-始め方) (Japanese)

## Learn more

- Design: [docs/DESIGN.md](docs/DESIGN.md) (Japanese)
- Changelog: [docs/changes/](docs/changes/) (Japanese)

## License

MIT
