export interface ResourceTypeDto {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
}

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
