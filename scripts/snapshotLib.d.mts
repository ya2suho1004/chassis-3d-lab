export const SNAPSHOT_RULE_VERSION: string
export function canonical(v: unknown): string
export function idOf(snapshotWithoutId: unknown): string
export interface LedgerEntry { snapshot: any; allowedStepIds: string[] | null; stepPrerequisites: Record<string, string[]> | null; status: 'active' | 'retired'; firstGeneratedOn: string; retiredOn: string | null }
export interface Ledger { ruleVersion: string; entries: LedgerEntry[] }
export function mergeLedger(ledger: Ledger, current: Array<{ snapshot: any; allowedStepIds: string[] | null; stepPrerequisites: Record<string, string[]> | null }>, today: string, reservedIds?: string[]): Ledger
