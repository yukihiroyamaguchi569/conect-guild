/**
 * conect-guild's own repository (not the team's repository in guild.settings.ts). Only linked to:
 * the page opens it when the viewer clicks, and never loads anything from it (docs/DESIGN.md 4.3).
 */
const PROJECT_REPO_URL = 'https://github.com/yukihiroyamaguchi569/conect-guild';

/** docs/setup.md on GitHub: the dev server does not serve docs/. */
export const SETUP_GUIDE_URL = `${PROJECT_REPO_URL}/blob/main/docs/setup.md`;

/** The part of docs/setup.md on the missing department labels (Issue #85). */
export const MISSING_LABELS_GUIDE_URL = `${SETUP_GUIDE_URL}#画面の帯に部門のラベルがリポジトリにありませんと出る`;
