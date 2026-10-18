import type { SessionDepartment } from '@conect-guild/snapshot';

/**
 * Where a watched session is started: the directory MulmoTerminal records for its grid cell. A
 * company seat (かなめ when `department` is null) or a guest named in the settings (Issue #108),
 * by its position in `guests`.
 */
export type Seat =
  | {
      readonly kind: 'company';
      readonly department: SessionDepartment | null;
      readonly cwd: string;
    }
  | { readonly kind: 'guest'; readonly index: number; readonly cwd: string };
