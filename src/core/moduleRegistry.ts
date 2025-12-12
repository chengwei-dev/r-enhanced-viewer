/**
 * Module Registry
 * Manages registration, activation, and lifecycle of feature modules
 */

import * as vscode from 'vscode';
import { IModule, IToolbarItem, IContextMenuItem } from './types';
import { eventBus } from './eventBus';

/**
 * Module state tracking
 */
interface IModuleState {
  module: IModule;
  status: 'registered' | 'activating' | 'active' | 'deactivating' | 'inactive' | 'error';
  error?: Error;
}

/**
 * ModuleRegistry class for managing feature modules
 */
class ModuleRegistry {
  private modules: Map<string, IModuleState> = new Map();
  private activationOrder: string[] = [];

  /**
   * Register a module with the registry
   * @param module - Module to register
   */
  register(module: IModule): void {
    if (this.modules.has(module.id)) {
      console.warn(`Module ${module.id} is already registered`);
      return;
    }

    this.modules.set(module.id, {
      module,
      status: 'registered',
    });

    console.log(`Module registered: ${module.id} v${module.version}`);
  }

  /**
   * Unregister a module
   * @param moduleId - ID of module to unregister
   */
  async unregister(moduleId: string): Promise<void> {
    const state = this.modules.get(moduleId);
    if (!state) {
      return;
    }

    if (state.status === 'active') {
      await this.deactivate(moduleId);
    }

    this.modules.delete(moduleId);
    console.log(`Module unregistered: ${moduleId}`);
  }

  /**
   * Activate a module
   * @param moduleId - ID of module to activate
   */
  async activate(moduleId: string): Promise<void> {
    const state = this.modules.get(moduleId);
    if (!state) {
      throw new Error(`Module ${moduleId} not found`);
    }

    if (state.status === 'active') {
      return;
    }

    // Check dependencies
    if (state.module.dependencies) {
      for (const depId of state.module.dependencies) {
        const depState = this.modules.get(depId);
        if (!depState || depState.status !== 'active') {
          throw new Error(`Module ${moduleId} requires ${depId} to be active`);
        }
      }
    }

    state.status = 'activating';

    try {
      await state.module.activate();
      state.status = 'active';
      this.activationOrder.push(moduleId);

      eventBus.emit('module:activated', { moduleId });
      console.log(`Module activated: ${moduleId}`);
    } catch (error) {
      state.status = 'error';
      state.error = error as Error;
      throw error;
    }
  }

  /**
   * Deactivate a module
   * @param moduleId - ID of module to deactivate
   */
  async deactivate(moduleId: string): Promise<void> {
    const state = this.modules.get(moduleId);
    if (!state || state.status !== 'active') {
      return;
    }

    // Check if other active modules depend on this one
    for (const [id, s] of this.modules) {
      if (s.status === 'active' && s.module.dependencies?.includes(moduleId)) {
        throw new Error(`Cannot deactivate ${moduleId}: ${id} depends on it`);
      }
    }

    state.status = 'deactivating';

    try {
      await state.module.deactivate();
      state.status = 'inactive';

      // Remove from activation order
      const index = this.activationOrder.indexOf(moduleId);
      if (index > -1) {
        this.activationOrder.splice(index, 1);
      }

      eventBus.emit('module:deactivated', { moduleId });
      console.log(`Module deactivated: ${moduleId}`);
    } catch (error) {
      state.status = 'error';
      state.error = error as Error;
      throw error;
    }
  }

  /**
   * Activate all enabled modules based on configuration
   * @param context - VS Code extension context
   */
  async activateAll(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('reviewer.modules');

    // Sort modules by dependencies (topological sort)
    const sorted = this.topologicalSort();

    for (const moduleId of sorted) {
      const state = this.modules.get(moduleId);
      if (!state) continue;

      // Check if module is enabled in configuration
      const isEnabled = config.get<boolean>(`${moduleId}.enabled`, state.module.enabled);

      if (isEnabled) {
        try {
          await this.activate(moduleId);
        } catch (error) {
          console.error(`Failed to activate module ${moduleId}:`, error);
          vscode.window.showWarningMessage(
            `Failed to activate module ${state.module.name}: ${(error as Error).message}`
          );
        }
      }
    }
  }

  /**
   * Deactivate all modules in reverse activation order
   */
  async deactivateAll(): Promise<void> {
    const reverseOrder = [...this.activationOrder].reverse();

    for (const moduleId of reverseOrder) {
      try {
        await this.deactivate(moduleId);
      } catch (error) {
        console.error(`Failed to deactivate module ${moduleId}:`, error);
      }
    }
  }

  /**
   * Get all toolbar items from active modules
   * @returns Array of toolbar items sorted by order
   */
  getToolbarItems(): IToolbarItem[] {
    const items: IToolbarItem[] = [];

    for (const [_, state] of this.modules) {
      if (state.status === 'active' && state.module.getToolbarItems) {
        items.push(...state.module.getToolbarItems());
      }
    }

    return items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /**
   * Get all context menu items from active modules
   * @returns Array of context menu items sorted by order
   */
  getContextMenuItems(): IContextMenuItem[] {
    const items: IContextMenuItem[] = [];

    for (const [_, state] of this.modules) {
      if (state.status === 'active' && state.module.getContextMenuItems) {
        items.push(...state.module.getContextMenuItems());
      }
    }

    return items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /**
   * Get a specific module
   * @param moduleId - ID of module to get
   * @returns Module instance or undefined
   */
  getModule(moduleId: string): IModule | undefined {
    return this.modules.get(moduleId)?.module;
  }

  /**
   * Get all registered module IDs
   * @returns Array of module IDs
   */
  getModuleIds(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Check if a module is active
   * @param moduleId - ID of module to check
   * @returns True if module is active
   */
  isActive(moduleId: string): boolean {
    return this.modules.get(moduleId)?.status === 'active';
  }

  /**
   * Topological sort of modules based on dependencies
   */
  private topologicalSort(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (id: string) => {
      if (temp.has(id)) {
        throw new Error(`Circular dependency detected involving ${id}`);
      }
      if (visited.has(id)) {
        return;
      }

      temp.add(id);

      const state = this.modules.get(id);
      if (state?.module.dependencies) {
        for (const dep of state.module.dependencies) {
          visit(dep);
        }
      }

      temp.delete(id);
      visited.add(id);
      result.push(id);
    };

    for (const id of this.modules.keys()) {
      if (!visited.has(id)) {
        visit(id);
      }
    }

    return result;
  }
}

// Export singleton instance
export const moduleRegistry = new ModuleRegistry();

// Also export class for testing purposes
export { ModuleRegistry };

