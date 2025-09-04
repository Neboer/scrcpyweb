import { RequestHandler } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const exists = (path: string) => fs.promises.access(path).then(() => true).catch(() => false);

interface SavedDevice {
    id: string;
    name: string;
    host: string;
    port: number;
    lastConnected?: string;
}

export class DeviceConfigManager {
    private static CONFIG_DIR = '/ws-scrcpy';
    private static CONFIG_FILE = 'devices.json';
    private static CONFIG_PATH = path.join(DeviceConfigManager.CONFIG_DIR, DeviceConfigManager.CONFIG_FILE);

    private static async ensureConfigDir(): Promise<void> {
        const dirExists = await exists(DeviceConfigManager.CONFIG_DIR);
        if (!dirExists) {
            await mkdir(DeviceConfigManager.CONFIG_DIR, { recursive: true });
        }
    }

    private static async readConfig(): Promise<SavedDevice[]> {
        try {
            await DeviceConfigManager.ensureConfigDir();
            const fileExists = await exists(DeviceConfigManager.CONFIG_PATH);
            if (!fileExists) {
                return [];
            }
            const data = await readFile(DeviceConfigManager.CONFIG_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Failed to read device config:', error);
            return [];
        }
    }

    private static async writeConfig(devices: SavedDevice[]): Promise<void> {
        try {
            await DeviceConfigManager.ensureConfigDir();
            await writeFile(DeviceConfigManager.CONFIG_PATH, JSON.stringify(devices, null, 2));
        } catch (error) {
            console.error('Failed to write device config:', error);
            throw error;
        }
    }

    public static getDevices: RequestHandler = async (req, res) => {
        try {
            const devices = await DeviceConfigManager.readConfig();
            res.json(devices);
        } catch (error) {
            res.status(500).json({ error: 'Failed to read device configuration' });
        }
    };

    public static saveDevices: RequestHandler = async (req, res) => {
        try {
            const devices = req.body;
            if (!Array.isArray(devices)) {
                return res.status(400).json({ error: 'Invalid device list format' });
            }
            await DeviceConfigManager.writeConfig(devices);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to save device configuration' });
        }
    };

    public static addDevice: RequestHandler = async (req, res) => {
        try {
            const device: SavedDevice = req.body;
            if (!device.name || !device.host || typeof device.port !== 'number') {
                return res.status(400).json({ error: 'Invalid device format' });
            }

            const devices = await DeviceConfigManager.readConfig();
            device.id = device.id || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            device.lastConnected = new Date().toISOString();
            
            devices.push(device);
            await DeviceConfigManager.writeConfig(devices);
            
            res.json(device);
        } catch (error) {
            res.status(500).json({ error: 'Failed to add device' });
        }
    };

    public static removeDevice: RequestHandler = async (req, res) => {
        try {
            const { id } = req.params;
            const devices = await DeviceConfigManager.readConfig();
            const filteredDevices = devices.filter(d => d.id !== id);
            
            if (devices.length === filteredDevices.length) {
                return res.status(404).json({ error: 'Device not found' });
            }
            
            await DeviceConfigManager.writeConfig(filteredDevices);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to remove device' });
        }
    };

    public static updateDevice: RequestHandler = async (req, res) => {
        try {
            const { id } = req.params;
            const update: Partial<SavedDevice> = req.body;
            
            const devices = await DeviceConfigManager.readConfig();
            const deviceIndex = devices.findIndex(d => d.id === id);
            
            if (deviceIndex === -1) {
                return res.status(404).json({ error: 'Device not found' });
            }
            
            devices[deviceIndex] = { ...devices[deviceIndex], ...update };
            await DeviceConfigManager.writeConfig(devices);
            
            res.json(devices[deviceIndex]);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update device' });
        }
    };
}