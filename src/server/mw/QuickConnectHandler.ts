import { RequestHandler } from 'express';
import { spawn } from 'child_process';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface ConnectRequest {
    name: string;
    host: string;
    port: number;
}

interface ConnectResponse {
    success: boolean;
    deviceId?: string;
    error?: string;
}

export class QuickConnectHandler {
    private static activeConnections: Map<string, any> = new Map();

    /**
     * Connect to a device using ADB
     */
    public static connectDevice: RequestHandler = async (req, res) => {
        const { name, host, port }: ConnectRequest = req.body;

        if (!name || !host || typeof port !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Invalid request: name, host, and port are required'
            } as ConnectResponse);
        }

        const deviceId = uuidv4();
        const adbAddress = `${host}:${port}`;

        try {
            // First, try to connect using adb connect
            await QuickConnectHandler.executeAdbCommand(['connect', adbAddress]);
            
            // Get device info
            const devices = await QuickConnectHandler.getConnectedDevices();
            const device = devices.find(d => d.address === adbAddress);
            
            if (!device) {
                throw new Error('Device connection failed');
            }

            // Store the connection info
            QuickConnectHandler.activeConnections.set(deviceId, {
                name,
                host,
                port,
                adbAddress,
                serialNumber: device.serialNumber,
                connectedAt: new Date()
            });

            res.json({
                success: true,
                deviceId,
            } as ConnectResponse);
        } catch (error) {
            console.error('Failed to connect device:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Connection failed'
            } as ConnectResponse);
        }
    };

    /**
     * Disconnect a device
     */
    public static disconnectDevice: RequestHandler = async (req, res) => {
        const { deviceId } = req.params;
        const connection = QuickConnectHandler.activeConnections.get(deviceId);

        if (!connection) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        try {
            await QuickConnectHandler.executeAdbCommand(['disconnect', connection.adbAddress]);
            QuickConnectHandler.activeConnections.delete(deviceId);
            
            res.json({ success: true });
        } catch (error) {
            console.error('Failed to disconnect device:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Disconnection failed'
            });
        }
    };

    /**
     * Get list of active connections
     */
    public static getActiveConnections: RequestHandler = (req, res) => {
        const connections = Array.from(QuickConnectHandler.activeConnections.entries()).map(([id, info]) => ({
            id,
            ...info
        }));
        
        res.json(connections);
    };

    /**
     * Execute an ADB command
     */
    private static executeAdbCommand(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const adb = spawn('adb', args);
            let stdout = '';
            let stderr = '';

            adb.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            adb.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            adb.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `ADB command failed with code ${code}`));
                } else {
                    resolve(stdout);
                }
            });

            adb.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Get list of connected devices
     */
    private static async getConnectedDevices(): Promise<Array<{ serialNumber: string; address: string; state: string }>> {
        const output = await QuickConnectHandler.executeAdbCommand(['devices', '-l']);
        const lines = output.split('\n').filter(line => line.trim());
        const devices: Array<{ serialNumber: string; address: string; state: string }> = [];

        // Skip the first line (List of devices attached)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const [serialNumber, state] = line.split(/\s+/);
                devices.push({
                    serialNumber,
                    address: serialNumber.includes(':') ? serialNumber : 'usb',
                    state
                });
            }
        }

        return devices;
    }

    /**
     * Initialize auto-connect for saved devices on startup
     */
    public static async autoConnectSavedDevices(): Promise<void> {
        try {
            const { DeviceConfigManager } = await import('./DeviceConfigManager');
            const savedDevices = await (DeviceConfigManager as any).readConfig();
            
            console.log('Auto-connecting saved devices...');
            
            for (const device of savedDevices) {
                try {
                    const adbAddress = `${device.host}:${device.port}`;
                    await QuickConnectHandler.executeAdbCommand(['connect', adbAddress]);
                    console.log(`Connected to ${device.name} (${adbAddress})`);
                } catch (error) {
                    console.error(`Failed to connect to ${device.name}:`, error);
                }
            }
        } catch (error) {
            console.error('Failed to auto-connect saved devices:', error);
        }
    }
}