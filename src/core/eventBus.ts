/**
 * Event Bus for inter-module communication
 * Implements a publish-subscribe pattern for loose coupling between modules
 */

import { EventType, IEventPayloads } from './types';

type EventCallback<T extends EventType> = (payload: IEventPayloads[T]) => void;

interface ISubscription {
  eventType: EventType;
  callback: EventCallback<EventType>;
  once: boolean;
}

/**
 * EventBus class for managing events across modules
 */
class EventBus {
  private subscribers: Map<EventType, Set<ISubscription>> = new Map();
  private eventHistory: Map<EventType, IEventPayloads[EventType]> = new Map();

  /**
   * Subscribe to an event
   * @param eventType - Type of event to subscribe to
   * @param callback - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on<T extends EventType>(eventType: T, callback: EventCallback<T>): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    const subscription: ISubscription = {
      eventType,
      callback: callback as EventCallback<EventType>,
      once: false,
    };

    this.subscribers.get(eventType)!.add(subscription);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(eventType)?.delete(subscription);
    };
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first call)
   * @param eventType - Type of event to subscribe to
   * @param callback - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  once<T extends EventType>(eventType: T, callback: EventCallback<T>): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    const subscription: ISubscription = {
      eventType,
      callback: callback as EventCallback<EventType>,
      once: true,
    };

    this.subscribers.get(eventType)!.add(subscription);

    return () => {
      this.subscribers.get(eventType)?.delete(subscription);
    };
  }

  /**
   * Emit an event to all subscribers
   * @param eventType - Type of event to emit
   * @param payload - Data to pass to subscribers
   */
  emit<T extends EventType>(eventType: T, payload: IEventPayloads[T]): void {
    // Store in history for late subscribers
    this.eventHistory.set(eventType, payload);

    const subscriptions = this.subscribers.get(eventType);
    if (!subscriptions) {
      return;
    }

    const toRemove: ISubscription[] = [];

    subscriptions.forEach((subscription) => {
      try {
        subscription.callback(payload);
        if (subscription.once) {
          toRemove.push(subscription);
        }
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error);
      }
    });

    // Remove one-time subscriptions
    toRemove.forEach((sub) => subscriptions.delete(sub));
  }

  /**
   * Get the last emitted payload for an event type
   * @param eventType - Type of event
   * @returns Last payload or undefined
   */
  getLastPayload<T extends EventType>(eventType: T): IEventPayloads[T] | undefined {
    return this.eventHistory.get(eventType) as IEventPayloads[T] | undefined;
  }

  /**
   * Remove all subscribers for a specific event type
   * @param eventType - Type of event to clear
   */
  clear(eventType: EventType): void {
    this.subscribers.delete(eventType);
  }

  /**
   * Remove all subscribers for all events
   */
  clearAll(): void {
    this.subscribers.clear();
    this.eventHistory.clear();
  }

  /**
   * Get number of subscribers for an event type
   * @param eventType - Type of event
   * @returns Number of subscribers
   */
  subscriberCount(eventType: EventType): number {
    return this.subscribers.get(eventType)?.size ?? 0;
  }
}

// Export singleton instance
export const eventBus = new EventBus();

// Also export class for testing purposes
export { EventBus };

