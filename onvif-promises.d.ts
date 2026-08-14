declare module 'onvif/promises' {
  export class Cam {
    constructor(options: Record<string, unknown>);
    connect(): Promise<void>;
    getDeviceInformation(): Promise<any>;
    getStatus(options?: Record<string, unknown>): Promise<any>;
    continuousMove(options: Record<string, unknown>): Promise<void>;
    stop(options?: Record<string, unknown>): Promise<void>;
    gotoHomePosition(options?: Record<string, unknown>): Promise<void>;
  }
}
