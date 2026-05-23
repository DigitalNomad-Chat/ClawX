import { EventEmitter } from 'events';
import { MemberEvent } from './types';

class MemberEventBus extends EventEmitter {
  emit(event: MemberEvent, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
  on(event: MemberEvent, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
  off(event: MemberEvent, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}

export const memberEventBus = new MemberEventBus();
