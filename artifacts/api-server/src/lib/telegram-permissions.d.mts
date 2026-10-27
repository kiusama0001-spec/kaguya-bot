export declare const SEND_PERMISSION_KEYS: readonly string[];
export declare function mutedPermissions(previous?: Record<string, boolean>): Record<string, boolean>;
export declare function permissionsForRestore(args: {
  previousStatus: string | null | undefined;
  snapshot: Record<string, boolean> | null | undefined;
  currentDefaults: Record<string, boolean> | null | undefined;
  previousUntilDate?: number | null;
  nowSeconds?: number;
}): Record<string, boolean> | null;
