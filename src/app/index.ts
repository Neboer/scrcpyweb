import '../style/app.css';
import '../style/modern-ui.css';
import { StreamClientScrcpy } from './googDevice/client/StreamClientScrcpy';
import { HostTracker } from './client/HostTracker';
import { Tool } from './client/Tool';
import { QuickConnect } from './ui/QuickConnect';
import './ui/ConfirmDialog';

window.onload = async function (): Promise<void> {
    const hash = location.hash.replace(/^#!/, '');
    const parsedQuery = new URLSearchParams(hash);
    const action = parsedQuery.get('action');

    /// #if USE_BROADWAY
    const { BroadwayPlayer } = await import('./player/BroadwayPlayer');
    StreamClientScrcpy.registerPlayer(BroadwayPlayer);
    /// #endif

    /// #if USE_H264_CONVERTER
    const { MsePlayer } = await import('./player/MsePlayer');
    StreamClientScrcpy.registerPlayer(MsePlayer);
    /// #endif

    /// #if USE_TINY_H264
    const { TinyH264Player } = await import('./player/TinyH264Player');
    StreamClientScrcpy.registerPlayer(TinyH264Player);
    /// #endif

    /// #if USE_WEBCODECS
    const { WebCodecsPlayer } = await import('./player/WebCodecsPlayer');
    StreamClientScrcpy.registerPlayer(WebCodecsPlayer);
    /// #endif

    if (action === StreamClientScrcpy.ACTION && typeof parsedQuery.get('udid') === 'string') {
        StreamClientScrcpy.start(parsedQuery);
        return;
    }

    /// #if INCLUDE_APPL
    {
        const { DeviceTracker } = await import('./applDevice/client/DeviceTracker');

        /// #if USE_QVH_SERVER
        const { StreamClientQVHack } = await import('./applDevice/client/StreamClientQVHack');

        DeviceTracker.registerTool(StreamClientQVHack);

        /// #if USE_WEBCODECS
        const { WebCodecsPlayer } = await import('./player/WebCodecsPlayer');
        StreamClientQVHack.registerPlayer(WebCodecsPlayer);
        /// #endif

        /// #if USE_H264_CONVERTER
        const { MsePlayerForQVHack } = await import('./player/MsePlayerForQVHack');
        StreamClientQVHack.registerPlayer(MsePlayerForQVHack);
        /// #endif

        if (action === StreamClientQVHack.ACTION && typeof parsedQuery.get('udid') === 'string') {
            StreamClientQVHack.start(StreamClientQVHack.parseParameters(parsedQuery));
            return;
        }
        /// #endif

        /// #if USE_WDA_MJPEG_SERVER
        const { StreamClientMJPEG } = await import('./applDevice/client/StreamClientMJPEG');
        DeviceTracker.registerTool(StreamClientMJPEG);

        const { MjpegPlayer } = await import('./player/MjpegPlayer');
        StreamClientMJPEG.registerPlayer(MjpegPlayer);

        if (action === StreamClientMJPEG.ACTION && typeof parsedQuery.get('udid') === 'string') {
            StreamClientMJPEG.start(StreamClientMJPEG.parseParameters(parsedQuery));
            return;
        }
        /// #endif
    }
    /// #endif

    const tools: Tool[] = [];

    /// #if INCLUDE_ADB_SHELL
    const { ShellClient } = await import('./googDevice/client/ShellClient');
    if (action === ShellClient.ACTION && typeof parsedQuery.get('udid') === 'string') {
        ShellClient.start(ShellClient.parseParameters(parsedQuery));
        return;
    }
    tools.push(ShellClient);
    /// #endif

    /// #if INCLUDE_DEV_TOOLS
    const { DevtoolsClient } = await import('./googDevice/client/DevtoolsClient');
    if (action === DevtoolsClient.ACTION) {
        DevtoolsClient.start(DevtoolsClient.parseParameters(parsedQuery));
        return;
    }
    tools.push(DevtoolsClient);
    /// #endif

    /// #if INCLUDE_FILE_LISTING
    const { FileListingClient } = await import('./googDevice/client/FileListingClient');
    if (action === FileListingClient.ACTION) {
        FileListingClient.start(FileListingClient.parseParameters(parsedQuery));
        return;
    }
    tools.push(FileListingClient);
    /// #endif

    if (tools.length) {
        const { DeviceTracker } = await import('./googDevice/client/DeviceTracker');
        tools.forEach((tool) => {
            DeviceTracker.registerTool(tool);
        });
    }
    
    // Initialize Quick Connect panel
    const quickConnect = QuickConnect.getInstance();
    
    // Create toggle button for Quick Connect
    const toggleButton = document.createElement('div');
    toggleButton.className = 'toggle-switch';
    toggleButton.innerHTML = `
        <button class="toggle-btn" onclick="QuickConnect.getInstance().toggle()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zm-1-6h-3V8h-2v5H8l4 4 4-4z"/>
            </svg>
            快速连接
        </button>
    `;
    document.body.appendChild(toggleButton);
    
    // Mount Quick Connect panel
    quickConnect.mount(document.body);
    
    // Handle quick connect events
    quickConnect.on('connect', async (device) => {
        console.log('Connecting to device:', device);
        
        // Use the DeviceTracker class to find android trackers
        const { DeviceTracker } = await import('./googDevice/client/DeviceTracker');
        
        // Try to find an existing android device tracker instance
        let androidTracker: any = null;
        
        // Access the static map of instances
        const instances = (DeviceTracker as any).instancesByUrl;
        if (instances && instances.size > 0) {
            // Get the first android device tracker
            androidTracker = instances.values().next().value;
        }
        
        if (androidTracker && androidTracker.ws && androidTracker.ws.readyState === WebSocket.OPEN) {
            // Generate a unique message ID
            const messageId = Date.now();
            
            // Send ADD_DEVICE message to backend
            const message = {
                id: messageId,
                type: 'ADD_DEVICE',
                data: {
                    host: device.host,
                    port: device.port
                }
            };
            
            // Store a callback for this message ID
            const handleResponse = (event: MessageEvent) => {
                try {
                    const response = JSON.parse(event.data);
                    if (response.type === 'ADD_DEVICE_RESULT' && response.id === messageId) {
                        // Remove the listener
                        androidTracker.ws.removeEventListener('message', handleResponse);
                        
                        // Handle the response
                        if (response.data.success) {
                            quickConnect.handleConnectionResult(true, 
                                `成功连接到设备: ${response.data.host}:${response.data.port}`);
                        } else {
                            quickConnect.handleConnectionResult(false, response.data.message);
                        }
                    }
                } catch (error) {
                    console.error('Failed to parse response:', error);
                }
            };
            
            // Add response listener
            androidTracker.ws.addEventListener('message', handleResponse);
            
            // Send the message
            androidTracker.ws.send(JSON.stringify(message));
            
            // Set a timeout to remove the listener if no response
            setTimeout(() => {
                androidTracker.ws.removeEventListener('message', handleResponse);
                quickConnect.handleConnectionResult(false, '连接超时，请重试');
            }, 30000); // 30 second timeout
        } else {
            quickConnect.handleConnectionResult(false, '设备跟踪器未连接，请稍后再试');
        }
    });
    
    HostTracker.start();
};
