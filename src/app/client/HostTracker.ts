import { ManagerClient } from './ManagerClient';
import { Message } from '../../types/Message';
import { MessageError, MessageHosts, MessageType } from '../../common/HostTrackerMessage';
import { ACTION } from '../../common/Action';
import { DeviceTracker as GoogDeviceTracker } from '../googDevice/client/DeviceTracker';
import { DeviceTracker as ApplDeviceTracker } from '../applDevice/client/DeviceTracker';
import { ParamsBase } from '../../types/ParamsBase';
import { HostItem } from '../../types/Configuration';
import { ChannelCode } from '../../common/ChannelCode';

const TAG = '[HostTracker]';

export interface HostTrackerEvents {
    // hosts: HostItem[];
    disconnected: CloseEvent;
    error: string;
}

export class HostTracker extends ManagerClient<ParamsBase, HostTrackerEvents> {
    private static instance?: HostTracker;

    public static start(): void {
        this.getInstance();
    }

    public static getInstance(): HostTracker {
        if (!this.instance) {
            this.instance = new HostTracker();
        }
        return this.instance;
    }

    private trackers: Array<GoogDeviceTracker | ApplDeviceTracker> = [];

    constructor() {
        super({ action: ACTION.LIST_HOSTS });
        this.openNewConnection();
        if (this.ws) {
            this.ws.binaryType = 'arraybuffer';
        }
    }

    protected onSocketClose(ev: CloseEvent): void {
        console.log(TAG, `WS closed. Code: ${ev.code}, Reason: ${ev.reason || 'No reason provided'}`);
        this.emit('disconnected', ev);
        
        // Auto-retry connection after 3 seconds for certain close codes
        if (ev.code !== 1000) { // 1000 is normal closure
            console.log(TAG, 'Attempting to reconnect in 3 seconds...');
            setTimeout(() => {
                if (!this.destroyed) {
                    console.log(TAG, 'Reconnecting...');
                    this.openNewConnection();
                }
            }, 3000);
        }
    }

    protected onSocketMessage(event: MessageEvent): void {
        let message: Message;
        try {
            // TODO: rewrite to binary
            message = JSON.parse(event.data);
            console.log(TAG, 'Received message:', message.type, message.data);
        } catch (error: any) {
            console.error(TAG, 'Failed to parse message:', error.message);
            console.log(TAG, 'Raw data:', event.data);
            return;
        }
        switch (message.type) {
            case MessageType.ERROR: {
                const msg = message as MessageError;
                console.error(TAG, 'Server error:', msg.data);
                this.emit('error', msg.data);
                break;
            }
            case MessageType.HOSTS: {
                const msg = message as MessageHosts;
                console.log(TAG, 'Hosts data:', msg.data);
                // this.emit('hosts', msg.data);
                if (msg.data.local) {
                    console.log(TAG, 'Processing local hosts:', msg.data.local);
                    msg.data.local.forEach(({ type }) => {
                        console.log(TAG, `Starting tracker for type: ${type}`);
                        const secure = location.protocol === 'https:';
                        const port = location.port ? parseInt(location.port, 10) : secure ? 443 : 80;
                        const { hostname, pathname } = location;
                        if (type !== 'android' && type !== 'ios') {
                            console.warn(TAG, `Unsupported host type: "${type}"`);
                            return;
                        }
                        const hostItem: HostItem = { useProxy: false, secure, port, hostname, pathname, type };
                        this.startTracker(hostItem);
                    });
                } else {
                    console.log(TAG, 'No local hosts found');
                }
                if (msg.data.remote) {
                    console.log(TAG, 'Processing remote hosts:', msg.data.remote);
                    msg.data.remote.forEach((item) => this.startTracker(item));
                } else {
                    console.log(TAG, 'No remote hosts found');
                }
                break;
            }
            default:
                console.log(TAG, `Unknown message type: ${message.type}`);
        }
    }

    private startTracker(hostItem: HostItem): void {
        switch (hostItem.type) {
            case 'android':
                this.trackers.push(GoogDeviceTracker.start(hostItem));
                break;
            case 'ios':
                this.trackers.push(ApplDeviceTracker.start(hostItem));
                break;
            default:
                console.warn(TAG, `Unsupported host type: "${hostItem.type}"`);
        }
    }

    protected onSocketOpen(): void {
        console.log(TAG, 'WebSocket connection opened successfully');
        // Request host list immediately after connection
        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            console.log(TAG, 'Requesting host list...');
            // The HostTracker doesn't seem to need to send any initial message
            // as the server should send the hosts list automatically
        }
    }

    public destroy(): void {
        super.destroy();
        this.trackers.forEach((tracker) => {
            tracker.destroy();
        });
        this.trackers.length = 0;
    }

    protected supportMultiplexing(): boolean {
        return true;
    }

    protected getChannelInitData(): Buffer {
        const buffer = Buffer.alloc(4);
        buffer.write(ChannelCode.HSTS, 'ascii');
        return buffer;
    }
}
