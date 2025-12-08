/**
 * Data Store
 * Zustand store for managing application state
 */

import { create } from 'zustand';
import type { IDataFrame, ISelection, IFilterState, ISortSpec, IColumnDef } from '../../../core/types';

/**
 * Store state interface
 */
interface IDataStoreState {
  // Data
  data: IDataFrame | null;
  filteredData: IDataFrame | null;

  // View state
  theme: 'light' | 'dark';
  selection: ISelection;
  filter: IFilterState;
  sort: ISortSpec[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  hiddenColumns: Set<string>;

  // Actions
  setData: (data: IDataFrame) => void;
  setFilteredData: (data: IDataFrame | null) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setSelection: (selection: ISelection) => void;
  setFilter: (filter: IFilterState) => void;
  setSort: (sort: ISortSpec[]) => void;
  setColumnOrder: (order: string[]) => void;
  setColumnWidth: (column: string, width: number) => void;
  toggleColumnVisibility: (column: string) => void;
  resetView: () => void;
}

/**
 * Default filter state
 */
const defaultFilter: IFilterState = {
  enabled: false,
  globalSearch: '',
  groups: [],
};

/**
 * Default selection state
 */
const defaultSelection: ISelection = {
  type: 'none',
};

/**
 * Create the data store
 */
export const useDataStore = create<IDataStoreState>((set, get) => ({
  // Initial state
  data: null,
  filteredData: null,
  theme: 'dark',
  selection: defaultSelection,
  filter: defaultFilter,
  sort: [],
  columnOrder: [],
  columnWidths: {},
  hiddenColumns: new Set(),

  // Actions
  setData: (data) => {
    set({
      data,
      filteredData: null,
      columnOrder: data.columns.map((c) => c.name),
    });
  },

  setFilteredData: (filteredData) => {
    set({ filteredData });
  },

  setTheme: (theme) => {
    set({ theme });
    // Update document theme class
    document.documentElement.setAttribute('data-theme', theme);
  },

  setSelection: (selection) => {
    set({ selection });
  },

  setFilter: (filter) => {
    set({ filter });
  },

  setSort: (sort) => {
    set({ sort });
  },

  setColumnOrder: (columnOrder) => {
    set({ columnOrder });
  },

  setColumnWidth: (column, width) => {
    const { columnWidths } = get();
    set({
      columnWidths: { ...columnWidths, [column]: width },
    });
  },

  toggleColumnVisibility: (column) => {
    const { hiddenColumns } = get();
    const newHidden = new Set(hiddenColumns);
    if (newHidden.has(column)) {
      newHidden.delete(column);
    } else {
      newHidden.add(column);
    }
    set({ hiddenColumns: newHidden });
  },

  resetView: () => {
    const { data } = get();
    set({
      filteredData: null,
      selection: defaultSelection,
      filter: defaultFilter,
      sort: [],
      columnOrder: data?.columns.map((c) => c.name) ?? [],
      columnWidths: {},
      hiddenColumns: new Set(),
    });
  },
}));

/**
 * Selector for visible columns
 */
export const selectVisibleColumns = (state: IDataStoreState): IColumnDef[] => {
  const { data, columnOrder, hiddenColumns } = state;
  if (!data) return [];

  return columnOrder
    .filter((name) => !hiddenColumns.has(name))
    .map((name) => data.columns.find((c) => c.name === name)!)
    .filter(Boolean);
};

/**
 * Selector for display data (filtered or original)
 */
export const selectDisplayData = (state: IDataStoreState): IDataFrame | null => {
  return state.filteredData ?? state.data;
};

