/**
 * Core type definitions for R Data Explorer
 * All shared types used across modules should be defined here
 */

// ============================================
// Data Types
// ============================================

/**
 * R data types mapped to TypeScript
 */
export type RDataType =
  | 'numeric'
  | 'integer'
  | 'character'
  | 'factor'
  | 'logical'
  | 'Date'
  | 'POSIXct'
  | 'POSIXlt'
  | 'complex'
  | 'raw'
  | 'list'
  | 'unknown';

/**
 * Column definition for a data frame
 */
export interface IColumnDef {
  /** Column name */
  name: string;
  /** R data type */
  type: RDataType;
  /** Variable label (like SAS labels) */
  label?: string;
  /** Factor levels if type is 'factor' */
  levels?: string[];
  /** Column index in original data frame */
  index: number;
  /** Whether column contains NA values */
  hasNA: boolean;
}

/**
 * Cell value can be various types
 */
export type CellValue = string | number | boolean | null;

/**
 * A single row of data
 */
export type DataRow = CellValue[];

/**
 * Complete data frame structure
 */
export interface IDataFrame {
  /** Data frame name in R environment */
  name: string;
  /** Column definitions */
  columns: IColumnDef[];
  /** Row data (2D array for performance) */
  rows: DataRow[];
  /** Total number of rows in the original data frame */
  totalRows: number;
  /** Total number of columns */
  totalColumns: number;
  /** Whether more data can be loaded */
  hasMore: boolean;
  /** Timestamp when data was fetched */
  fetchedAt: number;
}

/**
 * Metadata about a data frame (without actual data)
 */
export interface IDataFrameMetadata {
  name: string;
  rows: number;
  columns: number;
  size: string; // Human readable size
  columnNames: string[];
}

// ============================================
// Selection Types
// ============================================

/**
 * Cell position
 */
export interface ICellPosition {
  rowIndex: number;
  columnIndex: number;
}

/**
 * Selection range
 */
export interface ISelectionRange {
  start: ICellPosition;
  end: ICellPosition;
}

/**
 * Current selection state
 */
export interface ISelection {
  type: 'cell' | 'row' | 'column' | 'range' | 'none';
  cells?: ICellPosition[];
  rows?: number[];
  columns?: number[];
  range?: ISelectionRange;
}

// ============================================
// Filter Types
// ============================================

/**
 * Filter operator types
 */
export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'between'
  | 'isNA'
  | 'isNotNA'
  | 'inList';

/**
 * Single filter condition
 */
export interface IFilterCondition {
  id: string;
  columnName: string;
  operator: FilterOperator;
  value?: CellValue;
  value2?: CellValue; // For 'between' operator
  values?: CellValue[]; // For 'inList' operator
}

/**
 * Filter group with AND/OR logic
 */
export interface IFilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  conditions: (IFilterCondition | IFilterGroup)[];
}

/**
 * Complete filter state
 */
export interface IFilterState {
  enabled: boolean;
  globalSearch: string;
  groups: IFilterGroup[];
}

// ============================================
// Sort Types
// ============================================

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Single sort specification
 */
export interface ISortSpec {
  columnName: string;
  direction: SortDirection;
}

// ============================================
// Module System Types
// ============================================

/**
 * Toolbar item contributed by a module
 */
export interface IToolbarItem {
  id: string;
  moduleId: string;
  icon: string;
  tooltip: string;
  onClick: () => void;
  order?: number;
}

/**
 * Context menu item contributed by a module
 */
export interface IContextMenuItem {
  id: string;
  moduleId: string;
  label: string;
  icon?: string;
  onClick: (context: IMenuContext) => void;
  when?: (context: IMenuContext) => boolean;
  order?: number;
}

/**
 * Context passed to menu item handlers
 */
export interface IMenuContext {
  selection: ISelection;
  data: IDataFrame | null;
  cellValue?: CellValue;
  columnDef?: IColumnDef;
}

/**
 * Module interface - all feature modules must implement this
 */
export interface IModule {
  /** Unique module identifier */
  id: string;
  /** Display name */
  name: string;
  /** Module version */
  version: string;
  /** Whether module is enabled */
  enabled: boolean;
  /** Module dependencies */
  dependencies?: string[];

  // Lifecycle hooks
  /** Called when module is activated */
  activate(): Promise<void>;
  /** Called when module is deactivated */
  deactivate(): Promise<void>;

  // UI contributions (optional)
  /** Toolbar items provided by this module */
  getToolbarItems?(): IToolbarItem[];
  /** Context menu items provided by this module */
  getContextMenuItems?(): IContextMenuItem[];

  // Event handlers (optional)
  /** Called when data frame changes */
  onDataChange?(data: IDataFrame): void;
  /** Called when selection changes */
  onSelectionChange?(selection: ISelection): void;
  /** Called when filter changes */
  onFilterChange?(filter: IFilterState): void;
}

// ============================================
// Communication Types (Extension <-> R)
// ============================================

/**
 * Request sent from extension to R
 */
export interface IRRequest {
  id: string;
  command: 'getData' | 'getSchema' | 'listDataFrames' | 'runExpression';
  params: {
    dataFrameName?: string;
    expression?: string;
    offset?: number;
    limit?: number;
    columns?: string[];
    filter?: string; // R filter expression
    sort?: ISortSpec[];
  };
}

/**
 * Response from R to extension
 */
export interface IRResponse {
  id: string;
  success: boolean;
  data?: IDataFrame | IDataFrameMetadata[] | unknown;
  error?: string;
  executionTime?: number;
}

// ============================================
// Event Types
// ============================================

/**
 * Event types for the event bus
 */
export type EventType =
  | 'data:loading'
  | 'data:loaded'
  | 'data:error'
  | 'data:filtered'
  | 'data:sorted'
  | 'columns:reordered'
  | 'columns:visibility'
  | 'selection:changed'
  | 'stats:calculated'
  | 'module:activated'
  | 'module:deactivated'
  | 'theme:changed';

/**
 * Event payload map
 */
export interface IEventPayloads {
  'data:loading': { dataFrameName: string };
  'data:loaded': { data: IDataFrame };
  'data:error': { error: string };
  'data:filtered': { filter: IFilterState; resultCount: number };
  'data:sorted': { sort: ISortSpec[] };
  'columns:reordered': { columns: string[] };
  'columns:visibility': { column: string; visible: boolean };
  'selection:changed': { selection: ISelection };
  'stats:calculated': { columnName: string; stats: IColumnStats };
  'module:activated': { moduleId: string };
  'module:deactivated': { moduleId: string };
  'theme:changed': { theme: 'light' | 'dark' };
}

// ============================================
// Statistics Types
// ============================================

/**
 * Basic statistics for a numeric column
 */
export interface INumericStats {
  count: number;
  missing: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  q1: number;
  q3: number;
}

/**
 * Statistics for a categorical column
 */
export interface ICategoricalStats {
  count: number;
  missing: number;
  unique: number;
  mode: string;
  frequencies: { value: string; count: number; percent: number }[];
}

/**
 * Column statistics (union type)
 */
export type IColumnStats = INumericStats | ICategoricalStats;

// ============================================
// Webview Message Types
// ============================================

/**
 * Messages sent from extension to webview
 */
export interface IExtensionToWebviewMessage {
  type: 'setData' | 'setTheme' | 'setConfig' | 'updateFilter' | 'updateSelection';
  payload: unknown;
}

/**
 * Messages sent from webview to extension
 */
export interface IWebviewToExtensionMessage {
  type:
    | 'ready'
    | 'requestData'
    | 'filter'
    | 'sort'
    | 'selectCells'
    | 'copyToClipboard'
    | 'requestStats'
    | 'columnReorder'
    | 'columnResize';
  payload: unknown;
}

