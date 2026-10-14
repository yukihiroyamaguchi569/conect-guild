import { describe, expect, it } from 'vitest';
import { SUPPORTED_DEPARTMENT_COUNTS } from '@conect-guild/snapshot/settings';
import { LAYOUT4 } from './layout4';
import { LAYOUTS, layoutFor, SELECTED_LAYOUT } from './index';

describe('layoutFor', () => {
  it('has a layout for every supported number of departments, and only those', () => {
    expect(Object.keys(LAYOUTS).map(Number)).toEqual([...SUPPORTED_DEPARTMENT_COUNTS]);
    for (const count of SUPPORTED_DEPARTMENT_COUNTS) {
      expect(layoutFor(count).departmentCount).toBe(count);
    }
  });

  it.each([0, 1, 5, 7, 4.5, Number.NaN])('throws for %d departments', (count) => {
    expect(() => layoutFor(count)).toThrow(/no office layout/);
  });

  it('selects the four-department office for the settings in use', () => {
    expect(SELECTED_LAYOUT).toBe(LAYOUT4);
  });
});
