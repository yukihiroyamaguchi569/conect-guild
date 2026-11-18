import { describe, expect, it } from 'vitest';
import { claudeConfigPath, folderTrust } from './claudeTrust.ts';

const FOLDER = '/home/tester/guild-trial/guild-trial';

const config = (projects: unknown): string => JSON.stringify({ numStartups: 3, projects });

describe('folderTrust', () => {
  it('is trusted when the folder itself has accepted the dialog', () => {
    const text = config({ [FOLDER]: { hasTrustDialogAccepted: true, allowedTools: [] } });
    expect(folderTrust(text, FOLDER)).toBe('trusted');
  });

  it('is trusted when a parent has accepted it', () => {
    const text = config({
      [FOLDER]: { hasTrustDialogAccepted: false },
      '/home/tester': { hasTrustDialogAccepted: true },
    });
    expect(folderTrust(text, FOLDER)).toBe('trusted');
    expect(folderTrust(config({ '/': { hasTrustDialogAccepted: true } }), FOLDER)).toBe('trusted');
  });

  it('is untrusted when it says false, or nothing', () => {
    expect(folderTrust(config({ [FOLDER]: { hasTrustDialogAccepted: false } }), FOLDER)).toBe(
      'untrusted',
    );
    expect(folderTrust(config({ [FOLDER]: {} }), FOLDER)).toBe('untrusted');
    expect(folderTrust(config({ [FOLDER]: { hasTrustDialogAccepted: 'yes' } }), FOLDER)).toBe(
      'untrusted',
    );
  });

  it('is untrusted when neither the folder nor a parent is in projects', () => {
    const text = config({
      '/home/tester/other': { hasTrustDialogAccepted: true },
      [`${FOLDER}/accounting`]: { hasTrustDialogAccepted: true },
      '/home/test': { hasTrustDialogAccepted: true },
    });
    expect(folderTrust(text, FOLDER)).toBe('untrusted');
    expect(folderTrust(config({}), FOLDER)).toBe('untrusted');
  });

  it('does not take keys inherited from Object.prototype as folders', () => {
    expect(folderTrust(config({}), '/constructor')).toBe('untrusted');
  });

  it('is unknown when the file is missing or not JSON', () => {
    expect(folderTrust(null, FOLDER)).toBe('unknown');
    expect(folderTrust('{ not json', FOLDER)).toBe('unknown');
    expect(folderTrust('', FOLDER)).toBe('unknown');
  });

  it('is unknown when the shape is not the expected one', () => {
    expect(folderTrust(JSON.stringify({ numStartups: 3 }), FOLDER)).toBe('unknown');
    expect(folderTrust(config([{ hasTrustDialogAccepted: true }]), FOLDER)).toBe('unknown');
    expect(folderTrust(config('x'), FOLDER)).toBe('unknown');
    expect(folderTrust(config(null), FOLDER)).toBe('unknown');
    expect(folderTrust('[]', FOLDER)).toBe('unknown');
    expect(folderTrust('null', FOLDER)).toBe('unknown');
  });
});

describe('claudeConfigPath', () => {
  it('is ~/.claude.json unless CLAUDE_CONFIG_DIR is set', () => {
    expect(claudeConfigPath(undefined, '/home/tester')).toBe('/home/tester/.claude.json');
    expect(claudeConfigPath('', '/home/tester')).toBe('/home/tester/.claude.json');
    expect(claudeConfigPath('/cfg/claude', '/home/tester')).toBe('/cfg/claude/.claude.json');
  });
});
