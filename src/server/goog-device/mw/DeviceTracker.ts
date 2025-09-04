import WS from 'ws';
import { Mw, RequestParameters } from '../../mw/Mw';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import { ControlCenter } from '../services/ControlCenter';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { DeviceTrackerEvent } from '../../../types/DeviceTrackerEvent';
import { DeviceTrackerEventList } from '../../../types/DeviceTrackerEventList';
import { Multiplexer } from '../../../packages/multiplexer/Multiplexer';
import { ChannelCode } from '../../../common/ChannelCode';

export class DeviceTracker extends Mw {
    public static readonly TAG = 'DeviceTracker';
    public static readonly type = 'android';
    private adt: ControlCenter = ControlCenter.getInstance();
    private readonly id: string;

    public static processChannel(ws: Multiplexer, code: string): Mw | undefined {
        if (code !== ChannelCode.GTRC) {
            return;
        }
        return new DeviceTracker(ws);
    }

    public static processRequest(ws: WS, params: RequestParameters): DeviceTracker | undefined {
        if (params.action !== ACTION.GOOG_DEVICE_LIST) {
            return;
        }
        return new DeviceTracker(ws);
    }

    constructor(ws: WS | Multiplexer) {
        super(ws);

        this.id = this.adt.getId();
        this.adt
            .init()
            .then(() => {
                this.adt.on('device', this.sendDeviceMessage);
                this.adt.on('device-removed', this.onDeviceRemoved);
                this.buildAndSendMessage(this.adt.getDevices());
            })
            .catch((error: Error) => {
                console.error(`[${DeviceTracker.TAG}] Error: ${error.message}`);
            });
    }

    private sendDeviceMessage = (device: GoogDeviceDescriptor): void => {
        const data: DeviceTrackerEvent<GoogDeviceDescriptor> = {
            device,
            id: this.id,
            name: this.adt.getName(),
        };
        this.sendMessage({
            id: -1,
            type: 'device',
            data,
        });
    };

    private buildAndSendMessage = (list: GoogDeviceDescriptor[]): void => {
        const data: DeviceTrackerEventList<GoogDeviceDescriptor> = {
            list,
            id: this.id,
            name: this.adt.getName(),
        };
        this.sendMessage({
            id: -1,
            type: 'devicelist',
            data,
        });
    };

    private onDeviceRemoved = (udid: string): void => {
        console.log(`[${DeviceTracker.TAG}] Device removed: ${udid}, sending updated device list`);
        // Send the updated device list to all clients
        this.buildAndSendMessage(this.adt.getDevices());
    };

    protected async onSocketMessage(event: WS.MessageEvent): Promise<void> {
        try {
            const data = event.data.toString();
            const parsed = JSON.parse(data);
            
            // Handle ADD_DEVICE message
            if (parsed.type === 'ADD_DEVICE' && parsed.data?.host && parsed.data?.port) {
                const { host, port } = parsed.data;
                console.log(`[${DeviceTracker.TAG}] Received ADD_DEVICE request for ${host}:${port}`);
                
                // Use ADB to connect to the device
                const connectAddress = `${host}:${port}`;
                
                // Import AdbExtended to create a client
                const { AdbExtended } = await import('../adb');
                const adbClient = AdbExtended.createClient();
                
                adbClient.connect(connectAddress)
                    .then((udid: string) => {
                        console.log(`[${DeviceTracker.TAG}] Successfully connected to device at ${connectAddress}, udid: ${udid}`);
                        
                        // Send success response
                        this.sendMessage({
                            id: parsed.id || -1,
                            type: 'ADD_DEVICE_RESULT',
                            data: {
                                success: true,
                                udid: udid,
                                host: host,
                                port: port,
                                message: `Successfully connected to device at ${connectAddress}`
                            }
                        });
                    })
                    .catch((error: any) => {
                        console.error(`[${DeviceTracker.TAG}] Failed to connect to device at ${connectAddress}: ${error.message}`);
                        
                        // Send error response
                        this.sendMessage({
                            id: parsed.id || -1,
                            type: 'ADD_DEVICE_RESULT',
                            data: {
                                success: false,
                                host: host,
                                port: port,
                                message: `Failed to connect: ${error.message}`
                            }
                        });
                    });
                return;
            }
            
            // Handle DELETE_DEVICE message
            if (parsed.type === 'DELETE_DEVICE' && parsed.data?.udid) {
                const udid = parsed.data.udid;
                console.log(`[${DeviceTracker.TAG}] Received DELETE_DEVICE request for udid: ${udid}`);
                
                // Get the device
                const device = this.adt.getDevice(udid);
                if (device) {
                    // First disconnect/kill any running server
                    const killServerPromise = device.descriptor.pid !== -1 
                        ? device.killServer(device.descriptor.pid)
                        : Promise.resolve();
                    
                    killServerPromise
                        .then(async () => {
                            if (device.descriptor.pid !== -1) {
                                console.log(`[${DeviceTracker.TAG}] Server killed for device ${udid}`);
                            }
                            
                            // Disconnect from ADB
                            const { AdbExtended } = await import('../adb');
                            const adbClient = AdbExtended.createClient();
                            
                            try {
                                await adbClient.disconnect(udid);
                                console.log(`[${DeviceTracker.TAG}] ADB disconnected from device ${udid}`);
                            } catch (error: any) {
                                console.warn(`[${DeviceTracker.TAG}] ADB disconnect warning: ${error.message}`);
                                // Continue even if disconnect fails, as device might already be disconnected
                            }
                            
                            // Remove device from ControlCenter
                            this.adt.removeDevice(udid);
                            console.log(`[${DeviceTracker.TAG}] Device ${udid} removed from ControlCenter`);
                            
                            // Send success response
                            this.sendMessage({
                                id: parsed.id || -1,
                                type: 'DELETE_DEVICE_RESULT',
                                data: {
                                    success: true,
                                    udid: udid,
                                    message: 'Device disconnected and removed successfully'
                                }
                            });
                        })
                        .catch((error: any) => {
                            console.error(`[${DeviceTracker.TAG}] Failed to disconnect device ${udid}: ${error.message}`);
                            // Send error response
                            this.sendMessage({
                                id: parsed.id || -1,
                                type: 'DELETE_DEVICE_RESULT',
                                data: {
                                    success: false,
                                    udid: udid,
                                    message: `Failed to disconnect device: ${error.message}`
                                }
                            });
                        });
                } else {
                    // Device not found
                    this.sendMessage({
                        id: parsed.id || -1,
                        type: 'DELETE_DEVICE_RESULT',
                        data: {
                            success: false,
                            udid: udid,
                            message: 'Device not found'
                        }
                    });
                }
                return;
            }
            
            // Handle other messages as ControlCenterCommand
            const command = ControlCenterCommand.fromJSON(data);
            this.adt.runCommand(command).catch((e) => {
                console.error(`[${DeviceTracker.TAG}], Received message: ${event.data}. Error: ${e.message}`);
            });
        } catch (error: any) {
            console.error(`[${DeviceTracker.TAG}], Received message: ${event.data}. Error: ${error?.message}`);
            return;
        }
    }

    public release(): void {
        super.release();
        this.adt.off('device', this.sendDeviceMessage);
        this.adt.off('device-removed', this.onDeviceRemoved);
    }
}
